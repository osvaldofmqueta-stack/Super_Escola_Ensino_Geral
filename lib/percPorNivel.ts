/**
 * Utilitário: retorna as percentagens de avaliação correctas para um nível de ensino,
 * respeitando o modo "Complexo Escolar" (múltiplos modelos por nível).
 *
 * Quando config.complexoEscolar = true, procura em config.modelosAvaliacaoPorNivel[nivel].
 * Caso contrário, ou se o nível não tiver mapeamento, usa as percentagens globais.
 */

export interface PercAvaliacaoNivel {
  modeloId: string;
  percMac: number;
  percPp: number;
  percNt: number;
  percPt: number;
  percPg: number;
  percExame: number;
  macMin: number;
  macMax: number;
  tipoEscala: 'proporcional' | 'linear';
  /** Se false, a coluna NPP não existe na pauta — NT = MAC convertido directamente */
  temNPP?: boolean;
  /** Se false, a coluna NPT não existe na pauta — NF (T1/T2) = NT directamente */
  temNPT?: boolean;
}

/** Níveis de ensino reconhecidos pelo sistema. */
export const NIVEIS_COMPLEXO = [
  { key: 'Primário',             label: 'Ensino Primário',               classes: '1ª – 6ª Classe',  modeloDefault: 'med_primario' },
  { key: 'I Ciclo',              label: '1.º Ciclo do Secundário',       classes: '7ª – 9ª Classe',  modeloDefault: 'med_1ciclo' },
  { key: 'II Ciclo',             label: '2.º Ciclo / Pré-Universitário', classes: '10ª – 12ª Classe', modeloDefault: 'med_2ciclo' },
  { key: 'Técnico-Profissional', label: 'Ensino Técnico-Profissional',   classes: '11ª – 13ª Classe', modeloDefault: 'tecnico_profissional' },
] as const;

export type NivelChave = typeof NIVEIS_COMPLEXO[number]['key'];

/** Retorna as percentagens para o nível de ensino dado, ou as globais como fallback. */
export function getPercForNivel(
  nivel: string | null | undefined,
  config: {
    complexoEscolar?: boolean;
    modelosAvaliacaoPorNivel?: Record<string, PercAvaliacaoNivel> | null;
    percMac?: number;
    percPp?: number;
    percNt?: number;
    percPt?: number;
    percPg?: number;
    percExame?: number;
    macMin?: number;
    macMax?: number;
    tipoEscala?: 'proporcional' | 'linear';
  }
): PercAvaliacaoNivel {
  const global: PercAvaliacaoNivel = {
    modeloId: 'global',
    percMac:  config.percMac   ?? 30,
    percPp:   config.percPp    ?? 70,
    percNt:   config.percNt    ?? 60,
    percPt:   config.percPt    ?? 40,
    percPg:   config.percPg    ?? 40,
    percExame:config.percExame ?? 40,
    macMin:   config.macMin    ?? 1,
    macMax:   config.macMax    ?? 5,
    tipoEscala: config.tipoEscala ?? 'proporcional',
    temNPP: (config as any).temNPP !== false,
    temNPT: (config as any).temNPT !== false,
  };
  if (!config.complexoEscolar || !nivel || !config.modelosAvaliacaoPorNivel) return global;
  const m = config.modelosAvaliacaoPorNivel[nivel];
  if (!m) return global;
  return {
    ...m,
    temNPP: m.temNPP !== false,
    temNPT: m.temNPT !== false,
  };
}
