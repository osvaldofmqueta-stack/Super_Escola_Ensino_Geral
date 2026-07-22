// ─── Departamentos e Cargos das Escolas de Ensino Geral em Angola ─────────────
// Baseado no Decreto Presidencial n.º 162/23 e Lei n.º 32/20

export type DepartamentoKey =
  | 'direcao'
  | 'pedagogico'
  | 'administrativo'
  | 'financeiro'
  | 'rh'
  | 'biblioteca'
  | 'servicos_gerais';

export interface Departamento {
  key: DepartamentoKey;
  label: string;
  icon: string;
  descricao: string;
}

export interface CargoInfo {
  id: string;
  label: string;
  departamento: DepartamentoKey;
  role: string;
  nivelAcesso: 'total' | 'operacional' | 'limitado' | 'sem_acesso';
  descricao: string;
}

export const DEPARTAMENTOS: Departamento[] = [
  {
    key: 'direcao',
    label: 'Direcção',
    icon: 'shield-star',
    descricao: 'Órgão máximo de gestão da escola — Director, Subdirectores e Chefes de Secretaria',
  },
  {
    key: 'pedagogico',
    label: 'Área Pedagógica',
    icon: 'school',
    descricao: 'Docência, coordenação curricular, psicopedagogia e qualidade académica',
  },
  {
    key: 'administrativo',
    label: 'Área Administrativa',
    icon: 'briefcase',
    descricao: 'Secretaria, arquivo, expediente, TIC e relações públicas',
  },
  {
    key: 'financeiro',
    label: 'Área Financeira',
    icon: 'cash-multiple',
    descricao: 'Contabilidade, tesouraria, propinas e gestão de património',
  },
  {
    key: 'rh',
    label: 'Recursos Humanos',
    icon: 'account-group',
    descricao: 'Gestão de pessoal, contratos, assiduidade e processamento salarial',
  },
  {
    key: 'biblioteca',
    label: 'Biblioteca & Meios de Ensino',
    icon: 'bookshelf',
    descricao: 'Biblioteca escolar, laboratórios e meios audiovisuais',
  },
  {
    key: 'servicos_gerais',
    label: 'Serviços Gerais & Apoio',
    icon: 'tools',
    descricao: 'Segurança, limpeza, manutenção e transportes',
  },
];

export const CARGOS: CargoInfo[] = [
  // ─── Direcção ───────────────────────────────────────────────────────────────
  {
    id: 'director',
    label: 'Director da Escola',
    departamento: 'direcao',
    role: 'director',
    nivelAcesso: 'total',
    descricao: 'Autoridade máxima: pedagógica, científica, financeira e administrativa',
  },
  {
    id: 'subdirector_pedagogico',
    label: 'Subdirector Pedagógico',
    departamento: 'direcao',
    role: 'director',
    nivelAcesso: 'total',
    descricao: 'Coadjuva o Director nas matérias pedagógicas e curriculares',
  },
  {
    id: 'subdirector_administrativo',
    label: 'Subdirector Administrativo',
    departamento: 'direcao',
    role: 'director',
    nivelAcesso: 'total',
    descricao: 'Coadjuva o Director nas matérias administrativas e financeiras',
  },
  {
    id: 'chefe_secretaria_geral',
    label: 'Chefe de Secretaria Geral',
    departamento: 'direcao',
    role: 'chefe_secretaria',
    nivelAcesso: 'total',
    descricao: 'Coordena toda a secretaria — expediente, arquivo e atendimento',
  },
  {
    id: 'chefe_secretaria_pedagogica',
    label: 'Chefe de Secretaria Pedagógica',
    departamento: 'direcao',
    role: 'chefe_secretaria',
    nivelAcesso: 'total',
    descricao: 'Coordena os registos académicos: matrículas, pautas e certificados',
  },

  // ─── Pedagógico ─────────────────────────────────────────────────────────────
  {
    id: 'coordenador_disciplina',
    label: 'Coordenador de Disciplina',
    departamento: 'pedagogico',
    role: 'pedagogico',
    nivelAcesso: 'operacional',
    descricao: 'Coordena a área curricular de uma ou mais disciplinas',
  },
  {
    id: 'coordenador_classe',
    label: 'Coordenador de Classe / Director de Turma',
    departamento: 'pedagogico',
    role: 'pedagogico',
    nivelAcesso: 'operacional',
    descricao: 'Responsável pedagógico por uma classe ou turma',
  },
  {
    id: 'coordenador_turno',
    label: 'Coordenador de Turno',
    departamento: 'pedagogico',
    role: 'pedagogico',
    nivelAcesso: 'operacional',
    descricao: 'Coordena as actividades do turno (manhã, tarde ou noite)',
  },
  {
    id: 'professor_primario',
    label: 'Professor Primário (1ª – 6ª Classe)',
    departamento: 'pedagogico',
    role: 'professor',
    nivelAcesso: 'operacional',
    descricao: 'Docente do ensino primário',
  },
  {
    id: 'professor_i_ciclo',
    label: 'Professor do I Ciclo (7ª – 9ª Classe)',
    departamento: 'pedagogico',
    role: 'professor',
    nivelAcesso: 'operacional',
    descricao: 'Docente do I Ciclo do ensino secundário',
  },
  {
    id: 'professor_ii_ciclo',
    label: 'Professor do II Ciclo (10ª – 13ª Classe)',
    departamento: 'pedagogico',
    role: 'professor',
    nivelAcesso: 'operacional',
    descricao: 'Docente do II Ciclo do ensino secundário',
  },
  {
    id: 'professor_titular',
    label: 'Professor Titular',
    departamento: 'pedagogico',
    role: 'professor',
    nivelAcesso: 'operacional',
    descricao: 'Categoria mais elevada da carreira docente',
  },
  {
    id: 'psicologo',
    label: 'Psicólogo / Técnico Psicopedagógico',
    departamento: 'pedagogico',
    role: 'pedagogico',
    nivelAcesso: 'operacional',
    descricao: 'Gabinete Psicopedagógico — apoio a alunos e docentes',
  },

  // ─── Administrativo ──────────────────────────────────────────────────────────
  {
    id: 'tecnico_secretaria',
    label: 'Técnico de Secretaria',
    departamento: 'administrativo',
    role: 'secretaria',
    nivelAcesso: 'operacional',
    descricao: 'Operações de secretaria: matrículas, certidões e atendimento',
  },
  {
    id: 'assistente_administrativo',
    label: 'Assistente Administrativo',
    departamento: 'administrativo',
    role: 'secretaria',
    nivelAcesso: 'operacional',
    descricao: 'Suporte às operações administrativas gerais',
  },
  {
    id: 'tecnico_arquivo',
    label: 'Técnico de Arquivo e Expediente',
    departamento: 'administrativo',
    role: 'secretaria',
    nivelAcesso: 'limitado',
    descricao: 'Gestão de documentação, correspondência e arquivo escolar',
  },
  {
    id: 'tecnico_ti',
    label: 'Técnico de TIC',
    departamento: 'administrativo',
    role: 'admin',
    nivelAcesso: 'operacional',
    descricao: 'Infraestrutura tecnológica e sistemas informáticos',
  },
  {
    id: 'relacoes_publicas',
    label: 'Relações Públicas / Comunicação',
    departamento: 'administrativo',
    role: 'secretaria',
    nivelAcesso: 'limitado',
    descricao: 'Imagem institucional e comunicação externa da escola',
  },

  // ─── Financeiro ──────────────────────────────────────────────────────────────
  {
    id: 'tecnico_financeiro',
    label: 'Técnico Financeiro / Contabilista',
    departamento: 'financeiro',
    role: 'financeiro',
    nivelAcesso: 'operacional',
    descricao: 'Contabilidade geral, propinas e gestão orçamental',
  },
  {
    id: 'tesoureiro',
    label: 'Tesoureiro',
    departamento: 'financeiro',
    role: 'financeiro',
    nivelAcesso: 'operacional',
    descricao: 'Gestão de caixa, cobranças e pagamentos',
  },
  {
    id: 'tecnico_patrimonio',
    label: 'Técnico de Património e Inventário',
    departamento: 'financeiro',
    role: 'financeiro',
    nivelAcesso: 'limitado',
    descricao: 'Controlo de bens patrimoniais e inventário da escola',
  },

  // ─── Recursos Humanos ────────────────────────────────────────────────────────
  {
    id: 'tecnico_rh',
    label: 'Técnico de Gestão de Pessoal',
    departamento: 'rh',
    role: 'rh',
    nivelAcesso: 'operacional',
    descricao: 'Gestão de contratos, assiduidade e processos de pessoal',
  },
  {
    id: 'tecnico_salarial',
    label: 'Técnico de Processamento Salarial',
    departamento: 'rh',
    role: 'rh',
    nivelAcesso: 'operacional',
    descricao: 'Vencimentos, IRT, INSS e folhas de salário',
  },

  // ─── Biblioteca & Meios de Ensino ────────────────────────────────────────────
  {
    id: 'bibliotecario',
    label: 'Bibliotecário',
    departamento: 'biblioteca',
    role: 'pedagogico',
    nivelAcesso: 'limitado',
    descricao: 'Gestão do acervo bibliográfico — empréstimos e devoluções',
  },
  {
    id: 'tecnico_laboratorio',
    label: 'Técnico de Laboratório',
    departamento: 'biblioteca',
    role: 'professor',
    nivelAcesso: 'limitado',
    descricao: 'Gestão e manutenção de laboratórios de ciências e informática',
  },
  {
    id: 'tecnico_audiovisual',
    label: 'Técnico de Meios Audiovisuais',
    departamento: 'biblioteca',
    role: 'secretaria',
    nivelAcesso: 'limitado',
    descricao: 'Equipamentos multimédia e recursos tecnológicos de ensino',
  },

  // ─── Serviços Gerais & Apoio ─────────────────────────────────────────────────
  {
    id: 'porteiro_seguranca',
    label: 'Porteiro / Segurança',
    departamento: 'servicos_gerais',
    role: 'sem_acesso',
    nivelAcesso: 'sem_acesso',
    descricao: 'Controlo de acesso e segurança das instalações',
  },
  {
    id: 'auxiliar_limpeza',
    label: 'Encarregado de Limpeza / Higiene',
    departamento: 'servicos_gerais',
    role: 'sem_acesso',
    nivelAcesso: 'sem_acesso',
    descricao: 'Higiene e limpeza das instalações escolares',
  },
  {
    id: 'auxiliar_manutencao',
    label: 'Auxiliar de Manutenção',
    departamento: 'servicos_gerais',
    role: 'sem_acesso',
    nivelAcesso: 'sem_acesso',
    descricao: 'Manutenção e pequenas reparações das instalações',
  },
  {
    id: 'motorista',
    label: 'Motorista',
    departamento: 'servicos_gerais',
    role: 'sem_acesso',
    nivelAcesso: 'sem_acesso',
    descricao: 'Transporte escolar e deslocações institucionais',
  },
];

export const CARGOS_POR_DEPARTAMENTO: Record<DepartamentoKey, CargoInfo[]> = {
  direcao: CARGOS.filter(c => c.departamento === 'direcao'),
  pedagogico: CARGOS.filter(c => c.departamento === 'pedagogico'),
  administrativo: CARGOS.filter(c => c.departamento === 'administrativo'),
  financeiro: CARGOS.filter(c => c.departamento === 'financeiro'),
  rh: CARGOS.filter(c => c.departamento === 'rh'),
  biblioteca: CARGOS.filter(c => c.departamento === 'biblioteca'),
  servicos_gerais: CARGOS.filter(c => c.departamento === 'servicos_gerais'),
};

export function getCargoById(id: string): CargoInfo | undefined {
  return CARGOS.find(c => c.id === id);
}

export function getDepartamentoByKey(key: DepartamentoKey): Departamento | undefined {
  return DEPARTAMENTOS.find(d => d.key === key);
}

export function getRoleForCargo(cargoId: string): string {
  const cargo = getCargoById(cargoId);
  if (!cargo || cargo.role === 'sem_acesso') return '';
  return cargo.role;
}

// ─── Secções / Unidades Orgânicas por Departamento ───────────────────────────
export const SECCOES_POR_DEPARTAMENTO: Record<DepartamentoKey, string[]> = {
  direcao: [
    'Gabinete do Director',
    'Secretaria Geral',
    'Secretaria Pedagógica',
    'Conselho de Direcção',
    'Gabinete de Apoio à Direcção',
  ],
  pedagogico: [
    'Sala de Professores',
    'Gabinete Pedagógico',
    'Gabinete Psicopedagógico',
    'Coordenação de Disciplinas',
    'Coordenação de Turno',
    'Laboratório de Ciências',
    'Laboratório de Informática',
    'Sala de Recursos Didácticos',
  ],
  administrativo: [
    'Secretaria',
    'Arquivo',
    'Expediente',
    'Atendimento ao Público',
    'Gabinete de TIC',
    'Relações Públicas',
  ],
  financeiro: [
    'Tesouraria',
    'Contabilidade',
    'Gestão de Propinas',
    'Gestão de Património',
    'Orçamento e Planeamento',
  ],
  rh: [
    'Gestão de Pessoal',
    'Processamento Salarial',
    'Contratos e Vínculos',
    'Assiduidade e Ponto',
  ],
  biblioteca: [
    'Biblioteca Escolar',
    'Laboratório de Ciências',
    'Laboratório de Informática',
    'Meios Audiovisuais',
    'Sala de Recursos',
  ],
  servicos_gerais: [
    'Portaria / Segurança',
    'Limpeza e Higiene',
    'Manutenção',
    'Transporte Escolar',
    'Cantina / Refeitório',
  ],
};

// ─── Especialidades / Áreas por Departamento ─────────────────────────────────
export const ESPECIALIDADES_POR_DEPARTAMENTO: Record<DepartamentoKey, string[]> = {
  direcao: [
    'Gestão Escolar',
    'Administração Educacional',
    'Pedagogia',
    'Psicologia Educacional',
    'Direito',
    'Gestão Pública',
  ],
  pedagogico: [
    'Matemática',
    'Física',
    'Química',
    'Biologia / Ciências Naturais',
    'Língua Portuguesa',
    'História',
    'Geografia',
    'Educação Física',
    'Inglês',
    'Francês',
    'Informática / TIC',
    'Filosofia',
    'Economia',
    'Contabilidade',
    'Educação Moral e Cívica',
    'Agropecuária',
    'Produção Animal',
    'Produção Vegetal',
    'Psicologia',
    'Psicopedagogia',
    'Educação Artística',
    'Educação Visual e Plástica',
  ],
  administrativo: [
    'Administração',
    'Secretariado',
    'Arquivo e Documentação',
    'Tecnologias de Informação',
    'Relações Públicas',
    'Comunicação',
  ],
  financeiro: [
    'Contabilidade',
    'Finanças',
    'Gestão',
    'Economia',
    'Auditoria',
    'Tesouraria',
  ],
  rh: [
    'Gestão de Recursos Humanos',
    'Direito do Trabalho',
    'Psicologia Organizacional',
    'Administração',
  ],
  biblioteca: [
    'Biblioteconomia',
    'Ciências da Informação',
    'Tecnologias de Informação',
    'Biologia / Ciências',
    'Física / Química',
    'Multimédia',
  ],
  servicos_gerais: [
    'Segurança',
    'Electricidade / Electrónica',
    'Construção Civil',
    'Mecânica',
    'Condução',
    'Higiene e Segurança no Trabalho',
  ],
};

// ─── Habilitações Académicas ──────────────────────────────────────────────────
// O valor por tempo lectivo é usado para calcular o salário de contratos
// temporários e de prestação de serviços (salário = valor × tempos × semanas)
export interface HabilitacaoAcademica {
  id: string;
  label: string;
  descricao: string;
  nivelNumerico: number;
  valorTempoLectivoSugerido: number; // AOA por tempo lectivo (referência)
}

export const HABILITACOES_ACADEMICAS: HabilitacaoAcademica[] = [
  {
    id: '10a_classe',
    label: '10ª Classe',
    descricao: 'Ensino Secundário Incompleto (I Ciclo)',
    nivelNumerico: 1,
    valorTempoLectivoSugerido: 800,
  },
  {
    id: '12a_13a_classe',
    label: '12ª / 13ª Classe',
    descricao: 'Ensino Secundário Completo (II Ciclo)',
    nivelNumerico: 2,
    valorTempoLectivoSugerido: 1200,
  },
  {
    id: 'medio',
    label: 'Médio / Técnico-Profissional',
    descricao: 'Instituto Médio ou curso técnico equivalente',
    nivelNumerico: 3,
    valorTempoLectivoSugerido: 1500,
  },
  {
    id: 'bacharel',
    label: 'Bacharelato',
    descricao: '3 anos de formação superior',
    nivelNumerico: 4,
    valorTempoLectivoSugerido: 2000,
  },
  {
    id: 'licenciatura',
    label: 'Licenciatura',
    descricao: '4 a 5 anos de formação superior',
    nivelNumerico: 5,
    valorTempoLectivoSugerido: 2800,
  },
  {
    id: 'pos_graduacao',
    label: 'Pós-Graduação / Especialização',
    descricao: 'Formação de especialização pós-licenciatura',
    nivelNumerico: 6,
    valorTempoLectivoSugerido: 3200,
  },
  {
    id: 'mestrado',
    label: 'Mestrado',
    descricao: 'Grau académico de mestre',
    nivelNumerico: 7,
    valorTempoLectivoSugerido: 4000,
  },
  {
    id: 'doutoramento',
    label: 'Doutoramento / PhD',
    descricao: 'Grau académico de doutor',
    nivelNumerico: 8,
    valorTempoLectivoSugerido: 5500,
  },
];

export function getHabilitacaoById(id: string): HabilitacaoAcademica | undefined {
  return HABILITACOES_ACADEMICAS.find(h => h.id === id);
}
