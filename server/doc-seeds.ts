import fs from 'fs';
import path from 'path';

const TPL_DIR = path.join(process.cwd(), 'server', 'templates', 'documentos');

function readTpl(filename: string): string {
  try {
    return fs.readFileSync(path.join(TPL_DIR, filename), 'utf-8');
  } catch (err) {
    console.error(`[doc-seeds] ❌ Erro ao ler template "${filename}":`, err);
    return `[Erro ao carregar template: ${filename}]`;
  }
}

export interface DocSeedEntry {
  id: string;
  nome: string;
  tipo: string;
  classeAlvo?: string | null;
  bloqueado?: boolean;
  conteudo: string;
}

export const DOC_SEEDS: DocSeedEntry[] = [
  {
    id: 'tpl_seed_guia_transferencia_v1',
    nome: 'Guia de Transferência',
    tipo: 'outro',
    conteudo: readTpl('guia-transferencia.html'),
  },
  {
    id: 'tpl_seed_declaracao_habilitacoes_v1',
    nome: 'Declaração de Habilitações',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-habilitacoes.html'),
  },
  {
    id: 'tpl_seed_certificado_i_ciclo_v1',
    nome: 'Certificado — Iº Ciclo do Ensino Secundário',
    tipo: 'certificado',
    conteudo: readTpl('certificado-i-ciclo.html'),
  },
  {
    id: 'tpl_seed_cert_hab_i_ciclo_geral_v1',
    nome: 'Certificado de Habilitações — Iº Ciclo Ensino Secundário Geral (7ª, 8ª, 9ª)',
    tipo: 'certificado',
    classeAlvo: 'I-CICLO-GERAL',
    bloqueado: true,
    conteudo: readTpl('certificado-habilitacoes-i-ciclo-geral.html'),
  },
  {
    id: 'tpl_seed_cert_hab_7a9a_col13_dundo_v1',
    nome: 'Certificado de Habilitações 7ª a 9ª Classe — Colégio nº 13 do Dundo',
    tipo: 'certificado',
    classeAlvo: 'I-CICLO-13-DUNDO',
    bloqueado: true,
    conteudo: readTpl('certificado-habilitacoes-7a9a-col13-dundo.html'),
  },
  {
    id: 'tpl_seed_mini_pauta_v1',
    nome: 'Mini-Pauta (Modelo)',
    tipo: 'mini_pauta',
    conteudo: readTpl('mini-pauta.html'),
  },
  {
    id: 'tpl_seed_pauta_final_v1',
    nome: 'Pauta Final (por Turma)',
    tipo: 'pauta_final',
    conteudo: readTpl('pauta-final.html'),
  },
  {
    id: 'tpl_seed_lista_turma_v1',
    nome: 'Lista da Turma',
    tipo: 'lista_turma',
    conteudo: readTpl('lista-turma.html'),
  },
  {
    id: 'tpl_seed_cert_primario_v1',
    nome: 'Certificado do Ensino Primário',
    tipo: 'certificado_primario',
    bloqueado: true,
    conteudo: readTpl('certificado-primario.html'),
  },
  {
    id: 'tpl_seed_declaracao_com_nota_v1',
    nome: 'Declaração com Nota (Ensino Primário)',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-com-nota-primario.html'),
  },
  {
    id: 'tpl_seed_declaracao_habilitacoes_primario_v1',
    nome: 'Declaração de Habilitações (Ensino Primário)',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-habilitacoes-primario.html'),
  },
  {
    id: 'tpl_seed_decl_nota_10_v1',
    nome: 'Declaração com Nota — 10ª Classe (IIº Ciclo)',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-nota-10a.html'),
  },
  {
    id: 'tpl_seed_decl_nota_11_v1',
    nome: 'Declaração com Nota — 11ª Classe (IIº Ciclo)',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-nota-11a.html'),
  },
  {
    id: 'tpl_seed_decl_nota_12_v1',
    nome: 'Declaração com Nota — 12ª Classe (IIº Ciclo)',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-nota-12a.html'),
  },
  {
    id: 'tpl_seed_decl_nota_13_v1',
    nome: 'Declaração com Nota — 13ª Classe (Pré-Universitário)',
    tipo: 'declaracao',
    conteudo: readTpl('declaracao-nota-13a.html'),
  },
  {
    id: 'tpl_seed_mapa_frequencias_v2',
    nome: 'Mapa de Frequências — Por Curso e Classe (10ª–13ª)',
    tipo: 'mapa_frequencias',
    classeAlvo: 'FREQUENCIAS',
    conteudo: readTpl('mapa-frequencias.html'),
  },
  {
    id: 'tpl_seed_mapa_por_curso_classe_v2',
    nome: 'Mapa de Aproveitamento — Por Curso e Classe (10ª–13ª)',
    tipo: 'mapa_aproveitamento',
    classeAlvo: 'CURSO_CLASSE',
    conteudo: readTpl('mapa-aproveitamento-curso-classe.html'),
  },
  {
    id: 'tpl_seed_mapa_aproveitamento_final_v1',
    nome: 'MAPA DE APROVEITAMENTO FINAL',
    tipo: 'mapa_aproveitamento',
    classeAlvo: 'CURSO_CLASSE_FINAL',
    conteudo: readTpl('mapa-aproveitamento-final.html'),
  },
  {
    id: 'tpl_seed_mapa_turma_detalhado_v1',
    nome: 'Mapa de Aproveitamento — Detalhado por Turma',
    tipo: 'mapa_aproveitamento',
    classeAlvo: 'TURMA_DETALHADO',
    conteudo: readTpl('mapa-aproveitamento-turma-detalhado.html'),
  },
  {
    id: 'tpl_seed_mapa_prim_tabela_v1',
    nome: 'Mapa de Aproveitamento — Ensino Primário (Oficial MED)',
    tipo: 'mapa_aproveitamento',
    classeAlvo: 'MAPA_PRIMARIO_TABELA',
    conteudo: readTpl('mapa-aproveitamento-primario.html'),
  },
  {
    id: 'tpl_seed_mapa_i_ciclo_tabela_v1',
    nome: 'Mapa de Aproveitamento — I Ciclo (Oficial MED)',
    tipo: 'mapa_aproveitamento',
    classeAlvo: 'MAPA_I_CICLO_TABELA',
    conteudo: readTpl('mapa-aproveitamento-i-ciclo.html'),
  },
  {
    id: 'tpl_seed_mapa_aproveitamento_por_curso_v1',
    nome: 'Mapa de Aproveitamento — Por Curso (Oficial MED)',
    tipo: 'mapa_aproveitamento',
    classeAlvo: 'MAPA_POR_CURSO_INDIVIDUAL',
    conteudo: readTpl('mapa-aproveitamento-por-curso.html'),
  },
  {
    id: 'tpl_seed_mapa_aproveitamento_v2',
    nome: 'Mapa de Aproveitamento — Por Trimestre',
    tipo: 'mapa_aproveitamento',
    conteudo: readTpl('mapa-aproveitamento-trimestre.html'),
  },
  {
    id: 'tpl_seed_cert_ii_ciclo_v1',
    nome: 'Certificado — II Ciclo (10ª, 11ª, 12ª) Ensino Secundário Geral',
    tipo: 'certificado',
    classeAlvo: '12ª-II-CICLO',
    conteudo: readTpl('certificado-ii-ciclo.html'),
  },
  {
    id: 'tpl_seed_cert_itaq_13_v1',
    nome: 'Certificado de Habilitações — ITAQ 13ª (Técnico-Profissional)',
    tipo: 'certificado',
    classeAlvo: '13ª-ITAQ',
    conteudo: readTpl('certificado-itaq-13a.html'),
  },
  {
    id: 'tpl_seed_cert_hab_11_v1',
    nome: 'Certificado de Habilitações — 11ª Classe',
    tipo: 'certificado',
    classeAlvo: '11ª',
    conteudo: readTpl('certificado-habilitacoes-11a.html'),
  },
  {
    id: 'tpl_seed_cert_hab_12_v1',
    nome: 'Certificado de Habilitações — 12ª Classe',
    tipo: 'certificado',
    classeAlvo: '12ª',
    conteudo: readTpl('certificado-habilitacoes-12a.html'),
  },
  {
    id: 'tpl_seed_cert_hab_13_v1',
    nome: 'Certificado de Habilitações — 13ª Classe (Pré-Universitário)',
    tipo: 'certificado',
    classeAlvo: '13ª',
    conteudo: readTpl('certificado-habilitacoes-13a.html'),
  },
  {
    id: 'tpl_seed_cert_hab_lit_pedagogico_v1',
    nome: 'Certificado de Habilitações Literárias — IIº Ciclo Pedagógico (10ª a 13ª)',
    tipo: 'certificado',
    classeAlvo: 'PEDAGOGICO-II-CICLO',
    bloqueado: true,
    conteudo: readTpl('certificado-pedagogico-ii-ciclo.html'),
  },
  {
    id: 'tpl_seed_cert_tecnico_profissional_v1',
    nome: 'Certificado — Ensino Secundário Técnico-Profissional (IIº Ciclo)',
    tipo: 'certificado',
    classeAlvo: 'TECNICO-PROFISSIONAL',
    bloqueado: true,
    conteudo: readTpl('certificado-tecnico-profissional.html'),
  },
  {
    id: 'tpl_seed_ficha_matricula_v1',
    nome: 'Ficha de Reconfirmação de Matrícula',
    tipo: 'ficha_matricula',
    conteudo: readTpl('ficha-matricula.html'),
  },
  {
    id: 'tpl_seed_recibo_salario_v1',
    nome: 'Recibo de Vencimento',
    tipo: 'recibo_salario',
    conteudo: readTpl('recibo-vencimento.html'),
  },
  {
    id: 'tpl_seed_boletim_notas_final_primario_iciclo_v1',
    nome: 'Boletim de Notas Final — Ensino Primário e I Ciclo',
    tipo: 'declaracao',
    classeAlvo: 'PRIMARIO_ICICLO',
    conteudo: readTpl('boletim-notas-primario-i-ciclo.html'),
  },
  {
    id: 'tpl_seed_boletim_inscricao_v1',
    nome: 'Boletim de Inscrição',
    tipo: 'ficha_inscricao',
    conteudo: readTpl('boletim-inscricao.html'),
  },
  {
    id: 'tpl_seed_boletim_matricula_v1',
    nome: 'Boletim de Matrícula',
    tipo: 'boletim_matricula',
    conteudo: readTpl('boletim-matricula.html'),
  },
  {
    id: 'tpl_seed_ficha_reconfirmacao_matricula_v1',
    nome: 'Ficha/Boletim de Reconfirmação de Matrícula',
    tipo: 'ficha_reconfirmacao_matricula',
    conteudo: readTpl('ficha-reconfirmacao-matricula.html'),
  },
  {
    id: 'tpl_seed_lista_admitidos_v1',
    nome: 'Lista de Resultados de Admissão',
    tipo: 'lista_admitidos',
    conteudo: readTpl('lista-admitidos.html'),
  },
  {
    id: 'tpl_seed_lista_inscritos_v2',
    nome: 'Lista de Candidatos por Sala de Exame',
    tipo: 'lista_inscritos',
    conteudo: readTpl('lista-candidatos-sala-exame.html'),
  },
  {
    id: 'tpl_seed_lista_resultados_admissao_v1',
    nome: 'Lista de Resultados de Admissão (Vitrine)',
    tipo: 'lista_resultados_admissao',
    conteudo: readTpl('lista-resultados-admissao.html'),
  },
  {
    id: 'tpl_seed_extrato_propina_v1',
    nome: 'Extracto de Propinas do Estudante',
    tipo: 'extrato_propina',
    conteudo: readTpl('extrato-propinas.html'),
  },
  {
    id: 'tpl_acta_presenca_provas_v1',
    nome: 'Acta de Presença em Provas',
    tipo: 'outro',
    bloqueado: false,
    conteudo: readTpl('acta-presenca-provas.html'),
  },
  {
    id: 'tpl_seed_boletim_notas_ii_ciclo_v1',
    nome: 'Boletim de Notas — II Ciclo (10ª–13ª)',
    tipo: 'boletim_notas_ii_ciclo',
    classeAlvo: 'II_CICLO',
    bloqueado: false,
    conteudo: readTpl('boletim-notas-ii-ciclo.html'),
  },
  {
    id: 'tpl_relatorio_acompanhamento_pautas',
    nome: 'Relatório de Acompanhamento de Pautas',
    tipo: 'outro',
    bloqueado: false,
    conteudo: readTpl('relatorio-acompanhamento-pautas.html'),
  },

  // ── Certificado de Habilitações — IIº Ciclo do Ensino Secundário Geral ──────
  {
    id: 'tpl_seed_cert_hab_ii_ciclo_geral_v1',
    nome: 'Certificado de Habilitações — IIº Ciclo do Ensino Secundário Geral (10ª, 11ª, 12ª)',
    tipo: 'certificado',
    bloqueado: false,
    conteudo: readTpl('certificado-habilitacoes-ii-ciclo-geral.html'),
  },
];
