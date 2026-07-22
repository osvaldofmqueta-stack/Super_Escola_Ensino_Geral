// Dados de navegação partilhados entre DrawerLeft e GlobalSearch
// Usa nomes de ícone como string (sem JSX) para ser usável fora de componentes React

export type NavIconLib = 'ion' | 'mci' | 'fa5' | 'mi';

export interface NavDataItem {
  key: string;
  label: string;
  section: string;
  icon: string;
  iconLib?: NavIconLib;
  route: string;
  color: string;
}

// ── Paleta de cores por categoria ────────────────────────────────────────────
const C = {
  blue:   '#4A90D9',
  green:  '#22C47A',
  gold:   '#C89A2A',
  purple: '#8B5CF6',
  orange: '#D4920E',
  red:    '#D94F4F',
  teal:   '#3E9BD4',
  pink:   '#EC4899',
  muted:  '#8899AA',
};

// ── Itens comuns a todos os perfis ───────────────────────────────────────────
export const COMMON_ITEMS: NavDataItem[] = [
  { key: 'dashboard',       label: 'Dashboard',              section: 'Principal',        icon: 'grid',                   route: '/(main)/dashboard',          color: C.blue },
  { key: 'notificacoes',    label: 'Notificações',           section: 'Principal',        icon: 'notifications',          route: '/(main)/notificacoes',       color: C.orange },
  { key: 'perfil',          label: 'Meu Perfil',             section: 'Conta',            icon: 'person-circle',          route: '/(main)/perfil',             color: C.muted },
  { key: 'horario',         label: 'Horário',                section: 'Pedagógico',       icon: 'time',                   route: '/(main)/horario',            color: C.teal },
  { key: 'eventos',         label: 'Eventos Escolares',      section: 'Planeamento',      icon: 'calendar',               route: '/(main)/eventos',            color: C.teal },
  { key: 'calendario-acad', label: 'Calendário Académico',   section: 'Planeamento',      icon: 'calendar-month',  iconLib: 'mci', route: '/(main)/calendario-academico', color: C.teal },
  { key: 'biblioteca',      label: 'Biblioteca',             section: 'Pedagógico',       icon: 'library',                route: '/(main)/biblioteca',         color: C.green },
  { key: 'chat-interno',    label: 'Mensagens Internas',     section: 'Comunicação',      icon: 'chatbubbles',            route: '/(main)/chat-interno',       color: C.blue },
  { key: 'assistente',      label: 'Assistente IA',          section: 'Ferramentas',      icon: 'sparkles',               route: '/(main)/assistente',         color: C.gold },
  { key: 'portaria',        label: 'Portaria — Validar Cartão', section: 'Ferramentas',  icon: 'qrcode-scan', iconLib: 'mci', route: '/(main)/portaria',        color: C.muted },
];

// ── CEO / PCA ────────────────────────────────────────────────────────────────
export const CEO_PCA_ITEMS: NavDataItem[] = [
  { key: 'ceo-dashboard',   label: 'Painel CEO (Subscrição)',section: 'Painel CEO',       icon: 'crown',          iconLib: 'mci', route: '/(main)/ceo',            color: C.gold },
  { key: 'visao-geral',     label: 'Visão Geral Multi-Ano', section: 'Análise',          icon: 'chart-line',     iconLib: 'mci', route: '/(main)/visao-geral',    color: C.orange },
  { key: 'relatorios',      label: 'Relatórios',            section: 'Análise',          icon: 'bar-chart',              route: '/(main)/relatorios',         color: C.orange },
  // Pedagógico
  { key: 'alunos',          label: 'Alunos',                section: 'Área Pedagógica',  icon: 'people',                 route: '/(main)/alunos',             color: C.blue },
  { key: 'admissao',        label: 'Processo de Admissão',  section: 'Área Pedagógica',  icon: 'account-school', iconLib: 'mci', route: '/(main)/admissao',       color: C.green },
  { key: 'transferencias',  label: 'Transferências',        section: 'Área Pedagógica',  icon: 'transfer',       iconLib: 'mci', route: '/(main)/transferencias', color: C.orange },
  { key: 'professores',     label: 'Professores',           section: 'Área Pedagógica',  icon: 'chalkboard-teacher', iconLib: 'fa5', route: '/(main)/professores', color: C.blue },
  { key: 'turmas',          label: 'Turmas',                section: 'Área Pedagógica',  icon: 'layers',                 route: '/(main)/turmas',             color: C.blue },
  { key: 'salas',           label: 'Salas de Aula',         section: 'Área Pedagógica',  icon: 'door-open',      iconLib: 'mci', route: '/(main)/salas',          color: C.muted },
  { key: 'notas',           label: 'Notas & Pautas',        section: 'Área Pedagógica',  icon: 'document-text',          route: '/(main)/notas',              color: C.green },
  { key: 'presencas',       label: 'Presenças',             section: 'Área Pedagógica',  icon: 'checkmark-circle-outline', route: '/(main)/presencas',        color: C.green },
  { key: 'historico',       label: 'Histórico Académico',   section: 'Área Pedagógica',  icon: 'chart-timeline-variant', iconLib: 'mci', route: '/(main)/historico', color: C.teal },
  { key: 'grelha',          label: 'Grelha Curricular',     section: 'Área Pedagógica',  icon: 'library',                route: '/(main)/grelha',             color: C.teal },
  { key: 'disciplinas',     label: 'Disciplinas',           section: 'Área Pedagógica',  icon: 'book-outline',   iconLib: 'mci', route: '/(main)/disciplinas',    color: C.blue },
  { key: 'trabalhos-finais',label: 'Trabalhos Finais de Curso', section: 'Área Pedagógica', icon: 'book-education-outline', iconLib: 'mci', route: '/(main)/trabalhos-finais', color: C.teal },
  { key: 'avaliacao-prof',  label: 'Avaliação de Professores', section: 'Área Pedagógica', icon: 'star-check-outline', iconLib: 'mci', route: '/(main)/avaliacao-professores', color: C.gold },
  { key: 'planos-aula',     label: 'Planos de Aula',        section: 'Área Pedagógica',  icon: 'book-education-outline', iconLib: 'mci', route: '/(main)/pedagogico?tab=planos_aula', color: C.green },
  { key: 'exclusoes-faltas',label: 'Exclusões & Faltas',    section: 'Área Pedagógica',  icon: 'account-cancel', iconLib: 'mci', route: '/(main)/exclusoes-faltas', color: C.red },
  { key: 'quadro-honra',    label: 'Quadro de Honra',       section: 'Área Pedagógica',  icon: 'trophy',         iconLib: 'mci', route: '/(main)/quadro-honra',   color: C.gold },
  { key: 'finalistas',      label: 'Estudantes Finalistas', section: 'Área Pedagógica',  icon: 'school',         iconLib: 'mci', route: '/(main)/finalistas',     color: C.green },
  { key: 'pedagogico',      label: 'Área Pedagógica',       section: 'Área Pedagógica',  icon: 'clipboard-list', iconLib: 'mci', route: '/(main)/pedagogico',     color: C.green },
  // Secretaria
  { key: 'sec-hub',         label: 'Painel da Secretaria',  section: 'Secretaria',        icon: 'grid',                   route: '/(main)/secretaria-hub?tab=visao', color: C.blue },
  { key: 'consulta-aluno',  label: 'Consulta de Aluno',     section: 'Secretaria',        icon: 'account-search', iconLib: 'mci', route: '/(main)/consulta-aluno', color: C.blue },
  { key: 'sec-pautas',      label: 'Pautas (Hub)',          section: 'Secretaria',        icon: 'ribbon',                 route: '/(main)/secretaria-hub?tab=pautas', color: C.green },
  { key: 'sec-processos',   label: 'Processos (Hub)',       section: 'Secretaria',        icon: 'folder',                 route: '/(main)/secretaria-hub?tab=processos', color: C.teal },
  { key: 'sec-docs',        label: 'Documentos (Hub)',      section: 'Secretaria',        icon: 'document-text',          route: '/(main)/secretaria-hub?tab=documentos', color: C.teal },
  { key: 'sec-corresp',     label: 'Ofícios / Correspondência', section: 'Secretaria',   icon: 'mail',                   route: '/(main)/secretaria-hub?tab=correspondencia', color: C.blue },
  { key: 'editor-docs',     label: 'Editor de Documentos',  section: 'Secretaria',        icon: 'newspaper',              route: '/(main)/editor-documentos', color: C.teal },
  { key: 'arquivo-docs',    label: 'Arquivo de Documentos', section: 'Secretaria',        icon: 'folder-multiple', iconLib: 'mci', route: '/(main)/arquivo-documentos', color: C.teal },
  // Financeiro
  { key: 'tesouraria',      label: 'Tesouraria',            section: 'Financeiro',        icon: 'finance',        iconLib: 'mci', route: '/(main)/tesouraria',     color: C.gold },
  { key: 'financeiro',      label: 'Módulo Financeiro',     section: 'Financeiro',        icon: 'cash',           iconLib: 'mci', route: '/(main)/financeiro',     color: C.gold },
  { key: 'extrato-propinas',label: 'Extracto de Propinas',  section: 'Financeiro',        icon: 'file-invoice-dollar', iconLib: 'fa5', route: '/(main)/extrato-propinas', color: C.gold },
  { key: 'bolsas',          label: 'Bolsas & Descontos',    section: 'Financeiro',        icon: 'school-outline', iconLib: 'mci', route: '/(main)/bolsas',         color: C.gold },
  { key: 'rupes-historico', label: 'Histórico de RUPEs',    section: 'Financeiro',        icon: 'receipt',                route: '/(main)/rupes-historico',    color: C.gold },
  { key: 'pagamentos-hub',  label: 'Hub de Pagamentos',     section: 'Financeiro',        icon: 'cash-multiple',  iconLib: 'mci', route: '/(main)/pagamentos-hub', color: C.green },
  // RH
  { key: 'rh-hub',          label: 'Recursos Humanos (Hub)',section: 'Recursos Humanos',  icon: 'account-tie',    iconLib: 'mci', route: '/(main)/rh-hub',         color: C.purple },
  { key: 'rh-controle',     label: 'Gestão de Pessoal',     section: 'Recursos Humanos',  icon: 'account-group',  iconLib: 'mci', route: '/(main)/rh-controle',    color: C.purple },
  { key: 'rh-faltas',       label: 'Faltas & Remunerações', section: 'Recursos Humanos',  icon: 'calendar-remove',iconLib: 'mci', route: '/(main)/rh-faltas-tempos', color: C.orange },
  { key: 'rh-payroll',      label: 'Folha de Salários',     section: 'Recursos Humanos',  icon: 'cash-multiple',  iconLib: 'mci', route: '/(main)/rh-payroll',     color: C.green },
  // Administração
  { key: 'admin-matriculas',label: 'Matrículas Pendentes',  section: 'Administração',     icon: 'account-plus',   iconLib: 'mci', route: '/(main)/admin?section=matriculas&group=academico', color: C.orange },
  { key: 'admin-cursos',    label: 'Gestão de Cursos',      section: 'Administração',     icon: 'book-open-variant', iconLib: 'mci', route: '/(main)/admin?section=cursos&group=academico', color: C.blue },
  { key: 'admin-anos',      label: 'Ano Académico',         section: 'Administração',     icon: 'calendar',               route: '/(main)/admin?section=anos&group=academico', color: C.teal },
  { key: 'admin-reabertura',label: 'Reabertura de Notas',   section: 'Administração',     icon: 'lock-open-variant', iconLib: 'mci', route: '/(main)/admin?section=reabertura&group=academico', color: C.orange },
  { key: 'admin-lancamento',label: 'Lançamento de Notas',   section: 'Administração',     icon: 'key-variant',    iconLib: 'mci', route: '/(main)/admin?section=solicit_avaliacao&group=academico', color: C.gold },
  { key: 'admin-users',     label: 'Utilizadores',          section: 'Administração',     icon: 'people',                 route: '/(main)/admin?section=usuarios&group=pessoal', color: C.blue },
  { key: 'admin-acessos',   label: 'Permissões / Acessos',  section: 'Administração',     icon: 'account-key',    iconLib: 'mci', route: '/(main)/admin?section=acessos&group=pessoal', color: C.purple },
  { key: 'admin-escola',    label: 'Configuração da Escola', section: 'Administração',    icon: 'school',                 route: '/(main)/admin?section=escola&group=sistema', color: C.muted },
  { key: 'admin-config',    label: 'Configurações Gerais',  section: 'Administração',     icon: 'settings',               route: '/(main)/admin?section=config&group=sistema', color: C.muted },
  { key: 'admin-comun',     label: 'Comunicações',          section: 'Administração',     icon: 'megaphone',              route: '/(main)/admin?section=comunicacoes&group=sistema', color: C.teal },
  { key: 'admin-seguranca', label: 'Segurança & Backups',   section: 'Administração',     icon: 'shield-checkmark',       route: '/(main)/admin?section=seguranca&group=sistema', color: C.red },
  { key: 'auditoria',       label: 'Auditoria do Sistema',  section: 'Administração',     icon: 'shield-check',   iconLib: 'mci', route: '/(main)/auditoria',      color: C.purple },

  { key: 'med-integracao',  label: 'Integração MED/SIGE',   section: 'Administração',     icon: 'connection',     iconLib: 'mci', route: '/(main)/med-integracao', color: C.muted },
  { key: 'desempenho',      label: 'Análise de Desempenho', section: 'Análise',           icon: 'chart-areaspline',iconLib:'mci', route: '/(main)/desempenho',      color: C.orange },
  { key: 'desempenho-prof', label: 'Desempenho de Professores', section: 'Análise',       icon: 'chart-bar',      iconLib: 'mci', route: '/(main)/desempenho-professores', color: C.orange },
];

// ── Professor ─────────────────────────────────────────────────────────────────
export const PROFESSOR_ITEMS: NavDataItem[] = [
  { key: 'prof-hub',        label: 'Meu Painel (Hub)',       section: 'Painel do Professor', icon: 'grid',               route: '/(main)/professor-hub',      color: C.blue },
  { key: 'prof-turmas',     label: 'Minhas Turmas',          section: 'Área Pedagógica',  icon: 'layers',                 route: '/(main)/professor-turmas',   color: C.blue },
  { key: 'notas',           label: 'Notas & Lançamentos',    section: 'Área Pedagógica',  icon: 'document-text',          route: '/(main)/notas',              color: C.green },
  { key: 'prof-pauta',      label: 'Gestão de Pautas',       section: 'Área Pedagógica',  icon: 'file-lock-outline', iconLib: 'mci', route: '/(main)/professor-pauta', color: C.orange },
  { key: 'prof-sumario',    label: 'Sumário / Presenças',    section: 'Área Pedagógica',  icon: 'clipboard-check', iconLib: 'mci', route: '/(main)/professor-sumario', color: C.green },
  { key: 'pedagogico-plan', label: 'Planificações',          section: 'Área Pedagógica',  icon: 'clipboard-list',  iconLib: 'mci', route: '/(main)/pedagogico?tab=planificacoes', color: C.teal },
  { key: 'pedagogico-prog', label: 'Programa Curricular',    section: 'Área Pedagógica',  icon: 'book-open-variant', iconLib: 'mci', route: '/(main)/pedagogico?tab=programa', color: C.teal },
  { key: 'pedagogico-res',  label: 'Resultados Pedagógicos', section: 'Área Pedagógica',  icon: 'chart-bar',       iconLib: 'mci', route: '/(main)/pedagogico?tab=resultados', color: C.orange },
  { key: 'pedagogico-ocor', label: 'Ocorrências',            section: 'Área Pedagógica',  icon: 'alert-circle-outline', iconLib: 'mci', route: '/(main)/pedagogico?tab=ocorrencias', color: C.red },
  { key: 'plano-aula',      label: 'Planos de Aula',         section: 'Área Pedagógica',  icon: 'book-education-outline', iconLib: 'mci', route: '/(main)/pedagogico?tab=planos_aula', color: C.green },
  { key: 'avaliacao-prof',  label: 'Avaliação de Professores', section: 'Área Pedagógica', icon: 'star-check-outline', iconLib: 'mci', route: '/(main)/avaliacao-professores', color: C.gold },
  { key: 'trabalhos-finais',label: 'Trabalhos Finais de Curso', section: 'Área Pedagógica', icon: 'book-education-outline', iconLib: 'mci', route: '/(main)/trabalhos-finais', color: C.teal },
  { key: 'prof-msgs',       label: 'Mensagens',              section: 'Comunicação',      icon: 'chatbubbles',            route: '/(main)/professor-mensagens', color: C.blue },
  { key: 'prof-materiais',  label: 'Materiais Didácticos',   section: 'Comunicação',      icon: 'folder-open',            route: '/(main)/professor-materiais', color: C.teal },
];

// ── Conselho Pedagógico ───────────────────────────────────────────────────────
export const CONSELHO_PEDAGOGICO_ITEMS: NavDataItem[] = [
  { key: 'conselho-ped',    label: 'Conselho Pedagógico',   section: 'Conselho Pedagógico', icon: 'account-group', iconLib: 'mci', route: '/(main)/conselho?tipo=pedagogico', color: C.purple },
  { key: 'conselho-reunioes-ped', label: 'Reuniões',        section: 'Conselho Pedagógico', icon: 'calendar-clock', iconLib: 'mci', route: '/(main)/conselho?tipo=pedagogico&tab=reunioes', color: C.blue },
  { key: 'conselho-delib-ped',   label: 'Deliberações',     section: 'Conselho Pedagógico', icon: 'vote',           iconLib: 'mci', route: '/(main)/conselho?tipo=pedagogico&tab=deliberacoes', color: C.orange },
  { key: 'conselho-valid-ped',   label: 'Validação de Pautas', section: 'Conselho Pedagógico', icon: 'file-check', iconLib: 'mci', route: '/(main)/conselho?tipo=pedagogico&tab=validacoes', color: C.green },
  { key: 'conselho-membros-ped', label: 'Membros do Conselho', section: 'Conselho Pedagógico', icon: 'account-multiple-check', iconLib: 'mci', route: '/(main)/conselho?tipo=pedagogico&tab=membros', color: C.teal },
  { key: 'notas',           label: 'Notas & Pautas',        section: 'Área Académica',    icon: 'document-text',          route: '/(main)/notas',              color: C.green },
  { key: 'alunos',          label: 'Alunos',                section: 'Área Académica',    icon: 'people',                 route: '/(main)/alunos',             color: C.blue },
  { key: 'professores',     label: 'Professores',           section: 'Área Académica',    icon: 'chalkboard-teacher', iconLib: 'fa5', route: '/(main)/professores', color: C.blue },
  { key: 'turmas',          label: 'Turmas',                section: 'Área Académica',    icon: 'layers',                 route: '/(main)/turmas',             color: C.blue },
  { key: 'desempenho',      label: 'Análise de Desempenho', section: 'Área Académica',    icon: 'chart-areaspline', iconLib: 'mci', route: '/(main)/desempenho', color: C.orange },
  { key: 'relatorios',      label: 'Relatórios',            section: 'Área Académica',    icon: 'bar-chart',              route: '/(main)/relatorios',         color: C.orange },
];

// ── Conselho de Escola ────────────────────────────────────────────────────────
export const CONSELHO_ESCOLA_ITEMS: NavDataItem[] = [
  { key: 'conselho-esc',    label: 'Conselho de Escola',    section: 'Conselho de Escola', icon: 'office-building', iconLib: 'mci', route: '/(main)/conselho?tipo=escola', color: C.gold },
  { key: 'conselho-reunioes-esc', label: 'Reuniões',         section: 'Conselho de Escola', icon: 'calendar-clock', iconLib: 'mci', route: '/(main)/conselho?tipo=escola&tab=reunioes', color: C.blue },
  { key: 'conselho-delib-esc',   label: 'Deliberações',      section: 'Conselho de Escola', icon: 'vote',           iconLib: 'mci', route: '/(main)/conselho?tipo=escola&tab=deliberacoes', color: C.orange },
  { key: 'conselho-membros-esc', label: 'Membros do Conselho', section: 'Conselho de Escola', icon: 'account-multiple-check', iconLib: 'mci', route: '/(main)/conselho?tipo=escola&tab=membros', color: C.teal },
  { key: 'alunos',          label: 'Alunos',                section: 'Supervisão',        icon: 'people',                 route: '/(main)/alunos',             color: C.blue },
  { key: 'historico',       label: 'Histórico Académico',   section: 'Supervisão',        icon: 'chart-timeline-variant', iconLib: 'mci', route: '/(main)/historico', color: C.teal },
  { key: 'relatorios',      label: 'Relatórios',            section: 'Supervisão',        icon: 'bar-chart',              route: '/(main)/relatorios',         color: C.orange },
  { key: 'visao-geral',     label: 'Visão Geral Multi-Ano', section: 'Supervisão',        icon: 'chart-line',     iconLib: 'mci', route: '/(main)/visao-geral',    color: C.orange },
  { key: 'desempenho',      label: 'Análise de Desempenho', section: 'Supervisão',        icon: 'chart-areaspline', iconLib: 'mci', route: '/(main)/desempenho',  color: C.orange },
];

// ── Aluno ─────────────────────────────────────────────────────────────────────
export const ALUNO_ITEMS: NavDataItem[] = [
  { key: 'portal-aluno',    label: 'Portal do Estudante',   section: 'Meu Portal',        icon: 'grid',                   route: '/(main)/portal-estudante',   color: C.blue },
  { key: 'historico',       label: 'Histórico Académico',   section: 'Área Pedagógica',   icon: 'chart-timeline-variant', iconLib: 'mci', route: '/(main)/historico', color: C.teal },
  { key: 'pagamentos-fin',  label: 'Pagamentos & Saldo',    section: 'Financeiro',        icon: 'cash-multiple',  iconLib: 'mci', route: '/(main)/portal-estudante?tab=financeiro', color: C.gold },
  { key: 'rupes',           label: 'Referências RUPE',      section: 'Financeiro',        icon: 'receipt',                route: '/(main)/portal-estudante?tab=rupes', color: C.gold },
];

// ── Encarregado ──────────────────────────────────────────────────────────────
export const ENCARREGADO_ITEMS: NavDataItem[] = [
  { key: 'painel-educ',     label: 'Painel do Educando',    section: 'Portal do Encarregado', icon: 'account-child', iconLib: 'mci', route: '/(main)/portal-encarregado?tab=painel', color: C.blue },
  { key: 'notas-enc',       label: 'Notas do Educando',     section: 'Portal do Encarregado', icon: 'document-text',  route: '/(main)/portal-encarregado?tab=notas', color: C.green },
  { key: 'presencas-enc',   label: 'Presenças do Educando', section: 'Portal do Encarregado', icon: 'checkmark-circle-outline', route: '/(main)/portal-encarregado?tab=presencas', color: C.green },
  { key: 'faltas-enc',      label: 'Faltas do Educando',    section: 'Portal do Encarregado', icon: 'close-circle-outline', route: '/(main)/portal-encarregado?tab=faltas', color: C.red },
  { key: 'diario-enc',      label: 'Diário do Educando',    section: 'Portal do Encarregado', icon: 'book-outline',   route: '/(main)/portal-encarregado?tab=diario', color: C.teal },
  { key: 'horario-enc',     label: 'Horário do Educando',   section: 'Portal do Encarregado', icon: 'time-outline',   route: '/(main)/portal-encarregado?tab=horario', color: C.teal },
  { key: 'materiais-enc',   label: 'Materiais Didácticos',  section: 'Portal do Encarregado', icon: 'library-outline', route: '/(main)/portal-encarregado?tab=materiais', color: C.blue },
  { key: 'calendario-enc',  label: 'Calendário Escolar',    section: 'Portal do Encarregado', icon: 'calendar-outline', route: '/(main)/portal-encarregado?tab=calendario', color: C.teal },
  { key: 'fin-enc',         label: 'Propinas & Pagamentos', section: 'Portal do Encarregado', icon: 'cash',           iconLib: 'mci', route: '/(main)/portal-encarregado?tab=financeiro', color: C.gold },
  { key: 'msgs-enc',        label: 'Mensagens',             section: 'Portal do Encarregado', icon: 'chatbubbles-outline', route: '/(main)/portal-encarregado?tab=mensagens', color: C.blue },
];

// ── Financeiro ───────────────────────────────────────────────────────────────
export const FINANCEIRO_ITEMS: NavDataItem[] = [
  { key: 'tesouraria',      label: 'Tesouraria',            section: 'Painel Financeiro', icon: 'finance',         iconLib: 'mci', route: '/(main)/tesouraria',     color: C.gold },
  { key: 'fin-painel',      label: 'Gestão Financeira',     section: 'Painel Financeiro', icon: 'cash',            iconLib: 'mci', route: '/(main)/financeiro?tab=painel', color: C.gold },
  { key: 'fin-resumo',      label: 'Resumo Financeiro',     section: 'Painel Financeiro', icon: 'chart-pie',       iconLib: 'mci', route: '/(main)/financeiro?tab=resumo', color: C.orange },
  { key: 'fin-atraso',      label: 'Propinas em Atraso',    section: 'Painel Financeiro', icon: 'alert-circle-outline', iconLib: 'mci', route: '/(main)/financeiro?tab=em_atraso', color: C.red },
  { key: 'fin-msgs',        label: 'Mensagens Financeiras', section: 'Painel Financeiro', icon: 'message-text-outline', iconLib: 'mci', route: '/(main)/financeiro?tab=mensagens', color: C.blue },
  { key: 'fin-por-aluno',   label: 'Financeiro por Aluno',  section: 'Painel Financeiro', icon: 'account-details', iconLib: 'mci', route: '/(main)/financeiro?tab=por_aluno', color: C.blue },
  { key: 'fin-pagamentos',  label: 'Pagamentos',            section: 'Painel Financeiro', icon: 'cash-multiple',   iconLib: 'mci', route: '/(main)/financeiro?tab=pagamentos', color: C.green },
  { key: 'fin-rubricas',    label: 'Rubricas / Taxas',      section: 'Painel Financeiro', icon: 'format-list-bulleted-type', iconLib: 'mci', route: '/(main)/financeiro?tab=rubricas', color: C.muted },
  { key: 'fin-orcamento',   label: 'Orçamento Anual',       section: 'Painel Financeiro', icon: 'speedometer',     iconLib: 'mci', route: '/(main)/financeiro?tab=orcamento', color: C.orange },
  { key: 'fin-analise',     label: 'Análise de Resultados', section: 'Painel Financeiro', icon: 'chart-bar',       iconLib: 'mci', route: '/(main)/financeiro?tab=relatorios', color: C.orange },
  { key: 'fin-relat',       label: 'Relatórios Financeiros',section: 'Painel Financeiro', icon: 'chart-line',      iconLib: 'mci', route: '/(main)/financeiro?tab=relatorios_fin', color: C.orange },
  { key: 'fin-plano-contas',label: 'Plano de Contas',       section: 'Painel Financeiro', icon: 'file-tree',       iconLib: 'mci', route: '/(main)/financeiro?tab=plano_contas', color: C.muted },
  { key: 'fin-contas-pagar',label: 'Contas a Pagar',        section: 'Painel Financeiro', icon: 'credit-card-clock', iconLib: 'mci', route: '/(main)/financeiro?tab=contas_pagar', color: C.red },
  { key: 'fin-fiscal',      label: 'Configuração Fiscal',   section: 'Painel Financeiro', icon: 'file-percent',    iconLib: 'mci', route: '/(main)/financeiro?tab=config_fiscal', color: C.muted },
  { key: 'fin-feriados',    label: 'Feriados',              section: 'Painel Financeiro', icon: 'calendar-star',   iconLib: 'mci', route: '/(main)/financeiro?tab=feriados', color: C.teal },
  { key: 'fin-sol-docs',    label: 'Solicitações de Documentos', section: 'Painel Financeiro', icon: 'file-document-edit', iconLib: 'mci', route: '/(main)/financeiro?tab=solicitacoes_docs', color: C.teal },
  { key: 'pagamentos-hub',  label: 'Hub de Pagamentos',     section: 'Painel Financeiro', icon: 'cash-multiple',   iconLib: 'mci', route: '/(main)/pagamentos-hub', color: C.green },
  { key: 'docs-hub',        label: 'Documentos & Multicaixa', section: 'Painel Financeiro', icon: 'file-document-multiple', iconLib: 'mci', route: '/(main)/documentos-hub', color: C.teal },
  { key: 'extrato-propinas',label: 'Extracto de Propinas',  section: 'Painel Financeiro', icon: 'file-invoice-dollar', iconLib: 'fa5', route: '/(main)/extrato-propinas', color: C.gold },
  { key: 'rupes-historico', label: 'Histórico de RUPEs',    section: 'Painel Financeiro', icon: 'receipt',                route: '/(main)/rupes-historico',    color: C.gold },
  { key: 'bolsas',          label: 'Bolsas & Descontos',    section: 'Painel Financeiro', icon: 'school-outline',  iconLib: 'mci', route: '/(main)/bolsas',         color: C.gold },
];

// ── Secretaria ───────────────────────────────────────────────────────────────
export const SECRETARIA_ITEMS: NavDataItem[] = [
  { key: 'sec-hub',         label: 'Painel da Secretaria',  section: 'Secretaria',        icon: 'grid',                   route: '/(main)/secretaria-hub?tab=visao', color: C.blue },
  { key: 'consulta-aluno',  label: 'Consulta de Aluno',     section: 'Secretaria',        icon: 'account-search', iconLib: 'mci', route: '/(main)/consulta-aluno', color: C.blue },
  { key: 'sec-pautas',      label: 'Pautas (Hub)',          section: 'Secretaria',        icon: 'ribbon',                 route: '/(main)/secretaria-hub?tab=pautas', color: C.green },
  { key: 'sec-cursos',      label: 'Cursos (Hub)',          section: 'Secretaria',        icon: 'school',                 route: '/(main)/secretaria-hub?tab=cursos', color: C.blue },
  { key: 'sec-processos',   label: 'Processos (Hub)',       section: 'Secretaria',        icon: 'folder',                 route: '/(main)/secretaria-hub?tab=processos', color: C.teal },
  { key: 'sec-docs',        label: 'Documentos (Hub)',      section: 'Secretaria',        icon: 'document-text',          route: '/(main)/secretaria-hub?tab=documentos', color: C.teal },
  { key: 'sec-corresp',     label: 'Ofícios / Correspondência', section: 'Secretaria',   icon: 'mail',                   route: '/(main)/secretaria-hub?tab=correspondencia', color: C.blue },
  { key: 'sec-justif',      label: 'Justificações de Faltas', section: 'Secretaria',     icon: 'clipboard',              route: '/(main)/secretaria-hub?tab=justificacoes', color: C.orange },
  { key: 'admissao',        label: 'Processo de Admissão',  section: 'Secretaria',        icon: 'account-school', iconLib: 'mci', route: '/(main)/admissao',       color: C.green },
  { key: 'organizar-turmas',label: 'Organizar Alunos em Turmas', section: 'Secretaria',  icon: 'account-group',  iconLib: 'mci', route: '/(main)/organizar-turmas', color: C.blue },
  { key: 'editor-docs',     label: 'Editor de Documentos',  section: 'Secretaria',        icon: 'newspaper',              route: '/(main)/editor-documentos',  color: C.teal },
  { key: 'arquivo-docs',    label: 'Arquivo de Documentos', section: 'Secretaria',        icon: 'folder-multiple',iconLib: 'mci', route: '/(main)/arquivo-documentos', color: C.teal },
  // Gestão académica
  { key: 'alunos',          label: 'Alunos',                section: 'Gestão Académica',  icon: 'people',                 route: '/(main)/alunos',             color: C.blue },
  { key: 'transferencias',  label: 'Transferências',        section: 'Gestão Académica',  icon: 'transfer',       iconLib: 'mci', route: '/(main)/transferencias', color: C.orange },
  { key: 'professores',     label: 'Professores',           section: 'Gestão Académica',  icon: 'chalkboard-teacher', iconLib: 'fa5', route: '/(main)/professores', color: C.blue },
  { key: 'turmas',          label: 'Turmas',                section: 'Gestão Académica',  icon: 'layers',                 route: '/(main)/turmas',             color: C.blue },
  { key: 'salas',           label: 'Salas de Aula',         section: 'Gestão Académica',  icon: 'door-open',      iconLib: 'mci', route: '/(main)/salas',          color: C.muted },
  { key: 'presencas',       label: 'Presenças',             section: 'Gestão Académica',  icon: 'checkmark-circle-outline', route: '/(main)/presencas',        color: C.green },
  { key: 'notas',           label: 'Notas & Pautas',        section: 'Gestão Académica',  icon: 'document-text',          route: '/(main)/notas',              color: C.green },
  { key: 'historico',       label: 'Histórico Académico',   section: 'Gestão Académica',  icon: 'chart-timeline-variant', iconLib: 'mci', route: '/(main)/historico', color: C.teal },
  { key: 'disciplinas',     label: 'Disciplinas',           section: 'Gestão Académica',  icon: 'book-outline',   iconLib: 'mci', route: '/(main)/disciplinas',    color: C.blue },
  { key: 'pagamentos-hub',  label: 'Hub de Pagamentos',     section: 'Financeiro',        icon: 'cash-multiple',  iconLib: 'mci', route: '/(main)/pagamentos-hub', color: C.green },
  { key: 'finalistas',      label: 'Estudantes Finalistas', section: 'Gestão Académica',  icon: 'school',         iconLib: 'mci', route: '/(main)/finalistas',     color: C.green },
];

// ── RH ───────────────────────────────────────────────────────────────────────
export const RH_ITEMS: NavDataItem[] = [
  { key: 'rh-pessoal',      label: 'Gestão de Pessoal',     section: 'Recursos Humanos',  icon: 'account-group',  iconLib: 'mci', route: '/(main)/rh-controle?tab=pessoal', color: C.purple },
  { key: 'rh-sumarios',     label: 'Sumários (RH)',         section: 'Recursos Humanos',  icon: 'clipboard-text-outline', iconLib: 'mci', route: '/(main)/rh-controle?tab=sumarios', color: C.teal },
  { key: 'rh-solicitacoes', label: 'Solicitações de Pessoal', section: 'Recursos Humanos', icon: 'email-outline', iconLib: 'mci', route: '/(main)/rh-controle?tab=solicitacoes', color: C.blue },
  { key: 'rh-cal-provas',   label: 'Calendário de Provas',  section: 'Recursos Humanos',  icon: 'calendar-check-outline', iconLib: 'mci', route: '/(main)/rh-controle?tab=calendario', color: C.teal },
  { key: 'rh-faltas-func',  label: 'Faltas dos Funcionários', section: 'Faltas & Tempos', icon: 'calendar-remove',iconLib: 'mci', route: '/(main)/rh-faltas-tempos?tab=faltas', color: C.orange },
  { key: 'rh-faltas-prof',  label: 'Faltas dos Professores', section: 'Faltas & Tempos', icon: 'account-tie',    iconLib: 'mci', route: '/(main)/rh-faltas-tempos?tab=professores', color: C.orange },
  { key: 'rh-admin-faltas', label: 'Administração de Faltas', section: 'Faltas & Tempos', icon: 'shield-account', iconLib: 'mci', route: '/(main)/rh-faltas-tempos?tab=admin', color: C.purple },
  { key: 'rh-config-faltas',label: 'Configuração de Faltas', section: 'Faltas & Tempos', icon: 'cog-outline',    iconLib: 'mci', route: '/(main)/rh-faltas-tempos?tab=configuracao', color: C.muted },
  { key: 'rh-sum-faltas',   label: 'Sumários (Faltas)',     section: 'Faltas & Tempos',   icon: 'clipboard-check-outline', iconLib: 'mci', route: '/(main)/rh-faltas-tempos?tab=sumarios', color: C.teal },
  { key: 'rh-rel-faltas',   label: 'Relatórios de Faltas',  section: 'Faltas & Tempos',   icon: 'chart-box-outline', iconLib: 'mci', route: '/(main)/rh-faltas-tempos?tab=relatorios', color: C.orange },
  { key: 'rh-painel-folha', label: 'Painel da Folha Salarial', section: 'Folha Salarial', icon: 'cash-multiple',  iconLib: 'mci', route: '/(main)/rh-payroll?tab=painel', color: C.green },
  { key: 'rh-folhas-pag',   label: 'Folhas de Pagamento',   section: 'Folha Salarial',    icon: 'receipt',        iconLib: 'mci', route: '/(main)/rh-payroll?tab=folhas', color: C.gold },
  { key: 'rh-func-folha',   label: 'Funcionários (Folha)',  section: 'Folha Salarial',    icon: 'account-cash',   iconLib: 'mci', route: '/(main)/rh-payroll?tab=funcionarios', color: C.purple },
  { key: 'rh-sumarios-ctrl',label: 'Sumários',              section: 'Controlo',          icon: 'clipboard-check', iconLib: 'mci', route: '/(main)/professor-sumario', color: C.teal },
];

// ── Pedagógico ───────────────────────────────────────────────────────────────
export const PEDAGOGICO_ITEMS: NavDataItem[] = [
  { key: 'pedagogico',      label: 'Área Pedagógica',       section: 'Área Pedagógica',   icon: 'clipboard-list', iconLib: 'mci', route: '/(main)/pedagogico',     color: C.green },
  { key: 'alunos',          label: 'Alunos',                section: 'Área Pedagógica',   icon: 'people',                 route: '/(main)/alunos',             color: C.blue },
  { key: 'admissao',        label: 'Processo de Admissão',  section: 'Área Pedagógica',   icon: 'account-school', iconLib: 'mci', route: '/(main)/admissao',       color: C.green },
  { key: 'notas',           label: 'Notas & Pautas',        section: 'Área Pedagógica',   icon: 'document-text',          route: '/(main)/notas',              color: C.green },
  { key: 'presencas',       label: 'Presenças',             section: 'Área Pedagógica',   icon: 'checkmark-circle-outline', route: '/(main)/presencas',         color: C.green },
  { key: 'historico',       label: 'Histórico Académico',   section: 'Área Pedagógica',   icon: 'chart-timeline-variant', iconLib: 'mci', route: '/(main)/historico', color: C.teal },
  { key: 'avaliacao-prof',  label: 'Avaliação de Professores', section: 'Área Pedagógica', icon: 'star-check-outline', iconLib: 'mci', route: '/(main)/avaliacao-professores', color: C.gold },
  { key: 'quadro-honra',    label: 'Quadro de Honra',       section: 'Área Pedagógica',   icon: 'trophy',         iconLib: 'mci', route: '/(main)/quadro-honra',   color: C.gold },
  { key: 'editor-docs',     label: 'Editor de Documentos',  section: 'Documentos & Análise', icon: 'newspaper',   route: '/(main)/editor-documentos',  color: C.teal },
  { key: 'relatorios',      label: 'Relatórios',            section: 'Documentos & Análise', icon: 'bar-chart',   route: '/(main)/relatorios',         color: C.orange },
  { key: 'desempenho',      label: 'Análise de Desempenho', section: 'Documentos & Análise', icon: 'chart-areaspline', iconLib: 'mci', route: '/(main)/desempenho', color: C.orange },
  { key: 'visao-geral',     label: 'Visão Geral Multi-Ano', section: 'Documentos & Análise', icon: 'chart-line',  iconLib: 'mci', route: '/(main)/visao-geral',    color: C.orange },
  { key: 'gestao-academica',label: 'Gestão Académica',      section: 'Área Pedagógica',   icon: 'school',         iconLib: 'mci', route: '/(main)/gestao-academica', color: C.blue },
];

// ── Itens comuns a excluir por role (não relevantes para esse perfil) ────────
const COMMON_EXCLUDE_BY_ROLE: Record<string, Set<string>> = {
  rh:         new Set(['horario', 'biblioteca', 'eventos', 'calendario-acad', 'portaria', 'assistente']),
  financeiro: new Set(['horario', 'biblioteca', 'portaria']),
  aluno:      new Set(['portaria', 'chat-interno', 'assistente']),
  encarregado:new Set(['portaria', 'chat-interno', 'assistente', 'horario', 'biblioteca']),
  professor:  new Set(['portaria']),
  diretor_turma: new Set(['portaria']),
};

// ── Função principal: devolve todos os itens de navegação para um perfil ─────
export function getNavItemsForRole(role: string): NavDataItem[] {
  let roleItems: NavDataItem[] = [];

  switch (role) {
    case 'ceo':
    case 'pca':
      roleItems = CEO_PCA_ITEMS;
      break;
    case 'admin':
    case 'director':
      roleItems = CEO_PCA_ITEMS;
      break;
    case 'professor':
    case 'diretor_turma':
      roleItems = PROFESSOR_ITEMS;
      break;
    case 'aluno':
      roleItems = ALUNO_ITEMS;
      break;
    case 'encarregado':
      roleItems = ENCARREGADO_ITEMS;
      break;
    case 'financeiro':
      roleItems = FINANCEIRO_ITEMS;
      break;
    case 'secretaria':
    case 'chefe_secretaria':
      roleItems = SECRETARIA_ITEMS;
      break;
    case 'rh':
      roleItems = RH_ITEMS;
      break;
    case 'pedagogico':
    case 'coordenador_curso':
      roleItems = PEDAGOGICO_ITEMS;
      break;
    default:
      roleItems = [];
  }

  const excludeKeys = COMMON_EXCLUDE_BY_ROLE[role] ?? new Set<string>();

  // Juntar itens comuns (filtrados) + do perfil, sem duplicados (chave única)
  const seen = new Set<string>();
  const merged: NavDataItem[] = [];
  for (const item of [...COMMON_ITEMS, ...roleItems]) {
    if (!seen.has(item.key) && !excludeKeys.has(item.key)) {
      seen.add(item.key);
      merged.push(item);
    }
  }
  return merged;
}
