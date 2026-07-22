export type Genero = 'M' | 'F' | '';

const ROLE_LABELS_M: Record<string, string> = {
  ceo: 'CEO',
  pca: 'Presidente do Conselho',
  admin: 'Administrador',
  director: 'Director',
  subdirector_pedagogico: 'Sub-Director Pedagógico',
  chefe_secretaria: 'Chefe de Secretaria',
  secretaria: 'Secretário Académico',
  professor: 'Professor',
  diretor_turma: 'Director de Turma',
  subdiretor_administrativo: 'Subdirector Administrativo',
  aluno: 'Aluno',
  financeiro: 'Gestor Financeiro',
  encarregado: 'Encarregado',
  rh: 'Técnico de RH',
  pedagogico: 'Coordenador Pedagógico',
  coordenador_curso: 'Coordenador de Curso',
  membro_conselho_pedagogico: 'Membro do Conselho Pedagógico',
  membro_conselho_escola: 'Membro do Conselho de Escola',
};

const ROLE_LABELS_F: Record<string, string> = {
  ceo: 'CEO',
  pca: 'Presidente do Conselho',
  admin: 'Administradora',
  director: 'Directora',
  subdirector_pedagogico: 'Sub-Directora Pedagógica',
  chefe_secretaria: 'Chefe de Secretaria',
  secretaria: 'Secretária Académica',
  professor: 'Professora',
  diretor_turma: 'Directora de Turma',
  subdiretor_administrativo: 'Subdirectora Administrativa',
  aluno: 'Aluna',
  financeiro: 'Gestora Financeira',
  encarregado: 'Encarregada',
  rh: 'Técnica de RH',
  pedagogico: 'Coordenadora Pedagógica',
  coordenador_curso: 'Coordenadora de Curso',
  membro_conselho_pedagogico: 'Membro do Conselho Pedagógico',
  membro_conselho_escola: 'Membro do Conselho de Escola',
};

export function getRoleLabel(role: string, genero: Genero | undefined | null): string {
  const g = genero ?? 'M';
  const map = g === 'F' ? ROLE_LABELS_F : ROLE_LABELS_M;
  return map[role] ?? role;
}

export function getGeneroLabel(genero: Genero | undefined | null): string {
  if (genero === 'F') return 'Feminino';
  if (genero === 'M') return 'Masculino';
  return 'Não definido';
}
