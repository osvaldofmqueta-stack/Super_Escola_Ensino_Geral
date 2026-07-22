/**
 * Gera a apresentação DOCX para o perfil Director Pedagógico — SIGA v3
 */
'use strict';
const path = require('path');
const fs   = require('fs');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageOrientation, convertInchesToTwip, VerticalAlign,
} = require('docx');

// ─── paleta ──────────────────────────────────────────────────────────────────
const DARK_BG  = '0D1117';
const NAVY     = '0F2942';
const BLUE     = '1A56A0';
const BLUE_ACC = '1E6FBF';
const TEAL     = '00B4A0';
const GOLD     = 'C9A227';
const WHITE    = 'FFFFFF';
const GREY     = 'B0BAC8';
const LIGHT    = 'E8F0FA';
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

const SCREENS_DIR = path.join(__dirname, '../apresentacao/screens-director');
const OUT_PATH    = path.join(__dirname, '../apresentacao/SIGA_Apresentacao_Director.docx');

// ─── helpers ─────────────────────────────────────────────────────────────────
function loadImage(file) {
  const p = path.join(SCREENS_DIR, file);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  return new ImageRun({ data: buf, transformation: { width: 560, height: 315 }, type: 'png' });
}

function hr(color = BLUE_ACC) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color } },
    spacing: { after: 160 },
    children: [],
  });
}
function spacer(pt = 100) { return new Paragraph({ spacing: { after: pt }, children: [] }); }

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, color: WHITE, bold: true, size: 36, font: 'Calibri' })],
    shading: { type: ShadingType.SOLID, color: NAVY },
    indent: { left: 240, right: 240 },
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    children: [new TextRun({ text, color: BLUE, bold: true, size: 28, font: 'Calibri' })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, color: TEAL, bold: true, size: 24, font: 'Calibri' })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, color: opts.color || '1A1A2E', size: opts.size || 22, font: 'Calibri', bold: !!opts.bold, italics: !!opts.italics })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    indent: { left: 360 + level * 360 },
    children: [new TextRun({ text, color: '222244', size: 21, font: 'Calibri' })],
  });
}

function badgeRow(items) {
  const cells = items.map(({ label, value }) =>
    new TableCell({
      width: { size: Math.floor(100 / items.length), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: NAVY },
      margins: { top: 160, bottom: 160, left: 200, right: 200 },
      borders: { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, color: GOLD, bold: true, size: 40, font: 'Calibri' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, color: GREY, size: 18, font: 'Calibri' })] }),
      ],
    })
  );
  return new Table({ rows: [new TableRow({ children: cells })], width: { size: 100, type: WidthType.PERCENTAGE } });
}

function featureBlock({ title, subtitle, description, bullets, imageFile }) {
  const img = loadImage(imageFile);
  const rows = [];

  // título
  rows.push(heading3(`▶  ${title}`));
  if (subtitle) rows.push(body(subtitle, { color: BLUE_ACC, italics: true }));
  rows.push(hr(TEAL));

  // imagem + descrição lado a lado se possível
  if (img) {
    rows.push(new Paragraph({ children: [img], spacing: { after: 120 } }));
  }

  if (description) rows.push(body(description));
  if (bullets && bullets.length) {
    bullets.forEach(b => rows.push(bullet(b)));
  }
  rows.push(spacer(160));
  return rows;
}

// ─── COVER ───────────────────────────────────────────────────────────────────
function makeCover() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 40 },
      shading: { type: ShadingType.SOLID, color: DARK_BG },
      children: [new TextRun({ text: 'SUPER ESCOLA', color: GOLD, bold: true, size: 72, font: 'Calibri', allCaps: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      shading: { type: ShadingType.SOLID, color: DARK_BG },
      children: [new TextRun({ text: 'Sistema Integrado de Gestão Académica', color: GREY, size: 26, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      shading: { type: ShadingType.SOLID, color: DARK_BG },
      children: [new TextRun({ text: 'SIGA  v3.0', color: BLUE_ACC, bold: true, size: 32, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 40 },
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: GOLD }, bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD } },
      shading: { type: ShadingType.SOLID, color: NAVY },
      children: [new TextRun({ text: 'APRESENTAÇÃO DE FUNCIONALIDADES', color: WHITE, bold: true, size: 28, font: 'Calibri', allCaps: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      shading: { type: ShadingType.SOLID, color: NAVY },
      children: [new TextRun({ text: 'Perfil:  DIRECTOR PEDAGÓGICO', color: TEAL, bold: true, size: 36, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      shading: { type: ShadingType.SOLID, color: DARK_BG },
      children: [new TextRun({ text: 'Julho 2026 · Versão 3.0', color: GREY, size: 20, font: 'Calibri' })],
    }),
  ];
}

// ─── PERFIL ───────────────────────────────────────────────────────────────────
function makeProfile() {
  return [
    heading1('1.  Perfil do Utilizador — Director Pedagógico'),
    spacer(100),
    body('O Director Pedagógico é o responsável máximo pela qualidade do ensino e pela supervisão de todos os processos académicos e pedagógicos da escola. No SIGA v3, este perfil tem acesso a um conjunto abrangente de ferramentas que cobrem desde a gestão de alunos e professores até à análise financeira e de recursos humanos.', { size: 23 }),
    spacer(120),
    heading2('Responsabilidades por Área'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ['Área', 'Responsabilidades Principais'].map((h, i) =>
            new TableCell({
              width: { size: i === 0 ? 30 : 70, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.SOLID, color: NAVY },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [new Paragraph({ children: [new TextRun({ text: h, color: GOLD, bold: true, size: 22, font: 'Calibri' })] })],
            })
          ),
        }),
        ...([
          ['Pedagógico', 'Supervisão de aulas, avaliações, pautas, exames, recursos e reapreciações'],
          ['Académico', 'Gestão de alunos, turmas, professores, horários, grelha curricular e disciplinas'],
          ['Avaliação', 'Conselho de avaliação, avaliação diagnóstica, formativa e de professores'],
          ['Documentação', 'Editor de documentos, arquivo de pautas e documentos oficiais'],
          ['Análise', 'Relatórios, visão multi-ano, histórico académico e desempenho'],
          ['Financeiro', 'Consulta de tesouraria, propinas e fluxo financeiro da escola'],
          ['Pessoal (RH)', 'Acompanhamento de recursos humanos, folha salarial e faltas do pessoal'],
          ['Secretaria', 'Admissões, transferências, eventos, calendário e comunicações'],
        ]).map(([area, resp]) =>
          new TableRow({
            children: [area, resp].map((v, i) =>
              new TableCell({
                width: { size: i === 0 ? 30 : 70, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.SOLID, color: i === 0 ? '112244' : LIGHT },
                margins: { top: 100, bottom: 100, left: 160, right: 160 },
                children: [new Paragraph({ children: [new TextRun({ text: v, color: i === 0 ? TEAL : '1A1A2E', bold: i === 0, size: 21, font: 'Calibri' })] })],
              })
            ),
          })
        ),
      ],
    }),
    spacer(160),
    heading2('Menu Lateral — Secções Disponíveis'),
    ...[
      ['Principal', 'Painel de Controlo (Dashboard)'],
      ['Secretaria', 'Hub Secretaria · Calendário Académico · Eventos · Área Pedagógica · Consulta de Aluno · Editor de Documentos · Arquivo de Documentos'],
      ['Análise', 'Visão Geral Multi-Ano · Relatórios'],
      ['Financeiro', 'Tesouraria · Módulo Financeiro · Histórico de RUPEs'],
      ['Recursos Humanos', 'Hub RH · Gestão de Pessoal · Faltas & Remunerações · Folha de Salários'],
    ].map(([sec, items]) => new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${sec}:  `, color: BLUE, bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: items, color: '222244', size: 21, font: 'Calibri' }),
      ],
    })),
    spacer(200),
  ];
}

// ─── GRUPOS DE FUNCIONALIDADES ────────────────────────────────────────────────
const GROUPS = [
  {
    title: '2.  Painel de Controlo',
    features: [
      {
        title: 'Dashboard Executivo',
        subtitle: 'Visão global do estado da escola em tempo real',
        imageFile: '01-dashboard.png',
        description: 'O Dashboard do Director apresenta todos os indicadores críticos da escola numa única vista: matrículas activas, aprovação global, professores disponíveis e turmas em actividade. A saudação personalizada e o relógio em tempo real conferem uma experiência de trabalho profissional e contextualizada.',
        bullets: [
          'Indicadores de matrículas, aprovação, turmas e professores em tempo real',
          'Gráfico de desempenho por disciplina e distribuição de notas',
          'Lista de alunos em risco e pendências académicas',
          'Acesso rápido a Auditoria, Editor de Documentos, RH e Gestão de Acessos',
          'Assistente IA integrado para apoio contextual',
          'Notificações de novas mensagens e alertas pendentes',
        ],
      },
    ],
  },
  {
    title: '3.  Secretaria & Gestão Escolar',
    features: [
      {
        title: 'Painel da Secretaria',
        subtitle: 'Hub central de operações da secretaria',
        imageFile: '02-secretaria-hub.png',
        description: 'O Painel da Secretaria consolida todas as operações administrativas: admissões, matrículas, documentos emitidos e comunicações. O Director acompanha o fluxo de trabalho da secretaria em tempo real.',
        bullets: [
          'Visão geral de admissões e matrículas pendentes',
          'Controlo de documentos emitidos e pendentes',
          'Acesso rápido a todas as funcionalidades da secretaria',
          'Monitorização de comunicações e mensagens institucionais',
        ],
      },
      {
        title: 'Processo de Admissão',
        subtitle: 'Gestão completa do processo de candidatura e matrícula',
        imageFile: '05-admissao.png',
        description: 'Controlo total das candidaturas de novos alunos, desde a submissão do pedido até à confirmação da matrícula.',
        bullets: [
          'Listagem de candidatos por estado (pendente, aprovado, recusado)',
          'Análise de documentação e requisitos de admissão',
          'Aprovação ou rejeição de candidaturas com justificação',
          'Registo automático após aprovação',
        ],
      },
      {
        title: 'Transferências',
        subtitle: 'Gestão de transferências de entrada e saída',
        imageFile: '06-transferencias.png',
        description: 'Controlo de alunos que entram ou saem da escola por transferência, com registo completo do histórico.',
        bullets: [
          'Pedidos de transferência interna e externa',
          'Validação de documentação de origem',
          'Registo no histórico académico do aluno',
          'Notificações automáticas às partes envolvidas',
        ],
      },
      {
        title: 'Calendário Académico',
        subtitle: 'Planeamento e publicação do calendário escolar',
        imageFile: '39-calendario.png',
        description: 'Definição e publicação do calendário académico com todos os períodos lectivos, feriados e eventos.',
        bullets: [
          'Criação e edição de eventos no calendário',
          'Definição de períodos de avaliação e épocas de exame',
          'Publicação visível para toda a comunidade escolar',
          'Integração com notificações automáticas',
        ],
      },
      {
        title: 'Eventos Escolares',
        subtitle: 'Organização e gestão de eventos da escola',
        imageFile: '40-eventos.png',
        description: 'Registo, organização e acompanhamento de todos os eventos escolares — culturais, desportivos e institucionais.',
        bullets: [
          'Criação de eventos com data, local e descrição',
          'Gestão de participantes e confirmações',
          'Publicação no calendário da escola',
          'Arquivo histórico de eventos realizados',
        ],
      },
    ],
  },
  {
    title: '4.  Área Pedagógica',
    features: [
      {
        title: 'Hub da Área Pedagógica',
        subtitle: 'Centro de controlo pedagógico do Director',
        imageFile: '03-pedagogico.png',
        description: 'O Hub Pedagógico é a entrada central para todas as funcionalidades de supervisão académica e avaliação. Apresenta acesso rápido a acompanhamento de pautas, exames extraordinários, recursos, melhoria de notas, reapreciações, conselho de avaliação e avaliações diagnóstica e formativa.',
        bullets: [
          'Acesso directo a todas as ferramentas de supervisão pedagógica',
          'Resumo de planificações activas e pendentes',
          'Atalhos para as funcionalidades mais utilizadas pelo Director',
          'Indicadores de submissão de pautas e prazos em aberto',
        ],
      },
      {
        title: 'Gestão de Alunos',
        subtitle: 'Registo e acompanhamento completo da população estudantil',
        imageFile: '04-alunos.png',
        description: 'Acesso ao registo completo de todos os alunos matriculados, com filtros por turma, ano e estado académico.',
        bullets: [
          'Listagem completa com filtros avançados (turma, ano, estado)',
          'Consulta de perfil individual do aluno',
          'Registo de dados pessoais, académicos e contactos',
          'Histórico de matrículas e progressão académica',
          'Exportação de listas para relatórios',
        ],
      },
      {
        title: 'Gestão de Professores',
        subtitle: 'Registo e acompanhamento do corpo docente',
        imageFile: '07-professores.png',
        description: 'Controlo do corpo docente com atribuição de turmas, disciplinas e acompanhamento de desempenho.',
        bullets: [
          'Registo de professores com qualificações e especialidades',
          'Atribuição de disciplinas e turmas por professor',
          'Acompanhamento de faltas e substituições',
          'Histórico de avaliações realizadas pelo professor',
        ],
      },
      {
        title: 'Turmas',
        subtitle: 'Organização e gestão das turmas da escola',
        imageFile: '08-turmas.png',
        description: 'Criação e gestão de todas as turmas, com atribuição de alunos, director de turma e horário.',
        bullets: [
          'Criação e edição de turmas por ano e classe',
          'Atribuição de director de turma',
          'Gestão do número de alunos por turma',
          'Acesso ao horário e disciplinas da turma',
        ],
      },
      {
        title: 'Salas de Aula',
        subtitle: 'Gestão de espaços físicos da escola',
        imageFile: '09-salas.png',
        description: 'Registo e gestão de todas as salas de aula com capacidade e equipamentos disponíveis.',
        bullets: [
          'Registo de salas com capacidade e recursos',
          'Atribuição de salas a turmas e horários',
          'Controlo de disponibilidade e ocupação',
          'Gestão de laboratórios e salas especializadas',
        ],
      },
      {
        title: 'Notas & Pautas',
        subtitle: 'Consulta e supervisão de notas e pautas por turma',
        imageFile: '10-notas.png',
        description: 'O Director consulta as notas lançadas pelos professores em todas as disciplinas e turmas, podendo supervisionar o estado de submissão das pautas.',
        bullets: [
          'Consulta de notas por turma, disciplina e período',
          'Visualização do estado de lançamento de pautas',
          'Identificação de disciplinas com notas em falta',
          'Acesso à pauta final consolidada por turma',
          'Exportação de notas para Excel/PDF',
        ],
      },
      {
        title: 'Presenças',
        subtitle: 'Monitorização de frequência e faltas dos alunos',
        imageFile: '11-presencas.png',
        description: 'Controlo de presenças e faltas por turma e disciplina, com identificação de alunos em risco de exclusão.',
        bullets: [
          'Registo e consulta de presenças por data e turma',
          'Identificação de alunos com excesso de faltas',
          'Relatórios de frequência por período',
          'Alertas automáticos por limite de faltas atingido',
          'Justificação de faltas com documentação',
        ],
      },
      {
        title: 'Horário',
        subtitle: 'Gestão e visualização de horários escolares',
        imageFile: '12-horario.png',
        description: 'Criação e consulta de horários para turmas e professores, com detecção de conflitos.',
        bullets: [
          'Criação de horários por turma e professor',
          'Detecção automática de conflitos de sala e professor',
          'Publicação de horários visível para toda a escola',
          'Exportação e impressão de horários',
        ],
      },
      {
        title: 'Histórico Académico',
        subtitle: 'Progressão e percurso académico por aluno',
        imageFile: '13-historico.png',
        description: 'Consulta do historial completo de cada aluno — notas, aprovações, reprovações e transições ao longo dos anos.',
        bullets: [
          'Registo anual de notas por disciplina',
          'Indicação de aprovação/reprovação por ano',
          'Histórico de turmas frequentadas',
          'Análise de progressão ao longo do percurso escolar',
        ],
      },
      {
        title: 'Grelha Curricular',
        subtitle: 'Plano curricular por classe e área de ensino',
        imageFile: '14-grelha.png',
        description: 'Consulta da grelha curricular com todas as disciplinas e cargas horárias por classe.',
        bullets: [
          'Visualização do plano curricular por classe',
          'Carga horária semanal por disciplina',
          'Conformidade com o decreto ministerial',
          'Exportação para documentos oficiais',
        ],
      },
      {
        title: 'Consulta de Aluno',
        subtitle: 'Ficha completa de qualquer aluno da escola',
        imageFile: '15-consulta-aluno.png',
        description: 'Ferramenta de consulta rápida que permite aceder ao perfil completo de qualquer aluno — dados pessoais, académicos, financeiros e de presenças.',
        bullets: [
          'Pesquisa por nome, número de matrícula ou BI',
          'Ficha com dados pessoais, académicos e financeiros',
          'Histórico de notas e frequência',
          'Estado de pagamento de propinas',
          'Impressão de declarações e certificados',
        ],
      },
      {
        title: 'Avaliação de Professores',
        subtitle: 'Qualidade pedagógica avaliada pela Direcção',
        imageFile: '16-avaliacao-profs.png',
        description: 'O Director realiza avaliações formais do desempenho pedagógico de cada professor, com critérios configuráveis e aprovação de resultados.',
        bullets: [
          'Criação de fichas de avaliação por professor',
          'Critérios de avaliação configuráveis (pontualidade, método, resultados)',
          'Submissão, rascunho e aprovação de avaliações',
          'Histórico de avaliações por docente',
          'Relatório consolidado de desempenho do corpo docente',
        ],
      },
      {
        title: 'Quadro de Honra',
        subtitle: 'Reconhecimento dos alunos com melhor desempenho',
        imageFile: '17-quadro-honra.png',
        description: 'O Quadro de Honra identifica e publicita os alunos com melhor aproveitamento académico, por turma e classe.',
        bullets: [
          'Selecção automática de alunos com nota ≥ nota mínima de honra',
          'Publicação por turma, classe ou escola',
          'Impressão de certificados de mérito',
          'Histórico de alunos distinguidos por ano lectivo',
        ],
      },
      {
        title: 'Estudantes Finalistas',
        subtitle: 'Acompanhamento dos alunos na última classe',
        imageFile: '18-finalistas.png',
        description: 'Módulo dedicado ao acompanhamento dos alunos que estão a concluir o seu percurso escolar.',
        bullets: [
          'Listagem de alunos finalistas por classe e turma',
          'Estado académico e financeiro de cada finalista',
          'Preparação para cerimónia de formatura',
          'Ligação ao módulo de Alumni para registo pós-conclusão',
        ],
      },
      {
        title: 'Antigos Alunos (Alumni)',
        subtitle: 'Rede de ex-alunos e histórico pós-escola',
        imageFile: '19-alumni.png',
        description: 'Registo e acompanhamento dos alunos que já concluíram a sua formação na escola.',
        bullets: [
          'Base de dados de ex-alunos com contactos actualizados',
          'Registo do ano de conclusão e percurso pós-escolar',
          'Emissão de declarações e certificados para alumni',
          'Rede de contacto com ex-alunos para eventos',
        ],
      },
      {
        title: 'Biblioteca',
        subtitle: 'Gestão do acervo e empréstimos bibliográficos',
        imageFile: '41-biblioteca.png',
        description: 'Sistema de gestão da biblioteca escolar com catálogo, empréstimos e devoluções.',
        bullets: [
          'Catálogo de livros e recursos bibliográficos',
          'Registo de empréstimos e devoluções',
          'Pesquisa por título, autor ou ISBN',
          'Controlo de exemplares disponíveis e em falta',
        ],
      },
      {
        title: 'Trabalhos Finais de Curso',
        subtitle: 'Acompanhamento de monografias e projectos de conclusão',
        imageFile: '42-trabalhos-finais.png',
        description: 'Módulo para registo e acompanhamento dos trabalhos de conclusão de curso dos alunos finalistas.',
        bullets: [
          'Registo de temas e orientadores por aluno',
          'Acompanhamento do estado de desenvolvimento',
          'Submissão e avaliação dos trabalhos',
          'Arquivo de trabalhos concluídos',
        ],
      },
    ],
  },
  {
    title: '5.  Supervisão de Avaliações',
    features: [
      {
        title: 'Acompanhamento de Pautas',
        subtitle: 'Monitorização do estado de submissão de pautas',
        imageFile: '20-acomp-pautas.png',
        description: 'O Director acompanha em tempo real o estado de lançamento de pautas por todos os professores, identificando pendências e prazos em risco.',
        bullets: [
          'Dashboard com estado de submissão por turma e professor',
          'Identificação de pautas em atraso ou incompletas',
          'Alertas de prazo por disciplina',
          'Histórico de submissões e aprovações',
        ],
      },
      {
        title: 'Conselho de Avaliação',
        subtitle: 'Reuniões, deliberações e validação de pautas',
        imageFile: '21-conselho.png',
        description: 'O Conselho de Avaliação formaliza as deliberações sobre as notas finais, com registo de actas e decisões tomadas em reunião pedagógica.',
        bullets: [
          'Criação e registo de reuniões do conselho',
          'Acta digital com deliberações por aluno',
          'Validação final de pautas após deliberação',
          'Arquivo de actas anteriores por ano e período',
        ],
      },
      {
        title: 'Avaliação Diagnóstica',
        subtitle: 'Diagnóstico de competências no início do ano/período',
        imageFile: '22-diagnostica.png',
        description: 'Ferramenta de registo e análise das avaliações diagnósticas realizadas no início do ano lectivo ou de cada período.',
        bullets: [
          'Registo de avaliações diagnósticas por turma e disciplina',
          'Análise de resultados e identificação de lacunas',
          'Relatório de pontos de partida por turma',
          'Suporte ao planeamento pedagógico do professor',
        ],
      },
      {
        title: 'Avaliação Formativa',
        subtitle: 'Registo e consulta de avaliações contínuas',
        imageFile: '23-formativa.png',
        description: 'Módulo de avaliação formativa que regista o desempenho contínuo dos alunos ao longo do período, complementando a nota sumativa.',
        bullets: [
          'Registo de avaliações formativas por disciplina e turma',
          'Consulta histórica de avaliações por aluno',
          'Contribuição configurável para a nota final',
          'Relatório de evolução do desempenho',
        ],
      },
      {
        title: 'Exclusões & Faltas',
        subtitle: 'Gestão de exclusões por faltas injustificadas',
        imageFile: '24-exclusoes.png',
        description: 'Controlo dos alunos em risco de exclusão por excesso de faltas, com gestão de processos de exclusão definitiva.',
        bullets: [
          'Identificação automática de alunos no limite de faltas',
          'Registo de exclusões com fundamento legal',
          'Processo de notificação ao encarregado de educação',
          'Histórico de exclusões por ano lectivo',
        ],
      },
      {
        title: 'Exame de Recurso',
        subtitle: 'Gestão de exames extraordinários de recurso',
        imageFile: '25-exame-recurso.png',
        description: 'Controlo dos exames de recurso para alunos que não atingiram a nota mínima na avaliação regular.',
        bullets: [
          'Identificação de alunos elegíveis para exame de recurso',
          'Criação e publicação do calendário de exames',
          'Registo de notas do exame de recurso',
          'Cálculo automático da nota final após recurso',
        ],
      },
      {
        title: 'Melhoria de Nota',
        subtitle: 'Solicitações de melhoria nos termos legais (Art. 36.º)',
        imageFile: '26-melhoria-nota.png',
        description: 'Gestão dos pedidos de melhoria de nota submetidos pelos alunos no âmbito do Decreto 04/2026.',
        bullets: [
          'Submissão e validação de pedidos de melhoria',
          'Verificação de elegibilidade por aluno e disciplina',
          'Calendário de provas de melhoria',
          'Actualização automática da nota se melhoria for obtida',
        ],
      },
      {
        title: 'Pedido de Reapreciação',
        subtitle: 'Reapreciação de notas com comissão (Art. 38.º)',
        imageFile: '27-reapreciacao.png',
        description: 'Processo formal de reapreciação de notas por comissão pedagógica, no prazo de 48 horas após publicação.',
        bullets: [
          'Submissão de pedidos de reapreciação pelo aluno/EE',
          'Atribuição de comissão de reapreciação',
          'Prazo de 48h controlado pelo sistema',
          'Registo da decisão final da comissão',
          'Notificação automática ao requerente',
        ],
      },
      {
        title: 'Exame Nacional',
        subtitle: 'Gestão do exame nacional de fim de ciclo',
        imageFile: '28-exame-nacional.png',
        description: 'Módulo dedicado à gestão do exame nacional, com controlo de elegibilidade, notas e resultado final.',
        bullets: [
          'Identificação de alunos elegíveis para exame nacional',
          'Registo de notas do exame nacional',
          'Cálculo da nota final com ponderação configurável',
          'Exportação de resultados para integração MED/SIGE',
        ],
      },
      {
        title: 'Arquivo de Pautas',
        subtitle: 'Repositório histórico de todas as pautas',
        imageFile: '29-arquivo-pautas.png',
        description: 'Acesso ao arquivo histórico de todas as pautas emitidas, organizadas por ano lectivo, classe e disciplina.',
        bullets: [
          'Pesquisa de pautas por ano, turma e disciplina',
          'Download de pautas em PDF',
          'Consulta de pautas de anos anteriores',
          'Arquivo permanente para fins de auditoria',
        ],
      },
    ],
  },
  {
    title: '6.  Documentação & Comunicação',
    features: [
      {
        title: 'Editor de Documentos',
        subtitle: 'Emissão de documentos oficiais da escola',
        imageFile: '30-editor-docs.png',
        description: 'O Editor de Documentos permite criar, personalizar e emitir documentos oficiais como declarações, certificados e actas.',
        bullets: [
          'Templates de declarações de matrícula, frequência e habilitações',
          'Personalização com dados do aluno e da escola',
          'Emissão com assinatura digital e carimbo',
          'Impressão directa ou exportação em PDF',
          'Arquivo automático de documentos emitidos',
        ],
      },
      {
        title: 'Arquivo de Documentos',
        subtitle: 'Repositório centralizado de documentos emitidos',
        imageFile: '31-arquivo-docs.png',
        description: 'Arquivo digital de todos os documentos emitidos pela escola, com pesquisa avançada e gestão de validade.',
        bullets: [
          'Listagem de documentos por tipo, aluno e data',
          'Download de segunda via de qualquer documento',
          'Controlo de validade e renovação',
          'Histórico de emissões por utilizador',
        ],
      },
    ],
  },
  {
    title: '7.  Análise & Relatórios',
    features: [
      {
        title: 'Visão Geral Multi-Ano',
        subtitle: 'Análise comparativa de indicadores ao longo de vários anos',
        imageFile: '32-visao-geral.png',
        description: 'Dashboard analítico que permite comparar indicadores académicos e financeiros entre diferentes anos lectivos.',
        bullets: [
          'Gráficos comparativos de matrículas por ano',
          'Evolução da taxa de aprovação ao longo do tempo',
          'Análise de tendências de receitas e despesas',
          'Exportação de análises para relatórios de gestão',
        ],
      },
      {
        title: 'Centro de Relatórios',
        subtitle: 'Geração de relatórios académicos e institucionais',
        imageFile: '33-relatorios.png',
        description: 'O Centro de Relatórios disponibiliza dezenas de relatórios pré-configurados para apoio à gestão e tomada de decisão.',
        bullets: [
          'Relatórios de aproveitamento por turma, classe e disciplina',
          'Relatórios de assiduidade e comportamento',
          'Relatórios financeiros (receitas, dívidas, propinas)',
          'Exportação em PDF, Excel e CSV',
          'Agendamento automático de relatórios periódicos',
        ],
      },
    ],
  },
  {
    title: '8.  Gestão Financeira',
    features: [
      {
        title: 'Gestão Financeira',
        subtitle: 'Painel financeiro completo da escola',
        imageFile: '34-financeiro.png',
        description: 'O módulo financeiro apresenta uma visão completa das receitas, dívidas, pagamentos e configurações fiscais da escola.',
        bullets: [
          'Painel com receitas, dívidas e pagamentos do mês',
          'Extracto de propinas por aluno',
          'Bolsas e descontos configuráveis',
          'Histórico de RUPEs e Multicaixa',
          'Relatórios financeiros e orçamento anual',
        ],
      },
      {
        title: 'Tesouraria',
        subtitle: 'Controlo de caixa e movimentos financeiros',
        imageFile: '35-tesouraria.png',
        description: 'A Tesouraria regista todos os movimentos de caixa, permitindo o controlo diário das receitas e despesas da escola.',
        bullets: [
          'Registo de receitas e pagamentos diários',
          'Balanço de caixa em tempo real',
          'Histórico de transacções com filtros por data',
          'Exportação para folha de cálculo',
        ],
      },
    ],
  },
  {
    title: '9.  Recursos Humanos',
    features: [
      {
        title: 'Hub de Recursos Humanos',
        subtitle: 'Gestão integrada do pessoal da escola',
        imageFile: '36-rh-hub.png',
        description: 'O Hub de RH centraliza a gestão de todo o pessoal da escola — docente e não-docente — com acesso a contratações, salários e faltas.',
        bullets: [
          'Visão geral do pessoal activo e contratos',
          'Acesso rápido a Gestão de Pessoal, Faltas e Salários',
          'Indicadores de pessoal: total, activos, de licença',
          'Alertas de contratos a renovar ou vencidos',
        ],
      },
      {
        title: 'Gestão de Pessoal',
        subtitle: 'Fichas completas do pessoal docente e não-docente',
        imageFile: '37-rh-controle.png',
        description: 'Registo e gestão completa do pessoal da escola, com dados contratuais, habilitações e histórico de serviço.',
        bullets: [
          'Ficha completa por colaborador (dados, contrato, habilitações)',
          'Gestão de categorias e escalões salariais',
          'Histórico de funções e promoções',
          'Registo de INSS e obrigações legais',
        ],
      },
      {
        title: 'Faltas & Remunerações',
        subtitle: 'Controlo de faltas e impacto salarial',
        imageFile: '38-rh-payroll.png',
        description: 'Registo de faltas do pessoal com cálculo automático do impacto nas remunerações mensais.',
        bullets: [
          'Registo de faltas justificadas e injustificadas',
          'Impacto automático no cálculo salarial',
          'Relatório mensal de absentismo',
          'Integração com a folha de salários',
        ],
      },
    ],
  },
];

// ─── SUMÁRIO ─────────────────────────────────────────────────────────────────
function makeSummary(totalFeatures) {
  return [
    heading1('10.  Resumo Executivo'),
    spacer(100),
    body('O perfil Director Pedagógico do SIGA v3 disponibiliza acesso completo a todas as ferramentas necessárias para a supervisão académica, pedagógica, financeira e de pessoal de uma escola de qualidade. A plataforma centraliza a informação, automatiza processos e fornece dados em tempo real para uma tomada de decisão ágil e fundamentada.', { size: 23 }),
    spacer(160),
    badgeRow([
      { label: 'Funcionalidades', value: `${totalFeatures}+` },
      { label: 'Grupos temáticos', value: '9' },
      { label: 'Controlo total', value: '100%' },
      { label: 'Versão SIGA', value: 'v3.0' },
    ]),
    spacer(160),
    heading2('Principais Vantagens para o Director'),
    ...[
      'Supervisão pedagógica centralizada — notas, pautas, avaliações e exames numa só plataforma',
      'Visão financeira completa sem depender do departamento financeiro',
      'Gestão de pessoal integrada com folha de salários e controlo de faltas',
      'Relatórios automáticos para apoio à tomada de decisão e prestação de contas',
      'Alertas em tempo real sobre pendências académicas e financeiras',
      'Arquivo digital de todos os documentos, pautas e actas para auditoria',
      'Conformidade legal com o Decreto 04/2026 (Art. 33.º, 36.º, 38.º)',
    ].map(t => bullet(t)),
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      shading: { type: ShadingType.SOLID, color: NAVY },
      children: [
        new TextRun({ text: 'SIGA v3  ·  Super Escola  ·  ', color: GREY, size: 20, font: 'Calibri' }),
        new TextRun({ text: 'Julho 2026', color: GOLD, bold: true, size: 20, font: 'Calibri' }),
      ],
    }),
  ];
}

// ─── BUILD DOCUMENT ───────────────────────────────────────────────────────────
(async () => {
  const allSections = [];

  // Capa
  allSections.push(...makeCover());
  allSections.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  // Perfil
  allSections.push(...makeProfile());
  allSections.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  let totalFeatures = 0;

  for (const group of GROUPS) {
    allSections.push(heading1(group.title));
    allSections.push(spacer(120));

    for (const feat of group.features) {
      totalFeatures++;
      allSections.push(...featureBlock(feat));
    }

    allSections.push(new Paragraph({ pageBreakBefore: true, children: [] }));
  }

  // Sumário
  allSections.push(...makeSummary(totalFeatures));

  const doc = new Document({
    creator: 'SIGA v3 — Super Escola',
    title: 'Apresentação Director Pedagógico',
    description: 'Apresentação de funcionalidades do perfil Director Pedagógico no SIGA v3',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '1A1A2E' } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: convertInchesToTwip(11), height: convertInchesToTwip(8.5), orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      children: allSections,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`\n✅ DOCX gerado: ${OUT_PATH} (${Math.round(buf.length / 1024)} KB)`);
})();
