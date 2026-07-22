import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import type { Genero } from '@/utils/genero';

export function useResolvedGenero(): Genero {
  const { user } = useAuth();
  const { alunos, professores } = useData();

  if (!user) return 'M';

  if (user.genero === 'F' || user.genero === 'M') return user.genero;

  if (user.role === 'aluno') {
    const aluno = alunos.find(a =>
      (user.alunoId && String(a.id) === String(user.alunoId)) ||
      String(a.utilizadorId) === String(user.id)
    );
    if (aluno?.genero === 'F' || aluno?.genero === 'M') return aluno.genero as Genero;
  }

  if (user.role === 'professor' || user.role === 'diretor_turma') {
    const prof = professores.find(p =>
      String((p as any).utilizadorId) === String(user.id)
    );
    const pg = (prof as any)?.genero;
    if (pg === 'F' || pg === 'M') return pg as Genero;
  }

  return 'M';
}
