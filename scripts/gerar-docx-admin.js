/**
 * Gera o documento de apresentação DOCX para o nível de utilizador: Administrador
 * Saída: apresentacao/SIGA_Apresentacao_Admin.docx
 */
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageBreak, VerticalAlign, TableLayoutType, convertInchesToTwip,
} = require('docx');
const fs = require('fs');
const path = require('path');

const SCREENS = path.join(__dirname, '../apresentacao/screens');
const OUT = path.join(__dirname, '../apresentacao/SIGA_Apresentacao_Admin.docx');

function img(file, w = 600, h = 338) {
  const full = path.join(SCREENS, file);
  if (!fs.existsSync(full)) return null;
  return new ImageRun({
    data: fs.readFileSync(full),
    transformation: { width: w, height: h },
    type: 'png',
  });
}

// ── Cores ────────────────────────────────────────────────────────────
const DARK_BG   = '0A1628';
const GOLD      = 'C9A227';
const BLUE_ACC  = '1E6FBF';
const TEAL      = '0E9384';
const TEXT_DARK = '1A1A2E';
const TEXT_BODY = '2D3748';
const LIGHT_BG  = 'F0F4F8';
const WHITE     = 'FFFFFF';
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

// ── Helpers ──────────────────────────────────────────────────────────
function spacer(lines = 1) {
  return Array.from({ length: lines }, () =>
    new Paragraph({ children: [new TextRun({ text: '', size: 18 })] })
  );
}

function coverTitle(text, color = WHITE, sz = 72) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, color, size: sz, bold: true, font: 'Calibri' })],
    spacing: { after: 80 },
  });
}

function coverSub(text, color = GOLD, sz = 36) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, color, size: sz, font: 'Calibri' })],
    spacing: { after: 60 },
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: text.toUpperCase(), color: WHITE, size: 36, bold: true, font: 'Calibri' })],
    shading: { type: ShadingType.SOLID, fill: DARK_BG },
    spacing: { before: 360, after: 180 },
    indent: { left: 200, right: 200 },
  });
}

function featureTitle(text, color = DARK_BG) {
  return new Paragraph({
    children: [new TextRun({ text, color, size: 30, bold: true, font: 'Calibri' })],
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD } },
  });
}

function featureSubtitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, color: BLUE_ACC, size: 22, bold: true, font: 'Calibri', italics: true })],
    spacing: { before: 40, after: 60 },
  });
}

function bodyParagraph(text) {
  return new Paragraph({
    children: [new TextRun({ text, color: TEXT_BODY, size: 22, font: 'Calibri' })],
    spacing: { before: 40, after: 80 },
    indent: { left: 100 },
  });
}

function bulletPoint(text) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, color: TEXT_BODY, size: 22, font: 'Calibri' })],
    spacing: { before: 30, after: 30 },
    indent: { left: 360, hanging: 260 },
  });
}

function screenshotParagraph(file, w = 620, h = 350) {
  const image = img(file, w, h);
  if (!image) return new Paragraph({ children: [new TextRun({ text: `[Imagem: ${file}]`, color: '999999', italics: true })] });
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [image],
    spacing: { before: 120, after: 120 },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: BLUE_ACC },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE_ACC },
      left:   { style: BorderStyle.SINGLE, size: 4, color: BLUE_ACC },
      right:  { style: BorderStyle.SINGLE, size: 4, color: BLUE_ACC },
    },
  });
}

function labelBadge(text, fill = BLUE_ACC) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    shading: { type: ShadingType.SOLID, fill },
    children: [new TextRun({ text: `  ${text}  `, color: WHITE, size: 20, bold: true, font: 'Calibri' })],
    spacing: { before: 60, after: 60 },
    indent: { left: 100 },
  });
}

function divider() {
  return new Paragraph({
    children: [new TextRun({ text: '' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E8D08A' } },
    spacing: { before: 160, after: 160 },
  });
}

// ── Secções de funcionalidades ────────────────────────────────────────
const FEATURES = [
  // ── GRUPO 1: PAINEL & VISÃO GERAL ───────────────────────────────
  {
    group: 'PAINEL DE CONTROLO & VISÃO GERAL',
    groupColor: DARK_BG,
    items: [
      {
        title: '1.1  Painel Principal (Dashboard)',
        badge: 'Visão Geral',
        objective: 'Fornecer ao Administrador uma visão instantânea e consolidada do estado operacional de toda a escola.',
        description: 'O Painel de Controlo apresenta em tempo real os indicadores mais críticos da instituição: número de alunos matriculados, professores activos, turmas abertas e taxa de aprovação global. A secção de Assistente IA identifica automaticamente anomalias operacionais e sugere acções correctivas. Gráficos de desempenho por disciplina e tabelas de feedback de utilizadores completam a vista.',
        bullets: [
          'Contadores em tempo real: alunos, professores, turmas, taxa de aprovação',
          'Monitor do Assistente IA com alertas operacionais',
          'Gráfico de desempenho por disciplina',
          'Feedback consolidado dos utilizadores do sistema',
          'Acesso rápido às últimas actividades registadas',
        ],
        screen: '01-dashboard.png',
      },
    ],
  },

  // ── GRUPO 2: ACADÉMICO ──────────────────────────────────────────
  {
    group: 'GESTÃO ACADÉMICA',
    groupColor: DARK_BG,
    items: [
      {
        title: '2.1  Ano Académico',
        badge: 'Académico',
        objective: 'Criar, activar e gerir os anos lectivos da instituição, incluindo períodos, trimestres e calendário escolar.',
        description: 'O Administrador define e gere os anos académicos da escola, configurando datas de início e fim, número de períodos lectivos e estrutura de avaliações. Apenas um ano académico pode estar activo de cada vez, garantindo consistência nos registos de notas, presenças e documentos emitidos.',
        bullets: [
          'Criação e activação de anos académicos (ex. 2025/2026)',
          'Configuração de trimestres e períodos lectivos',
          'Definição do mês de início do ano lectivo',
          'Histórico de anos anteriores com dados preservados',
        ],
        screen: '04-anos.png',
      },
      {
        title: '2.2  Matrículas Pendentes',
        badge: 'Académico',
        objective: 'Aprovar, rejeitar ou gerir todas as solicitações de matrícula submetidas online por encarregados de educação.',
        description: 'Centraliza o fluxo de inscrições recebidas via portal público. O Administrador visualiza todos os pedidos pendentes com dados completos do aluno e do encarregado, podendo aprovar para integração no sistema, rejeitar com justificação, ou solicitar documentação adicional.',
        bullets: [
          'Lista de pedidos pendentes, aprovados e rejeitados',
          'Visualização completa dos dados do aluno e encarregado',
          'Aprovação com enquadramento automático em turma',
          'Rejeição com mensagem personalizada ao encarregado',
        ],
        screen: '05-matriculas.png',
      },
      {
        title: '2.3  Gestão de Cursos',
        badge: 'Académico',
        objective: 'Definir a oferta formativa da escola: cursos, estrutura curricular, carga horária e disciplinas nucleares.',
        description: 'Permite ao Administrador criar e manter a estrutura de cursos oferecidos pela instituição. Para cada curso é possível configurar o nome, nível de ensino, duração, disciplinas obrigatórias, disciplinas nucleares para fins de Art. 23.º, e a portaria legal de referência.',
        bullets: [
          'Criação e edição de cursos por nível e ciclo de ensino',
          'Associação de disciplinas obrigatórias e nucleares',
          'Configuração de carga horária e ementa',
          'Referência à portaria ministerial de cada curso',
        ],
        screen: '06-cursos.png',
      },
      {
        title: '2.4  Disciplinas',
        badge: 'Académico',
        objective: 'Gerir o catálogo de disciplinas disponíveis na escola e a sua classificação.',
        description: 'O Administrador mantém o repositório central de disciplinas, classificando-as por área de conhecimento, marcando as nucleares para efeitos do Decreto 04/2026 e controlando a visibilidade de cada uma nos planos curriculares activos.',
        bullets: [
          'Catálogo de disciplinas com área e categorias',
          'Marcação de disciplinas nucleares (Art. 23.º)',
          'Gestão de categorias de formação',
          'Integração automática com planos curriculares',
        ],
        screen: '07-disciplinas.png',
      },
      {
        title: '2.5  Reabertura de Notas',
        badge: 'Académico',
        objective: 'Gerir pedidos de reabertura de campos de lançamento de notas submetidos por professores.',
        description: 'Após o fecho de um período de avaliação, os professores podem solicitar a reabertura do acesso para correcções. O Administrador revê cada pedido individualmente, podendo aprovar com prazo definido ou rejeitar, mantendo o registo de auditoria de todas as decisões.',
        bullets: [
          'Lista de pedidos de reabertura por disciplina e turma',
          'Aprovação com prazo de reabertura configurável',
          'Rejeição com motivo registado',
          'Histórico completo de reaberturas por período lectivo',
        ],
        screen: '08-reabertura.png',
      },
      {
        title: '2.6  Controlo de Lançamento de Notas',
        badge: 'Académico',
        objective: 'Abrir ou fechar o período de lançamento de avaliações por turma, disciplina ou professor.',
        description: 'Controla centralmente quando os professores podem lançar notas no sistema. O Administrador define prazos globais ou individuais, gere as prorrogações solicitadas e recebe alertas automáticos quando o prazo está a expirar sem lançamentos concluídos.',
        bullets: [
          'Abertura e fecho de campos de avaliação por turma',
          'Definição de prazos de lançamento por período',
          'Gestão de prorrogações com registo de motivo',
          'Alertas automáticos de incumprimento de prazo',
        ],
        screen: '09-avaliacoes.png',
      },
      {
        title: '2.7  Alunos',
        badge: 'Académico',
        objective: 'Consultar e gerir os registos completos de todos os alunos matriculados na escola.',
        description: 'Vista global de todos os alunos activos, inactivos e finalistas. O Administrador pode pesquisar por nome ou número, filtrar por turma, consultar o perfil completo de cada aluno incluindo dados pessoais, histórico académico, situação financeira e documentação, bem como enquadrar alunos em turmas.',
        bullets: [
          'Lista paginada com 223 alunos e filtros avançados',
          'Perfil completo: dados pessoais, encarregado, turma',
          'Enquadramento de alunos sem turma atribuída',
          'Exportação de listagens e relatórios individuais',
        ],
        screen: '15-alunos.png',
      },
      {
        title: '2.8  Professores',
        badge: 'Académico',
        objective: 'Gerir o corpo docente: registos, disciplinas atribuídas, horários e disponibilidade.',
        description: 'Centraliza a gestão de todos os professores da instituição. O Administrador pode criar, editar e desactivar perfis de professores, atribuir disciplinas e turmas, consultar o histórico de avaliações e monitorizar o cumprimento dos horários lectivos.',
        bullets: [
          'Cadastro completo de professores com foto e dados profissionais',
          'Atribuição de disciplinas e turmas',
          'Histórico de avaliações de desempenho',
          'Controlo de disponibilidade e contratos',
        ],
        screen: '16-professores.png',
      },
      {
        title: '2.9  Turmas',
        badge: 'Académico',
        objective: 'Criar e organizar as turmas da escola por nível, ciclo, classe e turno.',
        description: 'Gestão estruturada das turmas conforme a organização do sistema educativo angolano (Primário, I Ciclo, II Ciclo). Cada turma é configurada com capacidade máxima, turno, director de turma, disciplinas associadas e horário semanal gerado automaticamente.',
        bullets: [
          'Criação de turmas por nível, classe e turno (M/T/N)',
          'Atribuição de director de turma e limite de alunos',
          'Associação automática de disciplinas por plano curricular',
          'Geração e edição de horários semanais',
        ],
        screen: '14-turmas.png',
      },
      {
        title: '2.10  Notas',
        badge: 'Académico',
        objective: 'Consultar e supervisionar o lançamento de notas em todas as turmas e disciplinas.',
        description: 'Vista administrativa do módulo de avaliação. O Administrador acede às pautas de qualquer turma e disciplina, acompanha o estado de lançamento por período e intervém quando necessário — abrindo campos, corrigindo erros ou gerando pautas finais.',
        bullets: [
          'Consulta de notas por turma, disciplina e período',
          'Monitorização do estado de lançamento (completo/incompleto)',
          'Acesso a pautas intermédias e finais',
          'Exportação de pautas em PDF',
        ],
        screen: '17-notas.png',
      },
      {
        title: '2.11  Presenças',
        badge: 'Académico',
        objective: 'Monitorizar a assiduidade dos alunos e gerir justificações de falta.',
        description: 'Acesso administrativo ao registo de presenças de toda a escola. O Administrador visualiza as taxas de presença por turma e disciplina, identifica alunos em risco de exclusão por faltas, gere justificações e configura os limites de faltas permitidas.',
        bullets: [
          'Taxas de presença globais e por turma',
          'Identificação de alunos com excesso de faltas',
          'Aprovação de justificações de falta',
          'Configuração dos limites de faltas por disciplina',
        ],
        screen: '18-presencas.png',
      },
      {
        title: '2.12  Gestão Académica (Hub)',
        badge: 'Académico',
        objective: 'Ponto central de acesso a todas as funcionalidades de gestão académica num único painel.',
        description: 'O Hub Académico agrega num só ecrã os atalhos para todas as áreas de gestão académica, permitindo ao Administrador navegar rapidamente entre módulos como pautas, relatórios de transição, exames e outras ferramentas administrativas académicas.',
        bullets: [
          'Atalhos rápidos para todos os módulos académicos',
          'Resumo de estado por área (notas, presenças, exames)',
          'Acesso a relatórios de transição e finalistas',
          'Navegação integrada sem sair do contexto académico',
        ],
        screen: '23-gestao-academica.png',
      },
    ],
  },

  // ── GRUPO 3: PESSOAL ────────────────────────────────────────────
  {
    group: 'GESTÃO DE PESSOAL',
    groupColor: DARK_BG,
    items: [
      {
        title: '3.1  Utilizadores do Sistema',
        badge: 'Pessoal',
        objective: 'Criar, editar, activar ou desactivar contas de todos os utilizadores da aplicação.',
        description: 'Gestão centralizada de todas as contas de acesso ao SIGA. O Administrador cria novos utilizadores para qualquer perfil (Director, Secretária, Professor, Aluno, Encarregado, etc.), define as credenciais iniciais, activa ou suspende contas e repõe senhas. Cada utilizador recebe um email com as suas credenciais.',
        bullets: [
          'Criação de utilizadores para todos os perfis do sistema',
          'Atribuição de perfil, escola e credenciais de acesso',
          'Activação, suspensão e eliminação de contas',
          'Reposição de senha com notificação por email',
          'Pesquisa por nome, email ou perfil',
        ],
        screen: '10-usuarios.png',
      },
      {
        title: '3.2  Permissões e Acessos',
        badge: 'Pessoal',
        objective: 'Controlar granularmente quais as funcionalidades disponíveis para cada perfil de utilizador.',
        description: 'O Centro de Controlo de Acessos permite ao Administrador definir exactamente o que cada perfil (cargo) pode ver e fazer no sistema. As permissões são configuradas por funcionalidade, podendo ser expandidas ou restringidas relativamente às permissões padrão de cada perfil.',
        bullets: [
          'Visualização de todos os cargos e número de utilizadores',
          'Edição de permissões por funcionalidade e perfil',
          'Permissões personalizadas por utilizador individual',
          'Histórico de alterações de permissões com auditoria',
        ],
        screen: '11-acessos.png',
      },
      {
        title: '3.3  Gestão de Acessos',
        badge: 'Pessoal',
        objective: 'Gerir perfis de acesso, sessões activas e segurança de contas de utilizadores.',
        description: 'Complementa o módulo de utilizadores com funcionalidades de segurança avançada: gestão de sessões activas em tempo real, controlo de logins por aprovação, histórico de credenciais e configurações de autenticação por utilizador.',
        bullets: [
          'Visão de sessões activas em tempo real',
          'Aprovação ou recusa de logins pendentes',
          'Histórico de credenciais por utilizador',
          'Configuração de autenticação de dois factores',
        ],
        screen: '24-gestao-acessos.png',
      },
    ],
  },

  // ── GRUPO 4: FINANCEIRO ─────────────────────────────────────────
  {
    group: 'GESTÃO FINANCEIRA',
    groupColor: DARK_BG,
    items: [
      {
        title: '4.1  Financeiro',
        badge: 'Financeiro',
        objective: 'Supervisionar toda a actividade financeira da escola: propinas, pagamentos, cobranças e orçamentos.',
        description: 'O módulo financeiro apresenta ao Administrador um painel completo com o resumo de propinas (recebidas e em cobrança), entradas por período, estado dos pagamentos e consulta de RUPEs. Com separadores para Relatórios, Pagamentos, Rubricas, Orçamento e configuração fiscal, é o centro de controlo das finanças escolares.',
        bullets: [
          'Resumo de propinas: recebido (82 500 Kz) e em cobrança (35 000 Kz)',
          'Entradas por período: hoje, semana, mês e semestre',
          'Consulta de RUPEs por referência',
          'Estado de pagamentos e taxa de cobrança',
          'Configuração fiscal e plano de contas',
        ],
        screen: '19-financeiro.png',
      },
    ],
  },

  // ── GRUPO 5: RELATÓRIOS ─────────────────────────────────────────
  {
    group: 'RELATÓRIOS E ANÁLISE',
    groupColor: DARK_BG,
    items: [
      {
        title: '5.1  Relatórios',
        badge: 'Relatórios',
        objective: 'Gerar relatórios analíticos sobre desempenho académico, assiduidade, finanças e recursos humanos.',
        description: 'Centro de geração de relatórios com múltiplas perspectivas de análise. O Administrador pode exportar relatórios pré-definidos ou personalizados sobre aproveitamento escolar por turma e disciplina, evolução ao longo do ano, taxas de presença, e indicadores financeiros.',
        bullets: [
          'Relatórios de desempenho académico por turma e disciplina',
          'Análise de evolução trimestral e anual',
          'Relatórios de assiduidade e faltas',
          'Exportação em PDF e formatos partilháveis',
        ],
        screen: '20-relatorios.png',
      },
    ],
  },

  // ── GRUPO 6: SISTEMA ────────────────────────────────────────────
  {
    group: 'CONFIGURAÇÕES E SISTEMA',
    groupColor: DARK_BG,
    items: [
      {
        title: '6.1  Configurações Gerais',
        badge: 'Sistema',
        objective: 'Controlar todos os parâmetros operacionais da plataforma: períodos, avaliações, licença e integrações.',
        description: 'Painel de configuração global do sistema. Permite ao Administrador controlar períodos de inscrição, abrir ou fechar a avaliação de professores, configurar prazos de lançamento de notas, gerir a licença da plataforma, configurar notificações automáticas e ajustar parâmetros do modelo de avaliação.',
        bullets: [
          'Controlo do período de inscrições online (abrir/fechar)',
          'Gestão da avaliação de desempenho de professores',
          'Configuração do modelo de avaliação (pesos por período)',
          'Gestão da licença: nível, prazo e renovação',
          'Configuração de notificações automáticas',
          'Parâmetros do calendário e meses do ano académico',
        ],
        screen: '02-config.png',
      },
      {
        title: '6.2  Configuração da Escola',
        badge: 'Sistema',
        objective: 'Definir a identidade, dados oficiais e cabeçalhos de todos os documentos emitidos pela escola.',
        description: 'Configuração dos dados institucionais da escola: nome, código MED, morada, contactos e dados da liderança. Estes dados são usados automaticamente em todos os documentos oficiais gerados pelo sistema — certificados, pautas, boletins e declarações.',
        bullets: [
          'Nome oficial, código MED e morada completa',
          'Director Geral e Subdirector Pedagógico',
          'Linhas de cabeçalho personalizadas para documentos',
          'Horário de funcionamento e contactos',
          'Máximo de alunos por turma',
        ],
        screen: '03-escola.png',
      },
      {
        title: '6.3  Comunicações',
        badge: 'Sistema',
        objective: 'Enviar comunicados e notificações para utilizadores, turmas ou grupos específicos.',
        description: 'O módulo de comunicações permite ao Administrador difundir mensagens institucionais para grupos de utilizadores seleccionados: todos os professores, alunos de uma turma específica, encarregados de educação ou a comunidade escolar em geral, com suporte a notificações push e email.',
        bullets: [
          'Envio de comunicados por grupo e perfil de utilizador',
          'Notificações push para dispositivos móveis',
          'Comunicados por email institucional',
          'Histórico de mensagens enviadas e métricas de leitura',
        ],
        screen: '12-comunicacoes.png',
      },
      {
        title: '6.4  Segurança e Backups',
        badge: 'Sistema',
        objective: 'Proteger os dados da escola com backups manuais e automáticos por categoria.',
        description: 'Centro de segurança e backup dos dados da instituição. O Administrador pode descarregar um backup completo de toda a base de dados em formato JSON, ou exportar categorias específicas (Académico, Financeiro, RH, Documentos, Sistema). Os backups automáticos são programados e registados no histórico.',
        bullets: [
          'Backup geral completo com download directo',
          'Backup por categoria: Académico, Financeiro, RH, Documentos',
          'Agendamento de backups automáticos',
          'Histórico de backups com data, hora e tamanho',
          'Exportação para servidor Hetzner externo',
        ],
        screen: '13-seguranca.png',
      },
      {
        title: '6.5  Auditoria do Sistema',
        badge: 'Sistema',
        objective: 'Rastrear toda a actividade do sistema: logins, alterações de dados, emissão de documentos e operações financeiras.',
        description: 'Painel de auditoria completo com actividade recente consolidada. O Administrador visualiza o número de logins nos últimos 30 dias, eventos totais do sistema, tentativas de acesso falhadas, alunos adicionados e documentos emitidos. Secções separadas por área (Financeiro, Académico, etc.) com indicadores de criticidade.',
        bullets: [
          '31 logins activos nos últimos 30 dias',
          '17 422 eventos registados no sistema',
          '59 tentativas de acesso falhadas (alertas de segurança)',
          'Auditoria financeira: cobranças e propinas pendentes',
          'Registo detalhado por utilizador com filtragem avançada',
        ],
        screen: '21-auditoria.png',
      },
      {
        title: '6.6  Sessões Activas',
        badge: 'Sistema',
        objective: 'Monitorizar e terminar sessões de utilizadores activas na plataforma em tempo real.',
        description: 'Visibilidade total sobre quem está a utilizar o sistema neste momento. O Administrador pode ver todas as sessões abertas, o dispositivo e localização de cada acesso, e forçar o encerramento de sessões suspeitas ou não autorizadas.',
        bullets: [
          'Lista de utilizadores online em tempo real',
          'Informação de dispositivo, navegador e IP',
          'Encerramento forçado de sessões individuais',
          'Histórico de sessões com duração e actividade',
        ],
        screen: '22-sessoes.png',
      },
    ],
  },
];

// ── Construir documento ───────────────────────────────────────────────
async function build() {
  const sections = [];

  // ── CAPA ─────────────────────────────────────────────────────────
  const coverChildren = [
    ...spacer(6),
    coverTitle('SUPER ESCOLA', WHITE, 96),
    coverTitle('SIGA v3', GOLD, 56),
    ...spacer(2),
    coverSub('Sistema Integrado de Gestão Académica', WHITE, 30),
    ...spacer(3),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, fill: GOLD },
      children: [new TextRun({ text: '  PERFIL DE UTILIZADOR: ADMINISTRADOR  ', color: DARK_BG, size: 36, bold: true, font: 'Calibri' })],
      spacing: { before: 120, after: 120 },
    }),
    ...spacer(3),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Administrador do Sistema', color: GOLD, size: 28, font: 'Calibri' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Gestão e controlo total da plataforma escolar', color: 'AABBCC', size: 24, font: 'Calibri', italics: true })],
      spacing: { after: 40 },
    }),
    ...spacer(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Julho 2026 · Versão 3.0', color: '99AABB', size: 20, font: 'Calibri' })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  sections.push({
    properties: { page: { size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) } } },
    children: coverChildren,
  });

  // ── PERFIL DO UTILIZADOR ─────────────────────────────────────────
  const profileChildren = [
    sectionHeading('Perfil do Utilizador — Administrador'),
    ...spacer(1),

    new Paragraph({
      children: [new TextRun({ text: 'Quem é o Administrador?', color: DARK_BG, size: 32, bold: true, font: 'Calibri' })],
      spacing: { before: 240, after: 120 },
    }),
    bodyParagraph('O Administrador é o gestor técnico e operacional do SIGA. Tem acesso completo a todas as configurações do sistema, gestão de utilizadores, segurança, backups e funcionalidades académicas. É o responsável por manter a plataforma operacional e garantir que todos os outros utilizadores têm acesso correcto às suas funções.'),
    ...spacer(1),

    new Paragraph({
      children: [new TextRun({ text: 'Responsabilidades Principais', color: DARK_BG, size: 28, bold: true, font: 'Calibri' })],
      spacing: { before: 200, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
    }),
    ...spacer(1),

    // Tabela de responsabilidades
    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: DARK_BG },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '⚙️  SISTEMA', color: GOLD, size: 22, bold: true, font: 'Calibri' })] })],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: DARK_BG },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '👥  UTILIZADORES', color: GOLD, size: 22, bold: true, font: 'Calibri' })] })],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: DARK_BG },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '🎓  ACADÉMICO', color: GOLD, size: 22, bold: true, font: 'Calibri' })] })],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: DARK_BG },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '💰  FINANCEIRO', color: GOLD, size: 22, bold: true, font: 'Calibri' })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: LIGHT_BG },
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Configurar parâmetros', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Gerir backups', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Monitorar auditoria', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Controlar sessões', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
              ],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: LIGHT_BG },
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Criar todas as contas', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Gerir permissões', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Repor senhas', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Suspender acessos', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
              ],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: LIGHT_BG },
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Gerir anos lectivos', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Controlar matrículas', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Supervisar avaliações', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Gerir cursos', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
              ],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: LIGHT_BG },
              verticalAlign: VerticalAlign.TOP,
              children: [
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Monitorar propinas', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Gerir pagamentos', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Consultar RUPEs', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
                new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: 'Ver relatórios', size: 20, font: 'Calibri' })], spacing: { after: 40 } }),
              ],
            }),
          ],
        }),
      ],
    }),

    ...spacer(2),
    new Paragraph({
      children: [new TextRun({ text: 'Acesso Rápido no Menu Lateral', color: DARK_BG, size: 28, bold: true, font: 'Calibri' })],
      spacing: { before: 200, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
    }),
    bodyParagraph('O menu lateral esquerdo do Administrador está organizado em secções de acesso rápido, centralizando as funcionalidades mais utilizadas diariamente:'),
    bulletPoint('Auditoria do Sistema — Logs, Rastreio e Segurança'),
    bulletPoint('Integração MED — Exportar dados para SIGE Gov'),
    bulletPoint('Editor de Documentos — Modelos, Declarações e Certificados'),
    bulletPoint('Recursos Humanos — Pessoal, Faltas e Salários'),
    bulletPoint('Gestão de Acessos — Perfil, Permissões e Controlo'),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  sections.push({ children: profileChildren });

  // ── GRUPOS DE FUNCIONALIDADES ─────────────────────────────────────
  for (const group of FEATURES) {
    const groupChildren = [
      sectionHeading(group.group),
    ];

    for (const item of group.items) {
      groupChildren.push(
        featureTitle(item.title),
        labelBadge(item.badge),
        featureSubtitle('Objectivo'),
        bodyParagraph(item.objective),
        featureSubtitle('Descrição'),
        bodyParagraph(item.description),
        featureSubtitle('Funcionalidades Incluídas'),
        ...item.bullets.map(b => bulletPoint(b)),
        featureSubtitle('Captura do Sistema'),
        screenshotParagraph(item.screen),
        divider(),
      );
    }

    groupChildren.push(new Paragraph({ children: [new PageBreak()] }));
    sections.push({ children: groupChildren });
  }

  // ── RESUMO FINAL ─────────────────────────────────────────────────
  const summaryChildren = [
    sectionHeading('Resumo Executivo'),
    ...spacer(1),
    new Paragraph({
      children: [new TextRun({ text: 'O SIGA ao Serviço da Sua Escola', color: DARK_BG, size: 32, bold: true, font: 'Calibri' })],
      spacing: { before: 240, after: 180 },
    }),
    bodyParagraph('O SIGA v3 — Super Escola oferece ao Administrador uma plataforma completa e integrada para gerir todos os aspectos da vida escolar. Com mais de 24 funcionalidades agrupadas em 6 áreas principais, o sistema garante eficiência operacional, segurança dos dados e conformidade com os decretos do Ministério da Educação de Angola.'),
    ...spacer(1),

    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: DARK_BG },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '24+', color: GOLD, size: 52, bold: true, font: 'Calibri' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Funcionalidades', color: WHITE, size: 20, font: 'Calibri' })] }),
              ],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: BLUE_ACC },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '6', color: WHITE, size: 52, bold: true, font: 'Calibri' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Grupos de Gestão', color: WHITE, size: 20, font: 'Calibri' })] }),
              ],
            }),
            new TableCell({
              shading: { type: ShadingType.SOLID, fill: TEAL },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '100%', color: WHITE, size: 52, bold: true, font: 'Calibri' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Controlo Total', color: WHITE, size: 20, font: 'Calibri' })] }),
              ],
            }),
          ],
        }),
      ],
    }),

    ...spacer(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, fill: GOLD },
      children: [new TextRun({ text: '  www.superescola.ao  ·  SIGA v3.0  ', color: DARK_BG, size: 24, bold: true, font: 'Calibri' })],
      spacing: { before: 200, after: 200 },
    }),
  ];

  sections.push({ children: summaryChildren });

  // ── Construir e guardar ──────────────────────────────────────────
  const doc = new Document({
    creator: 'Super Escola — SIGA v3',
    title: 'SIGA v3 — Apresentação Nível Admin',
    description: 'Documento de apresentação das funcionalidades do perfil Administrador do sistema SIGA.',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: TEXT_BODY },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections,
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT, buf);
  console.log(`✅ DOCX gerado: ${OUT} (${(buf.length / 1024).toFixed(0)} KB)`);
}

build().catch(e => { console.error('❌ Erro:', e); process.exit(1); });
