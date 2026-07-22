import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth, getAuthToken } from './AuthContext';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type PermKey =
  | 'dashboard' | 'ceo_dashboard' | 'alunos' | 'professores' | 'turmas' | 'salas'
  | 'notas' | 'presencas' | 'horario' | 'historico' | 'grelha'
  | 'financeiro' | 'relatorios' | 'rh_controle' | 'admin'
  | 'editor_documentos' | 'secretaria_hub' | 'professor_hub'
  | 'professor_turmas' | 'professor_pauta' | 'professor_sumario'
  | 'professor_mensagens' | 'professor_materiais'
  | 'portal_estudante' | 'eventos' | 'notificacoes'
  | 'boletim_matricula' | 'boletim_propina' | 'gestao_academica'
  | 'gestao_acessos'
  | 'admissao' | 'disciplinas' | 'pedagogico' | 'desempenho'
  | 'visao_geral' | 'rh_hub' | 'portal_encarregado'
  | 'biblioteca' | 'transferencias' | 'avaliacao_professores' | 'chat_interno'
  | 'auditoria' | 'bolsas' | 'calendario_academico' | 'pagamentos_hub'
  | 'extrato_propinas' | 'quadro_honra' | 'rh_payroll' | 'trabalhos_finais'
  | 'documentos_hub' | 'plano_aula' | 'exclusoes_faltas' | 'financeiro_relatorios'
  | 'diario_classe' | 'director_turma' | 'relatorio_faltas' | 'gerar_documento'
  | 'med_integracao' | 'gestao_planos' | 'processos_secretaria' | 'funcionarios'
  | 'alterar_tipo_contrato' | 'solicitacoes_documentos'
  | 'arquivo_documentos' | 'gerir_avaliacoes' | 'biblioteca_gestao'
  | 'validacao_financeira_documentos'
  | 'acta_provas' | 'organizar_turmas' | 'finalistas'
  | 'rh_faltas_tempos' | 'rupes_historico' | 'tesouraria'
  | 'acompanhamento_pautas' | 'estudio_emissao' | 'centro_emissao'
  | 'consulta_aluno'
  | 'assistente' | 'portaria' | 'saft' | 'sessoes_ativas'
  | 'pautas' | 'configuracoes_sistema' | 'boletins_secretaria'
  | 'perfis_pendentes'
  | 'conselho_pedagogico' | 'conselho_escola';

export interface FeatureDef {
  key: PermKey;
  label: string;
  desc: string;
  roles: string[];
}

export interface FeatureCategory {
  categoria: string;
  icon: string;
  features: FeatureDef[];
}

// ─── Mapa completo de funcionalidades ─────────────────────────────────────────
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    categoria: 'Painéis & Dashboards',
    icon: 'grid',
    features: [
      { key: 'dashboard', label: 'Dashboard Principal', desc: 'Visão geral da escola com estatísticas', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'ceo', 'pca'] },
      { key: 'ceo_dashboard', label: 'Dashboard CEO', desc: 'Painel executivo de alto nível — acesso exclusivo à direcção executiva', roles: ['ceo', 'pca'] },
      { key: 'secretaria_hub', label: 'Painel da Secretaria', desc: 'Hub central da secretaria escolar', roles: ['secretaria', 'ceo', 'pca'] },
      { key: 'professor_hub', label: 'Painel do Professor', desc: 'Hub pessoal do professor', roles: ['professor', 'ceo', 'pca'] },
      { key: 'portal_estudante', label: 'Portal do Estudante', desc: 'Área pessoal do aluno', roles: ['aluno', 'ceo', 'pca'] },
      { key: 'portal_encarregado', label: 'Portal do Encarregado', desc: 'Painel do encarregado de educação com notas, presenças e financeiro', roles: ['encarregado', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Gestão Académica',
    icon: 'school',
    features: [
      { key: 'alunos', label: 'Alunos', desc: 'Registo, matrícula e gestão de alunos', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'professores', label: 'Professores', desc: 'Gestão do corpo docente', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'turmas', label: 'Turmas', desc: 'Criação e gestão de turmas', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'salas', label: 'Salas de Aula', desc: 'Gestão e atribuição de salas', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'notas', label: 'Notas & Pautas', desc: 'Registo e consulta de notas', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'presencas', label: 'Presenças', desc: 'Controlo de assiduidade', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'horario', label: 'Horário', desc: 'Horários de aulas e turnos', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'professor', 'aluno', 'ceo', 'pca'] },
      { key: 'historico', label: 'Histórico Académico', desc: 'Registo histórico de percurso', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'aluno', 'ceo', 'pca'] },
      { key: 'grelha', label: 'Grelha Curricular', desc: 'Estrutura e plano curricular', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'gestao_academica', label: 'Gestão Académica (Hub)', desc: 'Hub geral de gestão académica', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'admissao', label: 'Admissões', desc: 'Processo de candidatura e admissão de novos alunos', roles: ['admin', 'director', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'disciplinas', label: 'Disciplinas', desc: 'Gestão e configuração das disciplinas e conteúdos programáticos', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'transferencias', label: 'Transferências', desc: 'Gestão de entradas e saídas de alunos por transferência escolar', roles: ['admin', 'director', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'consulta_aluno', label: 'Consulta de Aluno', desc: 'Pesquisa e consulta rápida do dossier completo de um aluno: dados pessoais, notas, assiduidade, financeiro e documentos', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'financeiro', 'ceo', 'pca'] },
      { key: 'portaria', label: 'Portaria — Validar Cartão', desc: 'Controlo de acesso na entrada: validar cartão QR do aluno e verificar situação de propinas em tempo real', roles: ['secretaria', 'chefe_secretaria', 'admin', 'director', 'professor', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Professor',
    icon: 'book',
    features: [
      { key: 'professor_turmas', label: 'Minhas Turmas', desc: 'Turmas atribuídas ao professor', roles: ['professor', 'ceo', 'pca'] },
      { key: 'professor_pauta', label: 'Pautas & Notas', desc: 'Lançamento de notas pelo professor', roles: ['professor', 'ceo', 'pca'] },
      { key: 'professor_sumario', label: 'Sumário / Presenças', desc: 'Registos de aula e assiduidade', roles: ['professor', 'ceo', 'pca'] },
      { key: 'professor_mensagens', label: 'Mensagens', desc: 'Comunicação interna do professor', roles: ['professor', 'ceo', 'pca'] },
      { key: 'professor_materiais', label: 'Materiais Didáticos', desc: 'Partilha de conteúdos pedagógicos', roles: ['professor', 'ceo', 'pca'] },
      { key: 'diario_classe', label: 'Diário de Classe', desc: 'Registo diário das actividades lectivas e ocorrências de sala de aula', roles: ['professor', 'admin', 'director', 'pedagogico', 'coordenador_curso', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'director_turma', label: 'Director de Turma', desc: 'Funções do director de turma: comunicação com encarregados, gestão de faltas e ocorrências', roles: ['professor', 'admin', 'director', 'pedagogico', 'coordenador_curso', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'relatorio_faltas', label: 'Relatório de Faltas', desc: 'Geração e análise de relatórios de assiduidade por turma e aluno', roles: ['professor', 'admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'pedagogico', label: 'Área Pedagógica', desc: 'Gestão pedagógica: sumários, calendário de provas, solicitações e pautas', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'gerir_avaliacoes', label: 'Gerir Abertura de Avaliações', desc: 'Aprovar ou rejeitar pedidos de professores para lançar avaliações específicas (avaliações contínuas, provas e exames)', roles: ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria', 'pedagogico', 'coordenador_curso'] },
      { key: 'pautas', label: 'Gestão de Pautas (Prazos e Controlo)', desc: 'Definir prazos de lançamento de pautas, gerir mini-pautas e prorrogar prazos — exclusivo à gestão académica e pedagógica', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Financeiro',
    icon: 'cash',
    features: [
      { key: 'financeiro', label: 'Gestão Financeira', desc: 'Propinas, pagamentos e rubricas — gestão operacional do departamento financeiro', roles: ['financeiro', 'admin', 'director', 'ceo', 'pca'] },
      { key: 'boletim_propina', label: 'Boletim de Propina', desc: 'Geração de recibos de propina — emitido pelo financeiro e disponível à secretaria para entrega ao aluno', roles: ['financeiro', 'secretaria', 'admin', 'director', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Planeamento',
    icon: 'calendar',
    features: [
      { key: 'eventos', label: 'Calendário Escolar', desc: 'Eventos, feriados e actividades', roles: ['admin', 'director', 'secretaria', 'coordenador_curso', 'professor', 'aluno', 'ceo', 'pca'] },
      { key: 'notificacoes', label: 'Notificações', desc: 'Centro de avisos e alertas', roles: ['admin', 'director', 'secretaria', 'coordenador_curso', 'professor', 'aluno', 'financeiro', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Relatórios & RH',
    icon: 'bar-chart',
    features: [
      { key: 'relatorios', label: 'Relatórios & Análise', desc: 'Gráficos e exportação de dados', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'ceo', 'pca'] },
      { key: 'rh_controle', label: 'Controlo de RH', desc: 'Gestão de recursos humanos — responsabilidade do departamento de RH e direcção', roles: ['rh', 'admin', 'director', 'ceo', 'pca'] },
      { key: 'desempenho', label: 'Análise de Desempenho', desc: 'Análise detalhada de notas e desempenho por turma e aluno', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'visao_geral', label: 'Visão Geral Multi-Ano', desc: 'Comparação de indicadores académicos e financeiros entre anos lectivos', roles: ['admin', 'director', 'pedagogico', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'rh_hub', label: 'Hub de Recursos Humanos', desc: 'Centro de gestão de RH: professores, contratos, avaliações e presenças', roles: ['rh', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Documentos',
    icon: 'newspaper',
    features: [
      { key: 'editor_documentos', label: 'Editor de Documentos', desc: 'Modelos e emissão de documentos', roles: ['secretaria', 'admin', 'director', 'pedagogico', 'ceo', 'pca'] },
      { key: 'boletim_matricula', label: 'Boletim de Matrícula', desc: 'Impressão de ficha de matrícula', roles: ['secretaria', 'admin', 'director', 'pedagogico', 'ceo', 'pca'] },
      { key: 'gerar_documento', label: 'Gerar Documento PDF', desc: 'Geração de documentos PDF oficiais: declarações, certidões e outros documentos escolares', roles: ['secretaria', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'solicitacoes_documentos', label: 'Solicitações de Documentos', desc: 'Receber, processar e emitir documentos solicitados pelos alunos (declarações, certidões, certificados, diplomas)', roles: ['secretaria', 'chefe_secretaria', 'admin', 'director', 'ceo', 'pca'] },
      { key: 'validacao_financeira_documentos', label: 'Validação Financeira de Documentos', desc: 'Validar o pagamento antes de a secretaria emitir documentos solicitados pelos alunos', roles: ['financeiro', 'admin', 'director', 'ceo', 'pca'] },
      { key: 'arquivo_documentos', label: 'Arquivo de Documentos', desc: 'Consulta, pesquisa e re-emissão de todos os documentos emitidos: declarações, certidões, pautas, mini-pautas e mapas com histórico completo', roles: ['secretaria', 'chefe_secretaria', 'admin', 'director', 'ceo', 'pca'] },
      { key: 'boletins_secretaria', label: 'Boletins da Secretaria', desc: 'Emissão, assinatura e gestão de boletins oficiais da secretaria — documentos que requerem assinatura da direcção', roles: ['secretaria', 'chefe_secretaria', 'admin', 'director', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Pedagógico & Qualidade',
    icon: 'star',
    features: [
      { key: 'avaliacao_professores', label: 'Avaliação de Professores', desc: 'Avaliação pedagógica de professores pela direcção', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Biblioteca Escolar',
    icon: 'library',
    features: [
      { key: 'biblioteca', label: 'Biblioteca Escolar', desc: 'Acesso ao catálogo, pesquisa de livros e solicitação de empréstimos', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'professor', 'aluno', 'ceo', 'pca'] },
      { key: 'biblioteca_gestao', label: 'Gestão da Biblioteca', desc: 'Registar empréstimos, devoluções e gerir o acervo (não disponível por defeito para professores)', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Comunicação Interna',
    icon: 'chatbubbles',
    features: [
      { key: 'chat_interno', label: 'Chat Interno', desc: 'Comunicação centralizada entre secretaria, direcção e professores', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'professor', 'financeiro', 'rh', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Financeiro Avançado',
    icon: 'cash-outline',
    features: [
      { key: 'financeiro_relatorios', label: 'Relatórios Financeiros', desc: 'Relatórios financeiros mensais, trimestrais e anuais com gráficos', roles: ['financeiro', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'extrato_propinas', label: 'Extrato de Propinas', desc: 'Consulta e emissão de extratos de propinas por aluno', roles: ['secretaria', 'admin', 'director', 'financeiro', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'bolsas', label: 'Bolsas e Subsídios', desc: 'Gestão de bolsas de estudo e subsídios a alunos', roles: ['admin', 'director', 'financeiro', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'pagamentos_hub', label: 'Hub de Pagamentos', desc: 'Portal de auto-serviço para alunos e encarregados efetuarem pagamentos de rubricas', roles: ['aluno', 'encarregado', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Planeamento Pedagógico',
    icon: 'book-outline',
    features: [
      { key: 'plano_aula', label: 'Plano de Aula', desc: 'Criação e gestão de planos de aula pelos professores', roles: ['professor', 'admin', 'director', 'pedagogico', 'coordenador_curso', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'trabalhos_finais', label: 'Trabalhos Finais / PAP', desc: 'Gestão de trabalhos finais e Provas de Aptidão Profissional', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'professor', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'quadro_honra', label: 'Quadro de Honra', desc: 'Publicação e visualização do quadro de honra escolar', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'professor', 'aluno', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'exclusoes_faltas', label: 'Exclusões de Faltas', desc: 'Gestão de exclusões por excesso de faltas', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Calendário & Documentação',
    icon: 'calendar-outline',
    features: [
      { key: 'calendario_academico', label: 'Calendário Académico', desc: 'Gestão do calendário oficial do ano lectivo', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'documentos_hub', label: 'Hub de Documentos', desc: 'Centro centralizado de consulta e emissão de documentos escolares', roles: ['admin', 'director', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Recursos Humanos Avançado',
    icon: 'people-outline',
    features: [
      { key: 'rh_payroll', label: 'Processamento de Salários', desc: 'Cálculo e emissão de folhas de vencimentos e processamento salarial', roles: ['rh', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'alterar_tipo_contrato', label: 'Alterar Tipo de Vínculo', desc: 'Permite alterar individualmente o tipo de vínculo de professores e funcionários (Efectivo ↔ Colaborador ↔ Contratado ↔ Prestação de Serviços)', roles: ['rh', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Administração',
    icon: 'shield-checkmark',
    features: [
      { key: 'admin', label: 'Super Administração', desc: 'Configurações avançadas do sistema — exclusivo ao administrador técnico do sistema', roles: ['admin', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'gestao_acessos', label: 'Gestão de Acessos', desc: 'Controlar permissões e acessos de utilizadores', roles: ['admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },

      { key: 'auditoria', label: 'Auditoria do Sistema', desc: 'Registo detalhado de todas as acções realizadas no sistema', roles: ['admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'med_integracao', label: 'Integração MED / SIGE Gov', desc: 'Exportação de dados para o portal SIGE do Ministério da Educação de Angola (matrículas, professores, resultados, frequências)', roles: ['admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'sessoes_ativas', label: 'Sessões Activas', desc: 'Monitorização e gestão de sessões de utilizadores activos: ver quem está ligado, forçar saída e gerir banimentos', roles: ['admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'configuracoes_sistema', label: 'Configurações do Sistema (Tabelas)', desc: 'Gerir tabelas de configuração do sistema: tipos de rubrica, categorias, lookup tables e parâmetros internos', roles: ['admin', 'chefe_secretaria', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Conselhos (Dec. Exec. n.º 04/2026)',
    icon: 'people-circle',
    features: [
      {
        key: 'conselho_pedagogico',
        label: 'Conselho Pedagógico',
        desc: 'Órgão formal de validação académica: reuniões, deliberações, votações e validação de pautas (Art. 6.º)',
        roles: ['ceo', 'pca', 'admin', 'director', 'pedagogico', 'membro_conselho_pedagogico', 'membro_conselho_escola'],
      },
      {
        key: 'conselho_escola',
        label: 'Conselho de Escola',
        desc: 'Órgão de supervisão estratégica: reuniões, deliberações e aprovação de regulamentos (Art. 6.º)',
        roles: ['ceo', 'pca', 'admin', 'director', 'membro_conselho_pedagogico', 'membro_conselho_escola'],
      },
    ],
  },
  {
    categoria: 'IA & Ferramentas',
    icon: 'sparkles',
    features: [
      { key: 'assistente', label: 'Assistente IA (SIGA AI)', desc: 'Assistente de inteligência artificial integrado: ajuda a redigir documentos, analisar dados académicos e responder a questões sobre o SIGA', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'professor', 'financeiro', 'rh', 'ceo', 'pca'] },
    ],
  },
  {
    categoria: 'Novas Funcionalidades',
    icon: 'star-outline',
    features: [
      { key: 'funcionarios', label: 'Registo de Funcionários', desc: 'Gestão completa do registo de pessoal: dados pessoais, BI, NIF, departamento, cargo e contrato', roles: ['rh', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'processos_secretaria', label: 'Processos da Secretaria', desc: 'Gestão e acompanhamento de processos e solicitações da secretaria escolar', roles: ['secretaria', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'gestao_planos', label: 'Gestão de Planos de Subscrição', desc: 'Comparação e gestão dos planos Premium, Golden e Ruby — exclusivo à direcção executiva', roles: ['ceo', 'pca'] },
      { key: 'acta_provas', label: 'Acta de Presença em Provas', desc: 'Geração de acta oficial de alunos autorizados a realizar provas (propinas em dia), por turma e disciplina', roles: ['professor', 'admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'organizar_turmas', label: 'Organizar Turmas', desc: 'Reorganização e atribuição de alunos entre turmas do mesmo ano/classe', roles: ['admin', 'director', 'secretaria', 'chefe_secretaria', 'pedagogico', 'ceo', 'pca'] },
      { key: 'finalistas', label: 'Finalistas', desc: 'Gestão e acompanhamento de alunos finalistas: provas, PAP e conclusão de ciclo', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'secretaria', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'rh_faltas_tempos', label: 'Controlo de Faltas e Tempos (RH)', desc: 'Registo e controlo de faltas, horas extra e tempos de trabalho do pessoal', roles: ['rh', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'rupes_historico', label: 'Histórico de RUPE', desc: 'Consulta e gestão do histórico de Referências Únicas de Pagamento ao Estado (RUPE)', roles: ['financeiro', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'tesouraria', label: 'Tesouraria', desc: 'Gestão de caixa, entradas e saídas diárias e controlo de tesouraria escolar', roles: ['financeiro', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'saft', label: 'Ficheiro SAF-T', desc: 'Geração e exportação do ficheiro SAF-T (Standard Audit File for Tax) para entrega à Administração Fiscal angolana', roles: ['financeiro', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'acompanhamento_pautas', label: 'Acompanhamento de Pautas', desc: 'Monitorização do estado de lançamento de pautas por turma, disciplina e professor', roles: ['admin', 'director', 'pedagogico', 'coordenador_curso', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'estudio_emissao', label: 'Estúdio de Emissão', desc: 'Ambiente de criação e personalização de documentos e comunicações escolares', roles: ['secretaria', 'admin', 'director', 'chefe_secretaria', 'ceo', 'pca'] },
      { key: 'centro_emissao', label: 'Centro de Emissão', desc: 'Central de emissão em lote de documentos escolares: certidões, declarações e certificados', roles: ['secretaria', 'chefe_secretaria', 'admin', 'director', 'ceo', 'pca'] },
      { key: 'perfis_pendentes', label: 'Perfis Pendentes', desc: 'Lista centralizada de utilizadores com dados pessoais ou contratuais em falta: professores, alunos e funcionários a aguardar preenchimento', roles: ['admin', 'director', 'chefe_secretaria', 'rh', 'ceo', 'pca'] },
    ],
  },
];

// ─── Permissões padrão por cargo ──────────────────────────────────────────────
const ALL_KEYS: PermKey[] = FEATURE_CATEGORIES.flatMap(c => c.features.map(f => f.key));

export const ROLE_DEFAULTS: Record<string, PermKey[]> = {
  // ── Executivos: acesso total ──────────────────────────────────────
  ceo: [...ALL_KEYS],
  pca: [...ALL_KEYS],

  // ── Chefe de Secretaria: supervisão e coordenação de toda a secretaria ──
  // Pode visualizar e supervisionar todos os módulos, mas as operações
  // diárias pertencem aos respectivos departamentos.
  chefe_secretaria: ALL_KEYS.filter(k => k !== 'ceo_dashboard'),

  // ── Director: direcção estratégica e supervisão institucional ────
  // Visão global de todos os departamentos, aprovações e decisões.
  // Supervisiona mas NÃO opera: não configura o sistema (admin), não gere
  // acessos (chefe_secretaria/admin), não acede ao hub operacional da secretaria.
  // Não faz operações financeiras nem de RH directamente.
  director: [
    'dashboard', 'eventos', 'notificacoes', 'chat_interno',
    'calendario_academico', 'auditoria',
    // Académico (supervisão)
    'alunos', 'professores', 'turmas', 'salas', 'notas', 'presencas',
    'horario', 'historico', 'grelha', 'gestao_academica', 'admissao',
    'disciplinas', 'transferencias', 'biblioteca', 'biblioteca_gestao',
    // Pedagógico (supervisão)
    'pedagogico', 'avaliacao_professores', 'desempenho', 'visao_geral',
    'relatorios', 'quadro_honra', 'trabalhos_finais', 'exclusoes_faltas',
    'plano_aula', 'diario_classe', 'director_turma', 'relatorio_faltas',
    // Financeiro (supervisão — ver relatórios, não operar)
    'financeiro_relatorios', 'extrato_propinas', 'bolsas',
    // RH (supervisão estratégica — ver relatórios e controlo, não operar folhas de salário)
    'rh_hub', 'rh_controle',
    // Documentos (director assina e revê documentos oficiais)
    'editor_documentos', 'boletim_matricula', 'boletim_propina', 'documentos_hub', 'gerar_documento',
    // Gestão de acessos e permissões (director gere acesso dos seus colaboradores)
    'gestao_acessos',
    // Integrações e supervisão de novas funcionalidades
    'med_integracao', 'funcionarios', 'arquivo_documentos', 'gerir_avaliacoes',
    // Novas funcionalidades
    'acta_provas', 'organizar_turmas', 'finalistas', 'acompanhamento_pautas',
    'rupes_historico', 'tesouraria', 'estudio_emissao', 'centro_emissao',
    'consulta_aluno',
    // Funcionalidades recentes
    'portaria', 'saft', 'sessoes_ativas', 'pautas', 'boletins_secretaria', 'assistente',
    'perfis_pendentes',
  ] as PermKey[],

  // ── Sub-Director Pedagógico: mesmos privilégios do Director ─────
  subdirector_pedagogico: [
    'dashboard', 'eventos', 'notificacoes', 'chat_interno',
    'calendario_academico', 'auditoria',
    'alunos', 'professores', 'turmas', 'salas', 'notas', 'presencas',
    'horario', 'historico', 'grelha', 'gestao_academica', 'admissao',
    'disciplinas', 'transferencias', 'biblioteca', 'biblioteca_gestao',
    'pedagogico', 'avaliacao_professores', 'desempenho', 'visao_geral',
    'relatorios', 'quadro_honra', 'trabalhos_finais', 'exclusoes_faltas',
    'plano_aula', 'diario_classe', 'director_turma', 'relatorio_faltas',
    'financeiro_relatorios', 'extrato_propinas', 'bolsas',
    'rh_hub', 'rh_controle',
    'editor_documentos', 'boletim_matricula', 'boletim_propina', 'documentos_hub', 'gerar_documento',
    'gestao_acessos',
    'med_integracao', 'funcionarios', 'arquivo_documentos', 'gerir_avaliacoes',
    'acta_provas', 'organizar_turmas', 'finalistas', 'acompanhamento_pautas',
    'rupes_historico', 'tesouraria', 'estudio_emissao', 'centro_emissao',
    'consulta_aluno',
    'portaria', 'saft', 'sessoes_ativas', 'pautas', 'boletins_secretaria', 'assistente',
    'perfis_pendentes',
  ] as PermKey[],

  // ── Admin: configuração do sistema e gestão de utilizadores ──────
  // Responsabilidade técnica: configurar o sistema, gerir utilizadores
  // e controlar acessos. Não faz operações financeiras ou de RH.
  admin: [
    'dashboard', 'notificacoes', 'chat_interno', 'eventos', 'calendario_academico',
    // Sistema
    'admin', 'gestao_acessos', 'auditoria',
    // Gestão de utilizadores (precisa ver alunos/professores para criar contas)
    'alunos', 'professores', 'turmas', 'salas',
    'notas', 'presencas', 'horario', 'historico', 'admissao',
    'disciplinas', 'grelha', 'transferencias', 'gestao_academica',
    'boletim_matricula', 'editor_documentos', 'secretaria_hub',
    'pedagogico', 'avaliacao_professores', 'desempenho', 'visao_geral',
    'relatorios', 'quadro_honra', 'trabalhos_finais', 'exclusoes_faltas',
    'biblioteca', 'biblioteca_gestao', 'documentos_hub', 'gerar_documento',
    'plano_aula', 'diario_classe', 'director_turma', 'relatorio_faltas',
    // Financeiro (supervisão e relatórios — admin não opera mas vê relatórios)
    'financeiro_relatorios', 'extrato_propinas', 'bolsas',
    // RH (administrador supervisiona pessoal e processa vencimentos)
    'rh_hub', 'rh_controle', 'rh_payroll', 'funcionarios',
    // Alterar vínculos contratuais de professores e funcionários
    'alterar_tipo_contrato',
    // Integrações e novas funcionalidades
    'med_integracao', 'solicitacoes_documentos', 'validacao_financeira_documentos', 'arquivo_documentos', 'gerir_avaliacoes',
    // Novas funcionalidades
    'acta_provas', 'organizar_turmas', 'finalistas', 'rh_faltas_tempos',
    'rupes_historico', 'tesouraria', 'acompanhamento_pautas', 'estudio_emissao', 'centro_emissao',
    'consulta_aluno',
    // Funcionalidades recentes
    'portaria', 'saft', 'sessoes_ativas', 'pautas', 'configuracoes_sistema',
    'boletins_secretaria', 'assistente', 'perfis_pendentes',
  ],

  // ── Secretaria: operações administrativas académicas ─────────────
  // Matrícula, documentos, transferências, correspondência escolar.
  // NÃO faz gestão financeira (é do financeiro) nem RH (é do rh).
  secretaria: [
    'secretaria_hub', 'notificacoes', 'chat_interno', 'eventos', 'calendario_academico',
    // Operações académicas (core da secretaria)
    'alunos', 'turmas', 'presencas', 'notas', 'horario', 'historico',
    'admissao', 'transferencias', 'gestao_academica',
    // Parametrização curricular (cursos, disciplinas, áreas de formação)
    'disciplinas', 'grelha',
    // Documentos (responsabilidade da secretaria)
    'editor_documentos', 'boletim_matricula', 'boletim_propina', 'documentos_hub', 'gerar_documento',
    // Planeamento & análise
    'salas', 'biblioteca', 'biblioteca_gestao', 'quadro_honra', 'trabalhos_finais',
    'relatorios', 'extrato_propinas', 'exclusoes_faltas', 'desempenho', 'relatorio_faltas',
    // Novas funcionalidades da secretaria
    'processos_secretaria', 'solicitacoes_documentos', 'arquivo_documentos',
    'acta_provas', 'organizar_turmas', 'finalistas', 'estudio_emissao', 'centro_emissao',
    'consulta_aluno',
    // Funcionalidades recentes
    'portaria', 'boletins_secretaria', 'pautas', 'assistente',
  ],

  // ── Financeiro: gestão financeira completa ───────────────────────
  // Rubricas, pagamentos, bolsas, comprovativos, relatórios financeiros.
  // NÃO faz gestão académica nem de RH.
  financeiro: [
    'financeiro', 'notificacoes', 'chat_interno',
    // Operações financeiras (core do financeiro)
    'boletim_propina', 'extrato_propinas', 'bolsas',
    'pagamentos_hub', 'documentos_hub', 'financeiro_relatorios',
    // Validação de pagamentos de documentos solicitados pelos alunos
    'validacao_financeira_documentos',
    // Novas funcionalidades financeiras
    'rupes_historico', 'tesouraria',
    'consulta_aluno',
    // Funcionalidades recentes
    'saft', 'assistente',
  ],

  // ── RH: recursos humanos e processamento salarial ────────────────
  // Gestão de pessoal docente, contratos, avaliações, folhas de salário.
  // NÃO faz gestão académica de alunos nem financeiro de propinas.
  // NÃO acede a sumários de aula (professor_sumario) — esses são registos
  // lectivos do professor, não documentos de RH.
  rh: [
    'rh_hub', 'rh_controle', 'rh_payroll', 'notificacoes', 'chat_interno',
    // Acesso ao registo do pessoal docente (necessário para contratos e avaliações)
    'professores', 'horario', 'calendario_academico',
    // Novas funcionalidades de RH
    'funcionarios', 'alterar_tipo_contrato', 'rh_faltas_tempos',
    // Funcionalidades recentes
    'assistente', 'perfis_pendentes',
  ],

  // ── Pedagógico: qualidade académica e currículo ──────────────────
  // Currículo, avaliação de professores, análise académica, pedagógica.
  // NÃO faz gestão financeira nem operações de secretaria.
  pedagogico: [
    'dashboard', 'notificacoes', 'chat_interno', 'eventos', 'calendario_academico',
    // Académico (análise e qualidade)
    'alunos', 'professores', 'turmas', 'salas', 'notas', 'presencas',
    'horario', 'historico', 'disciplinas', 'grelha', 'biblioteca', 'biblioteca_gestao',
    // Pedagógico (core do pedagógico)
    'pedagogico', 'avaliacao_professores', 'gestao_academica',
    'desempenho', 'visao_geral', 'relatorios',
    // Qualidade académica
    'quadro_honra', 'trabalhos_finais', 'exclusoes_faltas', 'plano_aula',
    'diario_classe', 'director_turma', 'relatorio_faltas',
    // Controlo de avaliações e arquivo
    'gerir_avaliacoes',
    // Novas funcionalidades pedagógicas
    'acta_provas', 'organizar_turmas', 'finalistas', 'acompanhamento_pautas',
    'consulta_aluno',
    // Funcionalidades recentes
    'portaria', 'pautas', 'assistente',
  ],

  // ── Coordenador de Curso: supervisão pedagógica de um curso do II Ciclo ──
  // Coordena um curso curricular (ex: Ciências Exactas, Humanidades, etc.) do II Ciclo.
  // Supervisiona professores do curso, acompanha pautas, planos de aula, finalistas e PAP.
  // Avalia pedagogicamente os docentes e emite relatórios de desempenho do curso.
  // NÃO tem acesso a finanças, RH, configurações de sistema nem gestão de acessos.
  coordenador_curso: [
    'dashboard', 'notificacoes', 'chat_interno', 'eventos', 'calendario_academico',
    // Académico (supervisão do curso)
    'alunos', 'professores', 'turmas', 'salas', 'notas', 'presencas',
    'horario', 'historico', 'disciplinas', 'grelha', 'gestao_academica',
    // Pedagógico (core do coordenador de curso)
    'pedagogico', 'avaliacao_professores', 'desempenho', 'relatorios',
    'quadro_honra', 'trabalhos_finais', 'exclusoes_faltas', 'plano_aula',
    'diario_classe', 'director_turma', 'relatorio_faltas',
    // II Ciclo — específico ao coordenador de curso
    'finalistas', 'acta_provas', 'acompanhamento_pautas', 'gerir_avaliacoes',
    // Biblioteca e consulta de dossier de aluno
    'biblioteca', 'biblioteca_gestao', 'consulta_aluno',
    // Funcionalidades recentes
    'pautas', 'assistente',
  ] as PermKey[],

  // ── Professor: docência e actividade lectiva ──────────────────────
  // Lançamento de notas, sumários, materiais, comunicação com alunos.
  // NÃO tem acesso a funções de gestão pedagógica ou de avaliação de outros professores.
  professor: [
    'professor_hub', 'notificacoes', 'chat_interno', 'eventos',
    // Actividade lectiva (core do professor)
    'notas', 'professor_turmas', 'professor_pauta', 'horario',
    'professor_sumario', 'professor_mensagens', 'professor_materiais',
    // Funções de docente
    'diario_classe', 'director_turma', 'relatorio_faltas',
    // Acta de provas
    'acta_provas',
    // Recursos
    'biblioteca', 'quadro_honra', 'trabalhos_finais', 'plano_aula',
    // Funcionalidades recentes
    'portaria', 'assistente',
  ],

  // ── Diretor de Turma: professor com funções de direcção de turma ──
  // Tem tudo do professor normal, mais acesso específico às ferramentas
  // de diretor de turma (faltas, ocorrências, comunicação com encarregados).
  diretor_turma: [
    'professor_hub', 'notificacoes', 'chat_interno', 'eventos',
    // Actividade lectiva
    'notas', 'professor_turmas', 'professor_pauta', 'horario',
    'professor_sumario', 'professor_mensagens', 'professor_materiais',
    // Funções de diretor de turma (diferencial em relação ao professor normal)
    'diario_classe', 'director_turma', 'relatorio_faltas', 'exclusoes_faltas',
    // Acta de provas
    'acta_provas',
    // Recursos
    'biblioteca', 'quadro_honra', 'trabalhos_finais', 'plano_aula',
    // Funcionalidades recentes
    'portaria', 'assistente',
  ],

  // ── Subdiretor Administrativo: gestão administrativa e financeira ──
  // Supervisiona todas as áreas operacionais: secretaria, financeiro, RH e infra-estrutura.
  // Não tem acesso a funcionalidades pedagógicas avançadas nem ao dashboard executivo.
  subdiretor_administrativo: [
    'dashboard', 'eventos', 'notificacoes', 'chat_interno',
    'calendario_academico', 'auditoria',
    // Académico (supervisão administrativa)
    'alunos', 'professores', 'turmas', 'salas',
    'historico', 'admissao', 'transferencias', 'gestao_academica',
    // Financeiro (supervisão e operação)
    'financeiro', 'boletim_propina', 'extrato_propinas', 'bolsas',
    'financeiro_relatorios', 'pagamentos_hub', 'rupes_historico', 'tesouraria',
    // RH (supervisão e operação)
    'rh_hub', 'rh_controle', 'rh_payroll', 'funcionarios', 'rh_faltas_tempos',
    // Secretaria (supervisão)
    'secretaria_hub', 'editor_documentos', 'boletim_matricula',
    'documentos_hub', 'gerar_documento', 'processos_secretaria',
    'estudio_emissao', 'centro_emissao',
    // Biblioteca e recursos
    'biblioteca', 'biblioteca_gestao', 'relatorios',
    // Novas funcionalidades
    'acta_provas', 'organizar_turmas', 'finalistas', 'acompanhamento_pautas',
    // Integrações
    'med_integracao',
    // Funcionalidades recentes
    'portaria', 'saft', 'boletins_secretaria', 'pautas', 'assistente',
  ] as PermKey[],

  // ── Aluno: portal do estudante ────────────────────────────────────
  aluno: [
    'portal_estudante', 'notificacoes', 'horario', 'historico',
    'eventos', 'biblioteca', 'pagamentos_hub', 'quadro_honra',
  ],

  // ── Encarregado: portal do encarregado de educação ───────────────
  encarregado: ['portal_encarregado', 'notificacoes', 'pagamentos_hub'],
  // ── Membro do Conselho Pedagógico ────────────────────────────────
  // Valida pautas, vota deliberações, participa em reuniões formais.
  // Acesso a toda a área académica e pedagógica, sem funções de configuração.
  membro_conselho_pedagogico: [
    'dashboard', 'conselho_pedagogico', 'conselho_escola', 'notificacoes', 'chat_interno',
    'eventos', 'calendario_academico',
    'alunos', 'professores', 'turmas', 'notas', 'presencas', 'historico', 'grelha',
    'pedagogico', 'avaliacao_professores', 'desempenho', 'relatorios', 'pautas',
    'gerir_avaliacoes', 'quadro_honra', 'trabalhos_finais', 'assistente',
  ] as PermKey[],

  // ── Membro do Conselho de Escola ──────────────────────────────────
  // Supervisão estratégica, aprova regulamentos e deliberações de âmbito escolar.
  // Acesso de leitura/supervisão sem operação directa de módulos funcionais.
  membro_conselho_escola: [
    'dashboard', 'conselho_pedagogico', 'conselho_escola', 'notificacoes', 'chat_interno',
    'eventos', 'calendario_academico',
    'alunos', 'professores', 'turmas', 'historico',
    'relatorios', 'desempenho', 'visao_geral',
    'quadro_honra', 'trabalhos_finais', 'assistente',
  ] as PermKey[],
};

// ─── Context ──────────────────────────────────────────────────────────────────
interface UserPermRecord {
  userId: string;
  permissoes: Record<string, boolean>;
}

interface PermissoesContextValue {
  hasPermission: (key: PermKey) => boolean;
  allUserPermissions: UserPermRecord[];
  rolePermissions: Record<string, Record<string, boolean>>;
  getUserPermissions: (userId: string, role: string) => Record<PermKey, boolean>;
  saveUserPermissions: (userId: string, permissoes: Record<string, boolean>) => Promise<void>;
  resetUserPermissions: (userId: string) => Promise<void>;
  getRolePermissions: (role: string) => Record<PermKey, boolean>;
  saveRolePermissions: (role: string, permissoes: Record<string, boolean>) => Promise<void>;
  resetRolePermissions: (role: string) => Promise<void>;
  isLoading: boolean;
  reload: () => void;
}

const PermissoesContext = createContext<PermissoesContextValue | null>(null);

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [myPermissoes, setMyPermissoes] = useState<Record<string, boolean>>({});
  const [allUserPermissions, setAllUserPermissions] = useState<UserPermRecord[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    loadPermissions();
  }, [user?.id, tick]);

  async function loadPermissions() {
    if (!user) return;
    setIsLoading(true);
    try {
      const isSuperUser = user.role === 'ceo' || user.role === 'pca' || user.role === 'chefe_secretaria';
      const headers = await authHeaders();
      const [myRes, allRes, roleRes] = await Promise.all([
        fetch(`/api/user-permissions/${user.id}`, { headers }),
        isSuperUser ? fetch('/api/user-permissions', { headers }) : Promise.resolve(null),
        fetch('/api/role-permissions', { headers }),
      ]);
      const myData = await myRes.json();
      setMyPermissoes(myData.permissoes || {});
      if (allRes) {
        const allData = await allRes.json();
        setAllUserPermissions(Array.isArray(allData)
          ? allData.map((r: any) => ({ userId: r.user_id || r.userId, permissoes: r.permissoes || {} }))
          : []
        );
      }
      if (roleRes.ok) {
        const roleData = await roleRes.json();
        setRolePermissions(typeof roleData === 'object' && roleData ? roleData : {});
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  function hasPermission(key: PermKey): boolean {
    if (!user) return false;
    // CEO/PCA always have full access (they manage others, cannot self-restrict)
    if (user.role === 'ceo' || user.role === 'pca') return true;
    // Chefe de Secretaria parametrizes everything (except CEO dashboard)
    if (user.role === 'chefe_secretaria') return key !== 'ceo_dashboard';
    // Admin and Director always have gestao_acessos regardless of any stored DB overrides
    if ((user.role === 'admin' || user.role === 'director') && key === 'gestao_acessos') return true;
    // If there's an explicit override stored for this user, use it
    if (Object.keys(myPermissoes).length > 0) {
      if (key in myPermissoes) return myPermissoes[key] === true;
    }
    // Check role-level permissions from DB (editable by admins)
    const dbRolePerms = rolePermissions[user.role];
    if (dbRolePerms && Object.keys(dbRolePerms).length > 0) {
      if (key in dbRolePerms) return dbRolePerms[key] === true;
    }
    // Fallback: hardcoded role default
    return (ROLE_DEFAULTS[user.role] || []).includes(key as PermKey);
  }

  function getUserPermissions(userId: string, role: string): Record<PermKey, boolean> {
    const stored = allUserPermissions.find(p => p.userId === userId);
    const dbRolePerms = rolePermissions[role] || {};
    const defaults = ROLE_DEFAULTS[role] || [];
    const result: Record<string, boolean> = {};
    ALL_KEYS.forEach(key => {
      if (stored && Object.keys(stored.permissoes).length > 0 && key in stored.permissoes) {
        // Individual user override takes precedence
        result[key] = stored.permissoes[key] === true;
      } else if (Object.keys(dbRolePerms).length > 0 && key in dbRolePerms) {
        // Role profile DB setting
        result[key] = dbRolePerms[key] === true;
      } else {
        // Hardcoded default
        result[key] = defaults.includes(key);
      }
    });
    return result as Record<PermKey, boolean>;
  }

  function getRolePermissions(role: string): Record<PermKey, boolean> {
    const dbRolePerms = rolePermissions[role] || {};
    const defaults = ROLE_DEFAULTS[role] || [];
    const result: Record<string, boolean> = {};
    ALL_KEYS.forEach(key => {
      if (Object.keys(dbRolePerms).length > 0 && key in dbRolePerms) {
        result[key] = dbRolePerms[key] === true;
      } else {
        result[key] = defaults.includes(key);
      }
    });
    return result as Record<PermKey, boolean>;
  }

  async function saveUserPermissions(userId: string, permissoes: Record<string, boolean>) {
    const headers = await authHeaders();
    await fetch(`/api/user-permissions/${userId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissoes }),
    });
    reload();
  }

  async function resetUserPermissions(userId: string) {
    const headers = await authHeaders();
    await fetch(`/api/user-permissions/${userId}`, { method: 'DELETE', headers });
    reload();
  }

  async function saveRolePermissions(role: string, permissoes: Record<string, boolean>) {
    const headers = await authHeaders();
    await fetch(`/api/role-permissions/${role}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissoes }),
    });
    reload();
  }

  async function resetRolePermissions(role: string) {
    const headers = await authHeaders();
    await fetch(`/api/role-permissions/${role}`, { method: 'DELETE', headers });
    reload();
  }

  return (
    <PermissoesContext.Provider value={{
      hasPermission,
      allUserPermissions,
      rolePermissions,
      getUserPermissions,
      saveUserPermissions,
      resetUserPermissions,
      getRolePermissions,
      saveRolePermissions,
      resetRolePermissions,
      isLoading,
      reload,
    }}>
      {children}
    </PermissoesContext.Provider>
  );
}

export function usePermissoes() {
  const ctx = useContext(PermissoesContext);
  if (!ctx) throw new Error('usePermissoes must be used within PermissoesProvider');
  return ctx;
}
