import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api';
import { PRODUCTION_URL } from '@/lib/server-config';

export type TipoPlano = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'avaliacao' | 'demo';
export type TipoNivel = 'prata' | 'ouro' | 'rubi';

export interface CodigoAtivacao {
  id: string;
  codigo: string;
  plano: TipoPlano;
  nivel: TipoNivel;
  diasValidade: number;
  precoPorAluno: number;
  totalAlunos: number;
  valorTotal: number;
  creditoAplicado: number;
  valorFinal: number;
  saldoCreditos: number;
  dataGeracao: string;
  dataExpiracaoCodigo: string;
  usado: boolean;
  usadoPor?: string;
  usadoEm?: string;
  notas?: string;
}

export interface LicencaAtiva {
  codigoUsado: string;
  plano: TipoPlano;
  nivel: TipoNivel;
  dataAtivacao: string;
  dataExpiracao: string;
  saldo: number;
  saldoCreditoAcumulado: number;
  escolaNome: string;
}

interface LicenseContextValue {
  licenca: LicencaAtiva | null;
  codigosGerados: CodigoAtivacao[];
  isLicencaValida: boolean;
  diasRestantes: number;
  isLoading: boolean;
  ativarLicenca: (codigo: string, escolaNome: string) => Promise<{ sucesso: boolean; mensagem: string; historicoId?: string | null; reciboUrl?: string | null }>;
  gerarCodigo: (
    plano: TipoPlano,
    nivel: TipoNivel,
    precoPorAluno: number,
    totalAlunos: number,
    creditoAplicado: number,
    notas?: string
  ) => Promise<CodigoAtivacao>;
  revogarCodigo: (id: string) => Promise<void>;
  adicionarSaldo: (valor: number) => Promise<void>;
  consumirSaldo: (valor: number) => Promise<boolean>;
  adicionarCreditoAcumulado: (valor: number) => Promise<void>;
  isFeatureAvailableForNivel: (key: string) => boolean;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

const STORAGE_LICENCA = '@siga_licenca';
const STORAGE_CODIGOS = '@siga_codigos_ceo';

export const PLANO_DIAS: Record<TipoPlano, number> = {
  demo: 5,
  avaliacao: 30,
  mensal: 30,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

export const PLANO_LABEL: Record<TipoPlano, string> = {
  demo: 'Demo',
  avaliacao: 'Avaliação',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

// NOTA: Os nomes mostrados ao utilizador são "Premium", "Golden" e "Ruby".
// As chaves internas (prata/ouro/rubi) permanecem para preservar compatibilidade
// com a base de dados e códigos de activação já emitidos.
export const NIVEL_LABEL: Record<TipoNivel, string> = {
  prata: 'Premium',
  ouro: 'Golden',
  rubi: 'Ruby',
};

export const NIVEL_COLOR: Record<TipoNivel, string> = {
  prata: '#7C8FA8',
  ouro: '#F59E0B',
  rubi: '#DC2626',
};

export const NIVEL_EMOJI: Record<TipoNivel, string> = {
  prata: '⭐',
  ouro: '🥇',
  rubi: '💎',
};

export const NIVEL_DESC: Record<TipoNivel, string> = {
  prata: 'Pacote Premium — gestão académica essencial para escolas em arranque',
  ouro: 'Pacote Golden — funcionalidades intermédias com financeiro e RH',
  rubi: 'Pacote Ruby — acesso completo a todas as funcionalidades',
};

export const PRECO_POR_ALUNO_DEFAULT = 50;

// Preço base por aluno/mês para cada nível (em AOA).
// O desconto de volume (escalões) aplica-se em cima destes valores.
export const NIVEL_PRECO_POR_ALUNO: Record<TipoNivel, number> = {
  prata: 30,
  ouro: 50,
  rubi: 75,
};

export const NIVEL_FEATURES: Record<TipoNivel, string[]> = {
  prata: [
    'dashboard',
    'alunos',
    'professores',
    'turmas',
    'salas',
    'notas',
    'presencas',
    'horario',
    'secretaria_hub',
    'admissao',
    'editor_documentos',
    'boletim_matricula',
    'boletim_propina',
    'notificacoes',
    'portal_estudante',
    'gestao_academica',
    'gerar_documento',
    'documentos_hub',
    'professor_hub',
    'professor_turmas',
    'professor_pauta',
    'professor_sumario',
    'professor_mensagens',
    'professor_materiais',
    'eventos',
    'portal_encarregado',
    'processos_secretaria',
    'solicitacoes_documentos',
    'arquivo_documentos',
    'gerir_avaliacoes',
    'organizar_turmas',
    'acta_provas',
    // Novas funcionalidades — plano prata
    'portaria',
    'boletins_secretaria',
    'pautas',
  ],
  ouro: [
    'dashboard',
    'alunos',
    'professores',
    'turmas',
    'salas',
    'notas',
    'presencas',
    'horario',
    'secretaria_hub',
    'admissao',
    'editor_documentos',
    'boletim_matricula',
    'boletim_propina',
    'notificacoes',
    'portal_estudante',
    'gestao_academica',
    'gerar_documento',
    'documentos_hub',
    'professor_hub',
    'professor_turmas',
    'professor_pauta',
    'professor_sumario',
    'professor_mensagens',
    'professor_materiais',
    'eventos',
    'portal_encarregado',
    'processos_secretaria',
    'solicitacoes_documentos',
    'arquivo_documentos',
    'gerir_avaliacoes',
    'ceo_dashboard',
    'financeiro',
    'pagamentos_hub',
    'extrato_propinas',
    'financeiro_relatorios',
    'validacao_financeira_documentos',
    'biblioteca',
    'biblioteca_gestao',
    'transferencias',
    'historico',
    'grelha',
    'disciplinas',
    'quadro_honra',
    'exclusoes_faltas',
    'diario_classe',
    'director_turma',
    'relatorio_faltas',
    'chat_interno',
    'calendario_academico',
    'bolsas',
    'desempenho',
    'visao_geral',
    'relatorios',
    'rh_hub',
    'pedagogico',
    'plano_aula',
    'avaliacao_professores',
    'trabalhos_finais',
    'funcionarios',
    'alterar_tipo_contrato',
    'organizar_turmas',
    'finalistas',
    'rh_faltas_tempos',
    'rupes_historico',
    'tesouraria',
    'acta_provas',
    'acompanhamento_pautas',
    'estudio_emissao',
    'centro_emissao',
    'consulta_aluno',
    // Novas funcionalidades — plano ouro
    'portaria',
    'boletins_secretaria',
    'pautas',
    'assistente',
    'saft',
  ],
  rubi: [
    'dashboard',
    'alunos',
    'professores',
    'turmas',
    'salas',
    'notas',
    'presencas',
    'horario',
    'secretaria_hub',
    'admissao',
    'editor_documentos',
    'boletim_matricula',
    'boletim_propina',
    'notificacoes',
    'portal_estudante',
    'gestao_academica',
    'gerar_documento',
    'documentos_hub',
    'professor_hub',
    'professor_turmas',
    'professor_pauta',
    'professor_sumario',
    'professor_mensagens',
    'professor_materiais',
    'eventos',
    'portal_encarregado',
    'processos_secretaria',
    'solicitacoes_documentos',
    'arquivo_documentos',
    'gerir_avaliacoes',
    'ceo_dashboard',
    'financeiro',
    'pagamentos_hub',
    'extrato_propinas',
    'financeiro_relatorios',
    'validacao_financeira_documentos',
    'biblioteca',
    'biblioteca_gestao',
    'transferencias',
    'historico',
    'grelha',
    'disciplinas',
    'quadro_honra',
    'exclusoes_faltas',
    'diario_classe',
    'director_turma',
    'relatorio_faltas',
    'chat_interno',
    'calendario_academico',
    'bolsas',
    'desempenho',
    'visao_geral',
    'relatorios',
    'rh_hub',
    'pedagogico',
    'plano_aula',
    'avaliacao_professores',
    'trabalhos_finais',
    'funcionarios',
    'alterar_tipo_contrato',
    'rh_controle',
    'rh_payroll',
    'auditoria',
    'gestao_acessos',
    'admin',
    'med_integracao',
    'gestao_planos',
    'organizar_turmas',
    'finalistas',
    'rh_faltas_tempos',
    'rupes_historico',
    'tesouraria',
    'acompanhamento_pautas',
    'estudio_emissao',
    'centro_emissao',
    'acta_provas',
    'consulta_aluno',
    // Novas funcionalidades — plano rubi (tudo do ouro +)
    'portaria',
    'boletins_secretaria',
    'pautas',
    'assistente',
    'saft',
    'sessoes_ativas',
    'configuracoes_sistema',
  ],
};

function genCodigo(nivel: TipoNivel): string {
  const prefixo = 'SIGA';
  const niv = nivel === 'prata' ? 'PRE' : nivel === 'ouro' ? 'GLD' : 'RBY';
  const rand =
    Math.random().toString(36).substring(2, 6).toUpperCase() +
    Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefixo}-${niv}-${rand}`;
}

function genCodigoDemo(): string {
  const rand1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const rand2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DEMO-${rand1}-${rand2}`;
}

// Analisa "YYYY-MM-DD" como data LOCAL (não UTC).
// new Date("YYYY-MM-DD") trata a string como UTC meia-noite, o que em fusos UTC+ faz
// recuar o dia local em 1 — causando contagens erradas. Este helper corrige isso.
function parseLocalDate(s: string): Date {
  const parts = s.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return new Date(y, m, d); // meia-noite no fuso LOCAL
}

function addDays(date: string, days: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diasAte(dataExpiracao: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // meia-noite LOCAL
  const exp = parseLocalDate(dataExpiracao); // meia-noite LOCAL — sem desvio de fuso
  return Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function toDateString(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  try {
    const d = new Date(v as any);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}

function mapServerCodigo(r: any): CodigoAtivacao {
  return {
    id: String(r.id),
    codigo: String(r.codigo),
    plano: r.plano as TipoPlano,
    nivel: (r.nivel as TipoNivel) || 'rubi',
    diasValidade: Number(r.diasValidade || 30),
    precoPorAluno: Number(r.precoPorAluno || 0),
    totalAlunos: Number(r.totalAlunos || 0),
    valorTotal: Number(r.valorTotal || 0),
    creditoAplicado: Number(r.creditoAplicado || 0),
    valorFinal: Number(r.valorFinal || 0),
    saldoCreditos: 0,
    dataGeracao: toDateString(r.dataGeracao) || toDateString(r.criadoEm) || today(),
    dataExpiracaoCodigo: toDateString(r.dataExpiracaoCodigo) || addDays(today(), 30),
    usado: !!r.usado,
    usadoPor: r.usadoPor ? String(r.usadoPor) : undefined,
    usadoEm: r.usadoEm ? toDateString(r.usadoEm) : undefined,
    notas: r.notas ? String(r.notas) : '',
  };
}

const LICENCA_AVALIACAO: LicencaAtiva = {
  codigoUsado: 'AVALIACAO',
  plano: 'avaliacao',
  nivel: 'rubi',
  dataAtivacao: today(),
  dataExpiracao: addDays(today(), 30),
  saldo: 100,
  saldoCreditoAcumulado: 0,
  escolaNome: '',
};

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [licenca, setLicenca] = useState<LicencaAtiva | null>(null);
  const [codigosGerados, setCodigosGerados] = useState<CodigoAtivacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [rawLic, rawCod] = await Promise.all([
        AsyncStorage.getItem(STORAGE_LICENCA),
        AsyncStorage.getItem(STORAGE_CODIGOS),
      ]);
      const codigosIniciais = rawCod ? JSON.parse(rawCod) : [];
      setCodigosGerados(codigosIniciais);
      if (!rawCod) await AsyncStorage.setItem(STORAGE_CODIGOS, JSON.stringify(codigosIniciais));

      // Tentar sincronizar com o servidor (apenas o CEO recebe a lista; outros recebem 403 e ignoramos).
      try {
        const remote = await api.get<any[]>('/api/licenca/codigos');
        if (Array.isArray(remote)) {
          const mapped: CodigoAtivacao[] = remote.map(r => mapServerCodigo(r));
          setCodigosGerados(mapped);
          await AsyncStorage.setItem(STORAGE_CODIGOS, JSON.stringify(mapped));
        }
      } catch { /* fallback silencioso para AsyncStorage */ }

      // Fonte de verdade: sempre buscar dados de expiração no servidor.
      // Isto garante que PC e telemóvel mostram exactamente os mesmos dias restantes.
      let licencaDoServidor: LicencaAtiva | null = null;
      try {
        const apiBase = process.env.EXPO_PUBLIC_API_URL
          ? process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '')
          : (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : PRODUCTION_URL);
        const configController = new AbortController();
        const configTimeout = setTimeout(() => configController.abort(), 5000);
        let res: Response;
        try {
          res = await fetch(`${apiBase}/api/config`, { signal: configController.signal });
        } finally {
          clearTimeout(configTimeout);
        }
        if (res.ok) {
          const config = await res.json();
          if (config.licencaAtivacao && config.licencaExpiracao) {
            licencaDoServidor = {
              codigoUsado: rawLic ? (JSON.parse(rawLic).codigoUsado || 'AVALIACAO') : 'AVALIACAO',
              plano: (config.licencaPlano as TipoPlano) || 'avaliacao',
              nivel: (config.licencaNivel as TipoNivel) || 'rubi',
              dataAtivacao: config.licencaAtivacao,
              dataExpiracao: config.licencaExpiracao,
              saldo: 100,
              saldoCreditoAcumulado: config.licencaSaldoCredito || 0,
              escolaNome: config.nomeEscola || '',
            };
          }
        }
      } catch { /* fallback para cache local */ }

      if (licencaDoServidor) {
        // Preservar o nome da escola do cache local se o servidor não tiver
        if (rawLic && !licencaDoServidor.escolaNome) {
          const licLocal: LicencaAtiva = JSON.parse(rawLic);
          licencaDoServidor.escolaNome = licLocal.escolaNome || '';
        }
        setLicenca(licencaDoServidor);
        await AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(licencaDoServidor));
        setIsLoading(false);
        return;
      }

      // Fallback: usar cache local se o servidor não estiver disponível
      if (rawLic) {
        const licLocal: LicencaAtiva = JSON.parse(rawLic);
        if (!licLocal.nivel) licLocal.nivel = 'rubi';
        if (!licLocal.saldoCreditoAcumulado) licLocal.saldoCreditoAcumulado = 0;
        setLicenca(licLocal);
        setIsLoading(false);
        return;
      }

      const licencaInicial = LICENCA_AVALIACAO;
      setLicenca(licencaInicial);
      await AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(licencaInicial));
    } catch (e) {
      console.error('LicenseContext load error', e);
      setLicenca(LICENCA_AVALIACAO);
    } finally {
      setIsLoading(false);
    }
  }

  const isLicencaValida = useMemo(() => {
    if (!licenca) return false;
    return diasAte(licenca.dataExpiracao) >= 0;
  }, [licenca]);

  const diasRestantes = useMemo(() => {
    if (!licenca) return 0;
    return Math.max(0, diasAte(licenca.dataExpiracao));
  }, [licenca]);

  function isFeatureAvailableForNivel(key: string): boolean {
    if (!licenca) return false;
    if (licenca.codigoUsado === 'AVALIACAO') return true;
    const nivel = licenca.nivel || 'rubi';
    return NIVEL_FEATURES[nivel]?.includes(key) ?? true;
  }

  async function ativarLicenca(codigo: string, escolaNome: string): Promise<{ sucesso: boolean; mensagem: string; historicoId?: string | null; reciboUrl?: string | null }> {
    const codigoLimpo = codigo.trim().toUpperCase();

    // 1) Caminho preferido: validar e activar no servidor (consome saldoCredito automaticamente).
    try {
      const resp = await api.post<{
        success: boolean; plano: TipoPlano; nivel: TipoNivel;
        dataAtivacao: string; dataExpiracao: string;
        creditoAplicado: number; saldoRestante: number;
        historicoId?: string | null; reciboUrl?: string | null;
      }>('/api/licenca/activar-codigo', { codigo: codigoLimpo });

      const novaLicenca: LicencaAtiva = {
        codigoUsado: codigoLimpo,
        plano: resp.plano,
        nivel: resp.nivel || 'rubi',
        dataAtivacao: resp.dataAtivacao,
        dataExpiracao: resp.dataExpiracao,
        saldo: 0,
        saldoCreditoAcumulado: resp.saldoRestante || 0,
        escolaNome,
      };
      await AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(novaLicenca));
      setLicenca(novaLicenca);

      const nivelLabel = NIVEL_LABEL[novaLicenca.nivel] || 'Rubi';
      const sufixoCred = (resp.creditoAplicado || 0) > 0
        ? ` Crédito aplicado: ${resp.creditoAplicado.toLocaleString('pt-AO')} Kz.`
        : '';
      return {
        sucesso: true,
        mensagem: `Licença activada! Plano ${nivelLabel} ${PLANO_LABEL[resp.plano]} — válida até ${resp.dataExpiracao}.${sufixoCred}`,
        historicoId: resp.historicoId || null,
        reciboUrl: resp.reciboUrl || null,
      };
    } catch (serverErr) {
      // 2) Fallback: validar localmente (códigos antigos só em AsyncStorage do CEO).
      const cod = codigosGerados.find(c => c.codigo === codigoLimpo);
      if (!cod) {
        const msg = (serverErr as Error)?.message || '';
        if (/inválido|inexistente|404/i.test(msg)) return { sucesso: false, mensagem: 'Código de activação inválido. Verifique e tente novamente.' };
        if (/utilizado|409/i.test(msg)) return { sucesso: false, mensagem: 'Este código já foi utilizado.' };
        if (/expirou|410/i.test(msg)) return { sucesso: false, mensagem: 'Este código expirou. Contacte o suporte QUETA.' };
        return { sucesso: false, mensagem: 'Código de activação inválido. Verifique e tente novamente.' };
      }
      if (cod.usado) return { sucesso: false, mensagem: 'Este código já foi utilizado.' };
      if (diasAte(cod.dataExpiracaoCodigo) < 0) return { sucesso: false, mensagem: 'Este código expirou. Contacte o suporte QUETA.' };

      const novaLicenca: LicencaAtiva = {
        codigoUsado: codigoLimpo,
        plano: cod.plano,
        nivel: cod.nivel || 'rubi',
        dataAtivacao: today(),
        dataExpiracao: addDays(today(), cod.diasValidade),
        saldo: cod.saldoCreditos,
        saldoCreditoAcumulado: 0,
        escolaNome,
      };

      const codigosActualizados = codigosGerados.map(c =>
        c.id === cod.id ? { ...c, usado: true, usadoPor: escolaNome, usadoEm: today() } : c
      );

      await Promise.all([
        AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(novaLicenca)),
        AsyncStorage.setItem(STORAGE_CODIGOS, JSON.stringify(codigosActualizados)),
      ]);
      setLicenca(novaLicenca);
      setCodigosGerados(codigosActualizados);

      const nivelLabel = NIVEL_LABEL[novaLicenca.nivel] || 'Rubi';
      return { sucesso: true, mensagem: `Licença activada! Plano ${nivelLabel} ${PLANO_LABEL[cod.plano]} — válida até ${novaLicenca.dataExpiracao}.` };
    }
  }

  async function gerarCodigo(
    plano: TipoPlano,
    nivel: TipoNivel,
    precoPorAluno: number,
    totalAlunos: number,
    creditoAplicado: number,
    notas?: string
  ): Promise<CodigoAtivacao> {
    const valorTotal = precoPorAluno * totalAlunos;
    const valorFinal = Math.max(0, valorTotal - creditoAplicado);
    const diasValidade = PLANO_DIAS[plano];
    const dataExpiracaoCodigo = addDays(today(), 30);
    const codigoLocal = genCodigo(nivel);

    // 1) Tentar gravar no servidor (fonte de verdade — partilhada entre CEO e parceiros).
    try {
      const remote = await api.post<any>('/api/licenca/codigos', {
        codigo: codigoLocal,
        plano, nivel, diasValidade,
        precoPorAluno, totalAlunos,
        valorTotal, creditoAplicado, valorFinal,
        dataExpiracaoCodigo,
        notas: notas || null,
      });
      const novo = mapServerCodigo(remote);
      const updated = [novo, ...codigosGerados];
      setCodigosGerados(updated);
      await AsyncStorage.setItem(STORAGE_CODIGOS, JSON.stringify(updated));
      return novo;
    } catch (e) {
      // 2) Fallback offline (apenas no dispositivo) — útil para demonstração / sem internet.
      console.warn('[gerarCodigo] servidor indisponível, gravando apenas localmente:', (e as Error).message);
      const novo: CodigoAtivacao = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
        codigo: codigoLocal,
        plano,
        nivel,
        diasValidade,
        precoPorAluno,
        totalAlunos,
        valorTotal,
        creditoAplicado,
        valorFinal,
        saldoCreditos: 0,
        dataGeracao: today(),
        dataExpiracaoCodigo,
        usado: false,
        notas: notas || '',
      };
      const updated = [novo, ...codigosGerados];
      setCodigosGerados(updated);
      await AsyncStorage.setItem(STORAGE_CODIGOS, JSON.stringify(updated));
      return novo;
    }
  }

  async function revogarCodigo(id: string) {
    // Tentar revogar no servidor (rejeita se já tiver sido usado).
    try {
      await api.delete<{ ok: boolean }>(`/api/licenca/codigos/${encodeURIComponent(id)}`);
    } catch (e) {
      const msg = (e as Error)?.message || '';
      // Se for 404 (código só existia localmente) deixamos passar; nos restantes casos propagamos.
      if (!/404/.test(msg)) throw e;
    }
    const updated = codigosGerados.filter(c => c.id !== id);
    setCodigosGerados(updated);
    await AsyncStorage.setItem(STORAGE_CODIGOS, JSON.stringify(updated));
  }

  async function adicionarSaldo(valor: number) {
    if (!licenca) return;
    const updated = { ...licenca, saldo: licenca.saldo + valor };
    setLicenca(updated);
    await AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(updated));
  }

  async function consumirSaldo(valor: number): Promise<boolean> {
    if (!licenca || licenca.saldo < valor) return false;
    const updated = { ...licenca, saldo: licenca.saldo - valor };
    setLicenca(updated);
    await AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(updated));
    return true;
  }

  async function adicionarCreditoAcumulado(valor: number) {
    if (!licenca) return;
    const updated = { ...licenca, saldoCreditoAcumulado: (licenca.saldoCreditoAcumulado || 0) + valor };
    setLicenca(updated);
    await AsyncStorage.setItem(STORAGE_LICENCA, JSON.stringify(updated));
  }

  const value = useMemo<LicenseContextValue>(() => ({
    licenca, codigosGerados, isLicencaValida, diasRestantes, isLoading,
    ativarLicenca, gerarCodigo, revogarCodigo, adicionarSaldo, consumirSaldo,
    adicionarCreditoAcumulado, isFeatureAvailableForNivel,
  }), [licenca, codigosGerados, isLicencaValida, diasRestantes, isLoading]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error('useLicense must be used within LicenseProvider');
  return ctx;
}

export { diasAte, today, addDays };
