/**
 * tourSteps — configuração central dos tours guiados de todos os perfis.
 * Cada perfil tem a sua própria lista de passos (rota, ícone, cor, descrição),
 * espelhando os itens do menu lateral desse perfil em components/DrawerLeft.tsx.
 * A chave de armazenamento (`*_TOUR_KEY`) controla se o tour já foi visto (AsyncStorage).
 */
import React from 'react';
import { Ionicons, MaterialCommunityIcons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import type { TourStep } from '@/components/GuidedTour';

const ICON = (size = 28) => size;

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSOR
// ─────────────────────────────────────────────────────────────────────────────
export const PROFESSOR_TOUR_KEY = 'professor_tour_done_v2';
export const PROFESSOR_TOUR_STEPS: TourStep[] = [
  { section: 'Painel do Professor', label: 'Meu Painel', route: '/(main)/professor-hub', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'O seu centro de comando. Estatísticas do mês, pautas activas, sumários pendentes e acesso rápido a todas as funcionalidades.' },
  { section: 'Área Pedagógica', label: 'Minhas Turmas', route: '/(main)/professor-turmas', icon: <MaterialIcons name="class" size={28} color="#fff" />, color: Colors.info, description: 'Lista de turmas onde lecciona, alunos inscritos e acompanhamento do desempenho ao longo do ano.' },
  { section: 'Área Pedagógica', label: 'Notas & Lançamentos', route: '/(main)/notas', icon: <Ionicons name="document-text" size={28} color="#fff" />, color: Colors.accent, description: 'Lance, edite e consulte notas por trimestre. Registe PP, MT e PT — o sistema calcula a MAC automaticamente.' },
  { section: 'Área Pedagógica', label: 'Gestão de Pautas', route: '/(main)/professor-pauta', icon: <MaterialCommunityIcons name="file-lock-outline" size={28} color="#fff" />, color: Colors.warning, description: 'Submeta, acompanhe e feche as pautas trimestrais das suas disciplinas em tempo real.' },
  { section: 'Área Pedagógica', label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={28} color="#fff" />, color: Colors.primaryLight, description: 'Horário semanal completo com todas as aulas, disciplinas e turmas organizadas por dia da semana.' },
  { section: 'Área Pedagógica', label: 'Sumário / Presenças', route: '/(main)/professor-sumario', icon: <MaterialCommunityIcons name="clipboard-check" size={28} color="#fff" />, color: Colors.success, description: 'Registe o sumário de cada aula e marque as presenças dos alunos. Mantenha o diário de classe actualizado.' },
  { section: 'Área Pedagógica', label: 'Planificações', route: '/(main)/pedagogico?tab=planificacoes', icon: <MaterialCommunityIcons name="clipboard-list" size={28} color="#fff" />, color: '#8B5CF6', description: 'Crie e gira planos de aula e planificações curriculares anuais ao longo do ano lectivo.' },
  { section: 'Área Pedagógica', label: 'Programa Curricular', route: '/(main)/pedagogico?tab=programa', icon: <MaterialCommunityIcons name="book-open-variant" size={28} color="#fff" />, color: '#0ea5e9', description: 'Programa oficial da disciplina, conteúdos por trimestre e objectivos do Ministério.' },
  { section: 'Área Pedagógica', label: 'Resultados Pedagógicos', route: '/(main)/pedagogico?tab=resultados', icon: <MaterialCommunityIcons name="chart-bar" size={28} color="#fff" />, color: '#22c55e', description: 'Resultados académicos da turma em gráficos e tabelas. Identifique alunos em risco.' },
  { section: 'Área Pedagógica', label: 'Ocorrências', route: '/(main)/pedagogico?tab=ocorrencias', icon: <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#fff" />, color: Colors.danger, description: 'Registe e acompanhe ocorrências disciplinares dos alunos com historial detalhado.' },
  { section: 'Área Pedagógica', label: 'Avaliação de Professores', route: '/(main)/avaliacao-professores', icon: <MaterialCommunityIcons name="star-check-outline" size={28} color="#fff" />, color: Colors.gold, description: 'Avaliação de desempenho pedagógico, critérios e feedback da direcção pedagógica.' },
  { section: 'Área Pedagógica', label: 'Biblioteca', route: '/(main)/biblioteca', icon: <Ionicons name="library" size={28} color="#fff" />, color: '#a78bfa', description: 'Acervo bibliográfico da escola — pesquise e consulte recursos de referência para as aulas.' },
  { section: 'Área Pedagógica', label: 'Trabalhos Finais de Curso', route: '/(main)/trabalhos-finais', icon: <MaterialCommunityIcons name="book-education-outline" size={28} color="#fff" />, color: '#f59e0b', description: 'Oriente os TFC dos seus alunos, acompanhe o progresso e valide as etapas de entrega.' },
  { section: 'Área Pedagógica', label: 'Calendário', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={28} color="#fff" />, color: Colors.accent, description: 'Eventos académicos, datas de exames, reuniões e actividades escolares do ano lectivo.' },
  { section: 'Comunicação', label: 'Materiais', route: '/(main)/professor-materiais', icon: <Ionicons name="folder-open" size={28} color="#fff" />, color: Colors.info, description: 'Faça upload e partilhe ficheiros, apresentações e materiais de estudo com os alunos.' },
  { section: 'Comunicação', label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={28} color="#fff" />, color: Colors.success, description: 'Valide o cartão de acesso dos alunos via QR code. Controlo de entrada e saída em tempo real.' },
  { section: 'Comunicação', label: 'Chat — Conversa Interna', route: '/(main)/chat-interno', icon: <Ionicons name="chatbubbles" size={28} color="#fff" />, color: '#06B6D4', description: 'Converse em tempo real com outros professores, directores e funcionários da escola.' },
  { section: 'Comunicação', label: 'Assistente de IA', route: '__ai_assistant__', icon: <MaterialCommunityIcons name="robot-excited-outline" size={28} color="#fff" />, color: '#A855F7', description: 'O seu assistente inteligente integrado, disponível em qualquer página através do botão flutuante.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ALUNO
// ─────────────────────────────────────────────────────────────────────────────
export const ALUNO_TOUR_KEY = 'aluno_tour_done_v1';
export const ALUNO_TOUR_STEPS: TourStep[] = [
  { section: 'Meu Portal', label: 'Portal do Estudante', route: '/(main)/portal-estudante', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'O seu centro pessoal — notas, presenças, horário e tudo o que precisa sobre o seu percurso académico.' },
  { section: 'Área Pedagógica', label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={28} color="#fff" />, color: Colors.info, description: 'Consulte o seu horário semanal completo, com todas as aulas organizadas por dia.' },
  { section: 'Área Pedagógica', label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={28} color="#fff" />, color: Colors.accent, description: 'Veja o seu histórico académico completo, incluindo notas de anos anteriores.' },
  { section: 'Área Pedagógica', label: 'Calendário', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={28} color="#fff" />, color: Colors.warning, description: 'Eventos escolares, datas de exames e actividades do ano lectivo.' },
  { section: 'Financeiro', label: 'Pagamentos & Saldo', route: '/(main)/portal-estudante?tab=financeiro', icon: <MaterialCommunityIcons name="cash" size={28} color="#fff" />, color: Colors.success, description: 'Consulte o seu saldo, mensalidades e histórico de pagamentos.' },
  { section: 'Financeiro', label: 'Referências RUPE', route: '/(main)/portal-estudante?tab=rupes', icon: <Ionicons name="receipt" size={28} color="#fff" />, color: '#0ea5e9', description: 'Gere referências de pagamento (RUPE/Multicaixa) para pagar as suas propinas.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ENCARREGADO DE EDUCAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
export const ENCARREGADO_TOUR_KEY = 'encarregado_tour_done_v1';
export const ENCARREGADO_TOUR_STEPS: TourStep[] = [
  { section: 'Portal do Encarregado', label: 'Painel do Educando', route: '/(main)/portal-encarregado?tab=painel', icon: <MaterialCommunityIcons name="account-child" size={28} color="#fff" />, color: Colors.gold, description: 'Visão geral do seu educando — desempenho, presenças e avisos importantes.' },
  { section: 'Portal do Encarregado', label: 'Notas', route: '/(main)/portal-encarregado?tab=notas', icon: <Ionicons name="document-text" size={28} color="#fff" />, color: Colors.info, description: 'Acompanhe as notas do seu educando em todas as disciplinas e trimestres.' },
  { section: 'Portal do Encarregado', label: 'Presenças', route: '/(main)/portal-encarregado?tab=presencas', icon: <Ionicons name="checkmark-circle-outline" size={28} color="#fff" />, color: Colors.success, description: 'Consulte o registo de presenças e assiduidade do seu educando.' },
  { section: 'Portal do Encarregado', label: 'Faltas', route: '/(main)/portal-encarregado?tab=faltas', icon: <Ionicons name="close-circle-outline" size={28} color="#fff" />, color: Colors.danger, description: 'Veja as faltas registadas e justifique-as quando necessário.' },
  { section: 'Portal do Encarregado', label: 'Diário', route: '/(main)/portal-encarregado?tab=diario', icon: <Ionicons name="book-outline" size={28} color="#fff" />, color: '#8B5CF6', description: 'Sumários das aulas registados pelos professores — acompanhe o que foi leccionado.' },
  { section: 'Portal do Encarregado', label: 'Horário', route: '/(main)/portal-encarregado?tab=horario', icon: <Ionicons name="time-outline" size={28} color="#fff" />, color: Colors.primaryLight, description: 'Horário semanal completo das aulas do seu educando.' },
  { section: 'Portal do Encarregado', label: 'Materiais', route: '/(main)/portal-encarregado?tab=materiais', icon: <Ionicons name="library-outline" size={28} color="#fff" />, color: '#a78bfa', description: 'Materiais de estudo e ficheiros partilhados pelos professores.' },
  { section: 'Portal do Encarregado', label: 'Calendário', route: '/(main)/portal-encarregado?tab=calendario', icon: <Ionicons name="calendar-outline" size={28} color="#fff" />, color: Colors.warning, description: 'Eventos académicos, datas de exames e actividades escolares.' },
  { section: 'Portal do Encarregado', label: 'Financeiro', route: '/(main)/portal-encarregado?tab=financeiro', icon: <MaterialCommunityIcons name="cash" size={28} color="#fff" />, color: '#0ea5e9', description: 'Situação financeira, mensalidades e pagamentos do seu educando.' },
  { section: 'Portal do Encarregado', label: 'Mensagens', route: '/(main)/portal-encarregado?tab=mensagens', icon: <Ionicons name="chatbubbles-outline" size={28} color="#fff" />, color: '#06B6D4', description: 'Converse directamente com a escola e receba comunicados importantes.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECRETARIA (também usado, com pequenas variações, pelo Chefe de Secretaria)
// ─────────────────────────────────────────────────────────────────────────────
export const SECRETARIA_TOUR_KEY = 'secretaria_tour_done_v1';
export const SECRETARIA_TOUR_STEPS: TourStep[] = [
  { section: 'Secretaria', label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'O seu centro de comando — visão geral de matrículas, pautas e processos pendentes.' },
  { section: 'Secretaria', label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={28} color="#fff" />, color: Colors.info, description: 'Pesquise rapidamente qualquer aluno e consulte o seu processo completo.' },
  { section: 'Secretaria', label: 'Pautas (Hub)', route: '/(main)/secretaria-hub?tab=pautas', icon: <Ionicons name="ribbon" size={28} color="#fff" />, color: Colors.accent, description: 'Acompanhe e gira as pautas trimestrais de todas as turmas.' },
  { section: 'Secretaria', label: 'Processo de Admissão', route: '/(main)/admissao', icon: <MaterialCommunityIcons name="account-school" size={28} color="#fff" />, color: Colors.success, description: 'Registe novas matrículas e acompanhe o processo de admissão de alunos.' },
  { section: 'Secretaria', label: 'Organizar Alunos em Turmas', route: '/(main)/organizar-turmas', icon: <MaterialCommunityIcons name="account-group" size={28} color="#fff" />, color: '#8B5CF6', description: 'Distribua e organize os alunos matriculados pelas turmas disponíveis.' },
  { section: 'Secretaria', label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={28} color="#fff" />, color: Colors.warning, description: 'Emita declarações, certificados, boletins e outros documentos oficiais.' },
  { section: 'Secretaria', label: 'Arquivo de Documentos', route: '/(main)/arquivo-documentos', icon: <MaterialCommunityIcons name="folder-multiple" size={28} color="#fff" />, color: '#0ea5e9', description: 'Consulte o histórico de todos os documentos já emitidos pela escola.' },
  { section: 'Gestão Académica', label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={28} color="#fff" />, color: Colors.gold, description: 'Base de dados completa de todos os alunos da escola.' },
  { section: 'Gestão Académica', label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={28} color="#fff" />, color: Colors.info, description: 'Consulte e organize as turmas activas no ano lectivo actual.' },
  { section: 'Gestão Académica', label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={28} color="#fff" />, color: Colors.accent, description: 'Consulte notas lançadas por todas as turmas e disciplinas.' },
  { section: 'Financeiro', label: 'Hub de Pagamentos', route: '/(main)/pagamentos-hub', icon: <MaterialCommunityIcons name="cash-multiple" size={28} color="#fff" />, color: Colors.success, description: 'Registe pagamentos de propinas e outras taxas escolares.' },
  { section: 'Financeiro', label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={28} color="#fff" />, color: '#22c55e', description: 'Valide o cartão de acesso de alunos e funcionários via QR code.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CHEFE DE SECRETARIA — inclui os passos da Secretaria + itens de gestão adicionais
// ─────────────────────────────────────────────────────────────────────────────
export const CHEFE_SECRETARIA_TOUR_KEY = 'chefe_secretaria_tour_done_v1';
export const CHEFE_SECRETARIA_TOUR_STEPS: TourStep[] = [
  { section: 'Principal', label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'Visão geral da escola — indicadores académicos, financeiros e de pessoal.' },
  ...SECRETARIA_TOUR_STEPS,
  { section: 'Recursos Humanos', label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={28} color="#fff" />, color: '#f59e0b', description: 'Gestão de pessoal, faltas de funcionários e folha salarial.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO
// ─────────────────────────────────────────────────────────────────────────────
export const FINANCEIRO_TOUR_KEY = 'financeiro_tour_done_v1';
export const FINANCEIRO_TOUR_STEPS: TourStep[] = [
  { section: 'Painel Financeiro', label: 'Tesouraria', route: '/(main)/tesouraria', icon: <MaterialCommunityIcons name="finance" size={28} color="#fff" />, color: Colors.gold, description: 'O seu centro de comando financeiro — fluxo de caixa e movimentos do dia.' },
  { section: 'Painel Financeiro', label: 'Gestão Financeira', route: '/(main)/financeiro?tab=painel', icon: <MaterialCommunityIcons name="cash" size={28} color="#fff" />, color: Colors.info, description: 'Painel geral com indicadores financeiros da escola em tempo real.' },
  { section: 'Painel Financeiro', label: 'Em Atraso', route: '/(main)/financeiro?tab=em_atraso', icon: <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#fff" />, color: Colors.danger, description: 'Identifique alunos com mensalidades em atraso e faça a gestão de cobranças.' },
  { section: 'Painel Financeiro', label: 'Por Aluno', route: '/(main)/financeiro?tab=por_aluno', icon: <MaterialCommunityIcons name="account-details" size={28} color="#fff" />, color: Colors.accent, description: 'Consulte a situação financeira detalhada de cada aluno.' },
  { section: 'Painel Financeiro', label: 'Pagamentos', route: '/(main)/financeiro?tab=pagamentos', icon: <MaterialCommunityIcons name="cash-multiple" size={28} color="#fff" />, color: Colors.success, description: 'Registe e consulte todos os pagamentos recebidos pela escola.' },
  { section: 'Painel Financeiro', label: 'Rubricas / Taxas', route: '/(main)/financeiro?tab=rubricas', icon: <MaterialCommunityIcons name="format-list-bulleted-type" size={28} color="#fff" />, color: '#8B5CF6', description: 'Configure as rubricas e taxas cobradas pela escola.' },
  { section: 'Painel Financeiro', label: 'Orçamento Anual', route: '/(main)/financeiro?tab=orcamento', icon: <MaterialCommunityIcons name="speedometer" size={28} color="#fff" />, color: Colors.warning, description: 'Acompanhe o orçamento anual da escola e a execução por rubrica.' },
  { section: 'Painel Financeiro', label: 'Análise de Resultados', route: '/(main)/financeiro?tab=relatorios', icon: <MaterialCommunityIcons name="chart-bar" size={28} color="#fff" />, color: '#0ea5e9', description: 'Relatórios e gráficos sobre a saúde financeira da escola.' },
  { section: 'Painel Financeiro', label: 'Plano de Contas', route: '/(main)/financeiro?tab=plano_contas', icon: <MaterialCommunityIcons name="file-tree" size={28} color="#fff" />, color: '#22c55e', description: 'Estrutura contabilística da escola, organizada por contas.' },
  { section: 'Painel Financeiro', label: 'Contas a Pagar', route: '/(main)/financeiro?tab=contas_pagar', icon: <MaterialCommunityIcons name="credit-card-clock" size={28} color="#fff" />, color: Colors.danger, description: 'Gira as despesas e contas a pagar da escola, com prazos e fornecedores.' },
  { section: 'Painel Financeiro', label: 'Hub de Pagamentos', route: '/(main)/pagamentos-hub', icon: <MaterialCommunityIcons name="cash-multiple" size={28} color="#fff" />, color: Colors.gold, description: 'Registe pagamentos de propinas via dinheiro, transferência ou Multicaixa.' },
  { section: 'Painel Financeiro', label: 'Documentos & Multicaixa', route: '/(main)/documentos-hub', icon: <MaterialCommunityIcons name="file-document-multiple" size={28} color="#fff" />, color: Colors.info, description: 'Documentos financeiros e integração com referências Multicaixa/EMIS.' },
  { section: 'Painel Financeiro', label: 'Bolsas & Descontos', route: '/(main)/bolsas', icon: <MaterialCommunityIcons name="school-outline" size={28} color="#fff" />, color: '#a78bfa', description: 'Gira bolsas de estudo e descontos aplicados a alunos.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// RH (RECURSOS HUMANOS)
// ─────────────────────────────────────────────────────────────────────────────
export const RH_TOUR_KEY = 'rh_tour_done_v1';
export const RH_TOUR_STEPS: TourStep[] = [
  { section: 'Recursos Humanos', label: 'Gestão de Pessoal', route: '/(main)/rh-controle?tab=pessoal', icon: <MaterialCommunityIcons name="account-group" size={28} color="#fff" />, color: Colors.gold, description: 'Base de dados de todos os funcionários e professores da escola.' },
  { section: 'Recursos Humanos', label: 'Sumários (RH)', route: '/(main)/rh-controle?tab=sumarios', icon: <MaterialCommunityIcons name="clipboard-text-outline" size={28} color="#fff" />, color: Colors.info, description: 'Acompanhe os sumários de aula registados pelos professores.' },
  { section: 'Recursos Humanos', label: 'Solicitações de Pessoal', route: '/(main)/rh-controle?tab=solicitacoes', icon: <MaterialCommunityIcons name="email-outline" size={28} color="#fff" />, color: Colors.accent, description: 'Receba e responda a pedidos de licença, alterações e outros do pessoal.' },
  { section: 'Faltas & Tempos', label: 'Faltas dos Funcionários', route: '/(main)/rh-faltas-tempos?tab=faltas', icon: <MaterialCommunityIcons name="calendar-remove" size={28} color="#fff" />, color: Colors.danger, description: 'Registe e acompanhe as faltas de todos os funcionários.' },
  { section: 'Faltas & Tempos', label: 'Faltas dos Professores', route: '/(main)/rh-faltas-tempos?tab=professores', icon: <MaterialCommunityIcons name="account-tie" size={28} color="#fff" />, color: Colors.warning, description: 'Controlo específico de faltas e tempos lectivos dos professores.' },
  { section: 'Faltas & Tempos', label: 'Relatórios de Faltas', route: '/(main)/rh-faltas-tempos?tab=relatorios', icon: <MaterialCommunityIcons name="chart-box-outline" size={28} color="#fff" />, color: '#0ea5e9', description: 'Relatórios consolidados de assiduidade de todo o pessoal.' },
  { section: 'Folha Salarial', label: 'Painel da Folha', route: '/(main)/rh-payroll?tab=painel', icon: <MaterialCommunityIcons name="cash-multiple" size={28} color="#fff" />, color: Colors.success, description: 'Visão geral da folha salarial do mês corrente.' },
  { section: 'Folha Salarial', label: 'Folhas de Pagamento', route: '/(main)/rh-payroll?tab=folhas', icon: <MaterialCommunityIcons name="receipt" size={28} color="#fff" />, color: '#8B5CF6', description: 'Processe e emita as folhas de pagamento dos funcionários.' },
  { section: 'Controlo', label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <Ionicons name="calendar" size={28} color="#fff" />, color: '#22c55e', description: 'Datas-chave do ano lectivo relevantes para a gestão de pessoal.' },
  { section: 'Controlo', label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={28} color="#fff" />, color: '#a78bfa', description: 'Valide o cartão de acesso de funcionários via QR code.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// PEDAGÓGICO (Responsável da Área Pedagógica)
// ─────────────────────────────────────────────────────────────────────────────
export const PEDAGOGICO_TOUR_KEY = 'pedagogico_tour_done_v1';
export const PEDAGOGICO_TOUR_STEPS: TourStep[] = [
  { section: 'Principal', label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'Visão geral da escola com indicadores académicos, financeiros e de pessoal.' },
  { section: 'Área Pedagógica', label: 'Área Pedagógica', route: '/(main)/pedagogico', icon: <MaterialCommunityIcons name="clipboard-list" size={28} color="#fff" />, color: Colors.info, description: 'O seu centro de comando pedagógico — planificações, programas e resultados.' },
  { section: 'Área Pedagógica', label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={28} color="#fff" />, color: Colors.accent, description: 'Base de dados completa de todos os alunos da escola.' },
  { section: 'Área Pedagógica', label: 'Professores', route: '/(main)/professores', icon: <FontAwesome5 name="chalkboard-teacher" size={24} color="#fff" />, color: Colors.warning, description: 'Consulte o corpo docente e a distribuição de disciplinas.' },
  { section: 'Área Pedagógica', label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={28} color="#fff" />, color: Colors.success, description: 'Organização das turmas activas no ano lectivo.' },
  { section: 'Área Pedagógica', label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={28} color="#fff" />, color: '#0ea5e9', description: 'Acompanhe o lançamento de notas por turma e disciplina.' },
  { section: 'Área Pedagógica', label: 'Avaliação de Professores', route: '/(main)/avaliacao-professores', icon: <MaterialCommunityIcons name="star-check-outline" size={28} color="#fff" />, color: '#8B5CF6', description: 'Avalie o desempenho pedagógico do corpo docente.' },
  { section: 'Área Pedagógica', label: 'Exclusões & Faltas', route: '/(main)/exclusoes-faltas', icon: <MaterialCommunityIcons name="account-cancel" size={28} color="#fff" />, color: Colors.danger, description: 'Gira exclusões de alunos por faltas ou reprovações consecutivas (Art. 23º).' },
  { section: 'Área Pedagógica', label: 'Quadro de Honra', route: '/(main)/quadro-honra', icon: <MaterialCommunityIcons name="trophy" size={28} color="#fff" />, color: Colors.gold, description: 'Reconheça os melhores alunos e cursos do ano lectivo.' },
  { section: 'Documentos & Análise', label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={28} color="#fff" />, color: '#22c55e', description: 'Emita pautas, boletins, certificados e outros documentos oficiais.' },
  { section: 'Documentos & Análise', label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={28} color="#fff" />, color: '#a78bfa', description: 'Relatórios e estatísticas sobre o desempenho académico da escola.' },
  { section: 'Documentos & Análise', label: 'Análise de Desempenho', route: '/(main)/desempenho', icon: <MaterialCommunityIcons name="chart-areaspline" size={28} color="#fff" />, color: '#f59e0b', description: 'Gráficos detalhados de desempenho por turma, disciplina e trimestre.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────────────────────────
export const ADMIN_TOUR_KEY = 'admin_tour_done_v1';
export const ADMIN_TOUR_STEPS: TourStep[] = [
  { section: 'Principal', label: 'Painel de Administração', route: '/(main)/admin', icon: <Ionicons name="settings" size={28} color="#fff" />, color: Colors.gold, description: 'O seu centro de controlo — utilizadores, permissões, configurações e segurança do sistema.' },
  { section: 'Académico', label: 'Matrículas Pendentes', route: '/(main)/admin?section=matriculas&group=academico', icon: <MaterialCommunityIcons name="account-plus" size={28} color="#fff" />, color: Colors.info, description: 'Aprove ou rejeite novas matrículas submetidas à escola.' },
  { section: 'Académico', label: 'Gestão de Cursos', route: '/(main)/admin?section=cursos&group=academico', icon: <MaterialCommunityIcons name="book-open-variant" size={28} color="#fff" />, color: Colors.accent, description: 'Configure os cursos, cargas horárias e planos curriculares da escola.' },
  { section: 'Académico', label: 'Ano Académico', route: '/(main)/admin?section=anos&group=academico', icon: <Ionicons name="calendar" size={28} color="#fff" />, color: Colors.success, description: 'Gira os anos lectivos, trimestres e datas-chave do calendário académico.' },
  { section: 'Pessoal & Acesso', label: 'Utilizadores', route: '/(main)/admin?section=usuarios&group=pessoal', icon: <Ionicons name="people" size={28} color="#fff" />, color: Colors.warning, description: 'Crie e gira todas as contas de utilizador do sistema.' },
  { section: 'Pessoal & Acesso', label: 'Permissões / Acessos', route: '/(main)/admin?section=acessos&group=pessoal', icon: <MaterialCommunityIcons name="account-key" size={28} color="#fff" />, color: Colors.danger, description: 'Defina exactamente o que cada perfil pode ver e fazer na plataforma.' },
  { section: 'Sistema', label: 'Configurações Gerais', route: '/(main)/admin?section=config&group=sistema', icon: <Ionicons name="settings" size={28} color="#fff" />, color: '#0ea5e9', description: 'Configurações globais da escola — fórmulas de avaliação, identidade e mais.' },
  { section: 'Sistema', label: 'Comunicações', route: '/(main)/admin?section=comunicacoes&group=sistema', icon: <Ionicons name="megaphone" size={28} color="#fff" />, color: '#8B5CF6', description: 'Envie comunicados e avisos para toda a comunidade escolar.' },
  { section: 'Sistema', label: 'Segurança & Backups', route: '/(main)/admin?section=seguranca&group=sistema', icon: <Ionicons name="shield-checkmark" size={28} color="#fff" />, color: '#22c55e', description: 'Gira backups da base de dados e definições de segurança do sistema.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTOR
// ─────────────────────────────────────────────────────────────────────────────
export const DIRECTOR_TOUR_KEY = 'director_tour_done_v1';
export const DIRECTOR_TOUR_STEPS: TourStep[] = [
  { section: 'Principal', label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'O seu centro de comando — visão consolidada de toda a escola em tempo real.' },
  { section: 'Secretaria', label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.info, description: 'Acompanhe matrículas, pautas e processos administrativos da secretaria.' },
  { section: 'Secretaria', label: 'Área Pedagógica', route: '/(main)/pedagogico', icon: <MaterialCommunityIcons name="clipboard-list" size={28} color="#fff" />, color: Colors.accent, description: 'Supervisione alunos, professores, turmas e resultados pedagógicos.' },
  { section: 'Secretaria', label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={28} color="#fff" />, color: Colors.success, description: 'Pesquise rapidamente qualquer aluno e o seu processo completo.' },
  { section: 'Análise', label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={28} color="#fff" />, color: Colors.warning, description: 'Compare o desempenho da escola ao longo de vários anos lectivos.' },
  { section: 'Análise', label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={28} color="#fff" />, color: '#0ea5e9', description: 'Relatórios detalhados sobre todas as áreas da escola.' },
  { section: 'Financeiro', label: 'Tesouraria', route: '/(main)/tesouraria', icon: <MaterialCommunityIcons name="finance" size={28} color="#fff" />, color: '#8B5CF6', description: 'Acompanhe o fluxo financeiro e a saúde económica da escola.' },
  { section: 'Financeiro', label: 'Módulo Financeiro', route: '/(main)/financeiro', icon: <MaterialCommunityIcons name="cash" size={28} color="#fff" />, color: '#22c55e', description: 'Gestão financeira completa — pagamentos, propinas e relatórios.' },
  { section: 'Recursos Humanos', label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={28} color="#fff" />, color: '#f59e0b', description: 'Gestão de pessoal, faltas e folha salarial dos funcionários.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CEO / PCA — inclui a diferença entre painel de subscrição (só CEO) e o resto igual
// ─────────────────────────────────────────────────────────────────────────────
export const CEO_TOUR_KEY = 'ceo_tour_done_v1';
export const CEO_TOUR_STEPS: TourStep[] = [
  { section: 'Painel CEO', label: 'Painel CEO (Subscrição)', route: '/(main)/ceo', icon: <MaterialCommunityIcons name="crown" size={28} color="#fff" />, color: Colors.gold, description: 'Gira a licença e subscrição da escola na plataforma.' },
  { section: 'Painel CEO', label: 'Dashboard Escolar', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.info, description: 'Visão consolidada de toda a escola — académico, financeiro e pessoal.' },
  { section: 'Secretaria', label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.accent, description: 'Acompanhe matrículas, pautas e processos administrativos.' },
  { section: 'Secretaria', label: 'Área Pedagógica', route: '/(main)/pedagogico', icon: <MaterialCommunityIcons name="clipboard-list" size={28} color="#fff" />, color: Colors.success, description: 'Supervisione alunos, professores, turmas e resultados pedagógicos.' },
  { section: 'Análise', label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={28} color="#fff" />, color: Colors.warning, description: 'Compare o desempenho da escola ao longo de vários anos lectivos.' },
  { section: 'Análise', label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={28} color="#fff" />, color: '#0ea5e9', description: 'Relatórios detalhados sobre todas as áreas da escola.' },
  { section: 'Financeiro', label: 'Tesouraria', route: '/(main)/tesouraria', icon: <MaterialCommunityIcons name="finance" size={28} color="#fff" />, color: '#8B5CF6', description: 'Acompanhe o fluxo financeiro e a saúde económica da escola.' },
  { section: 'Financeiro', label: 'Módulo Financeiro', route: '/(main)/financeiro', icon: <MaterialCommunityIcons name="cash" size={28} color="#fff" />, color: '#22c55e', description: 'Gestão financeira completa — pagamentos, propinas e relatórios.' },
  { section: 'Recursos Humanos', label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={28} color="#fff" />, color: '#f59e0b', description: 'Gestão de pessoal, faltas e folha salarial dos funcionários.' },
  { section: 'Administração', label: 'Configuração da Escola', route: '/(main)/admin?section=escola&group=sistema', icon: <Ionicons name="school" size={28} color="#fff" />, color: Colors.danger, description: 'Configure a identidade, dados e definições institucionais da escola.' },
];

// PCA tem exactamente o mesmo menu que o CEO, excepto o "Painel CEO (Subscrição)"
export const PCA_TOUR_KEY = 'pca_tour_done_v1';
export const PCA_TOUR_STEPS: TourStep[] = CEO_TOUR_STEPS.filter(s => s.route !== '/(main)/ceo');

// ─────────────────────────────────────────────────────────────────────────────
// CONSELHO PEDAGÓGICO (membro)
// ─────────────────────────────────────────────────────────────────────────────
export const CONSELHO_PEDAGOGICO_TOUR_KEY = 'conselho_pedagogico_tour_done_v1';
export const CONSELHO_PEDAGOGICO_TOUR_STEPS: TourStep[] = [
  { section: 'Principal', label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'Visão geral da escola com indicadores académicos relevantes ao Conselho.' },
  { section: 'Conselho Pedagógico', label: 'Conselho Pedagógico', route: '/(main)/conselho?tipo=pedagogico', icon: <MaterialCommunityIcons name="account-group" size={28} color="#fff" />, color: Colors.info, description: 'O seu espaço de trabalho — reuniões, deliberações e validações do Conselho.' },
  { section: 'Conselho Pedagógico', label: 'Reuniões', route: '/(main)/conselho?tipo=pedagogico&tab=reunioes', icon: <MaterialCommunityIcons name="calendar-clock" size={28} color="#fff" />, color: Colors.accent, description: 'Agende e consulte as actas das reuniões do Conselho Pedagógico.' },
  { section: 'Conselho Pedagógico', label: 'Deliberações', route: '/(main)/conselho?tipo=pedagogico&tab=deliberacoes', icon: <MaterialCommunityIcons name="vote" size={28} color="#fff" />, color: Colors.success, description: 'Registe e consulte as deliberações tomadas pelo Conselho.' },
  { section: 'Conselho Pedagógico', label: 'Validação de Pautas', route: '/(main)/conselho?tipo=pedagogico&tab=validacoes', icon: <MaterialCommunityIcons name="file-check" size={28} color="#fff" />, color: Colors.warning, description: 'Valide as pautas trimestrais antes do fecho definitivo.' },
  { section: 'Conselho Pedagógico', label: 'Membros', route: '/(main)/conselho?tipo=pedagogico&tab=membros', icon: <MaterialCommunityIcons name="account-multiple-check" size={28} color="#fff" />, color: '#8B5CF6', description: 'Consulte a composição actual do Conselho Pedagógico.' },
  { section: 'Área Académica', label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={28} color="#fff" />, color: '#0ea5e9', description: 'Acompanhe o lançamento de notas por turma e disciplina.' },
  { section: 'Área Académica', label: 'Análise de Desempenho', route: '/(main)/desempenho', icon: <MaterialCommunityIcons name="chart-areaspline" size={28} color="#fff" />, color: '#22c55e', description: 'Gráficos de desempenho académico para apoiar as decisões do Conselho.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONSELHO DE ESCOLA (membro)
// ─────────────────────────────────────────────────────────────────────────────
export const CONSELHO_ESCOLA_TOUR_KEY = 'conselho_escola_tour_done_v1';
export const CONSELHO_ESCOLA_TOUR_STEPS: TourStep[] = [
  { section: 'Principal', label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={28} color="#fff" />, color: Colors.gold, description: 'Visão geral da escola com indicadores relevantes ao Conselho de Escola.' },
  { section: 'Conselho de Escola', label: 'Conselho de Escola', route: '/(main)/conselho?tipo=escola', icon: <MaterialCommunityIcons name="office-building" size={28} color="#fff" />, color: Colors.info, description: 'O seu espaço de trabalho — reuniões, deliberações e supervisão institucional.' },
  { section: 'Conselho de Escola', label: 'Reuniões', route: '/(main)/conselho?tipo=escola&tab=reunioes', icon: <MaterialCommunityIcons name="calendar-clock" size={28} color="#fff" />, color: Colors.accent, description: 'Agende e consulte as actas das reuniões do Conselho de Escola.' },
  { section: 'Conselho de Escola', label: 'Deliberações', route: '/(main)/conselho?tipo=escola&tab=deliberacoes', icon: <MaterialCommunityIcons name="vote" size={28} color="#fff" />, color: Colors.success, description: 'Registe e consulte as deliberações institucionais tomadas pelo Conselho.' },
  { section: 'Conselho de Escola', label: 'Membros', route: '/(main)/conselho?tipo=escola&tab=membros', icon: <MaterialCommunityIcons name="account-multiple-check" size={28} color="#fff" />, color: Colors.warning, description: 'Consulte a composição actual do Conselho de Escola.' },
  { section: 'Supervisão', label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={28} color="#fff" />, color: '#8B5CF6', description: 'Base de dados de todos os alunos, para efeitos de supervisão institucional.' },
  { section: 'Supervisão', label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={28} color="#fff" />, color: '#0ea5e9', description: 'Relatórios institucionais sobre o funcionamento geral da escola.' },
  { section: 'Supervisão', label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={28} color="#fff" />, color: '#22c55e', description: 'Compare o desempenho da escola ao longo de vários anos lectivos.' },
];
