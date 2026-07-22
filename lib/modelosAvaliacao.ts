/**
 * Modelos de cálculo de avaliação usados nas escolas angolanas.
 * Cada modelo define as percentagens E a escala de avaliação contínua.
 *
 * Fontes: MED Angola (Decreto Executivo n.º 5/22, Despacho 38/09),
 * estruturas de pautas IMNE, IMAG, PUNIV e escolas técnico-profissionais.
 */

export interface ModeloAvaliacao {
  id: string;
  nome: string;
  nivelEnsino: string;
  descricao: string;
  /** Parâmetros de percentagem aplicados ao config_geral */
  percMac: number;
  percPp: number;
  percNt: number;
  percPt: number;
  percPg: number;
  percExame: number;
  /** Escala das Avaliações Contínuas vinculada ao modelo */
  macMin: number;
  macMax: number;
  tipoEscala: 'proporcional' | 'linear';
  /** Se false, NPP/PP não é lançado — o MAC vira NT directamente */
  temNPP: boolean;
  /** Se false, NPT/PT não é lançado — NT vira NF directamente */
  temNPT: boolean;
  cor: string;
  icone: string;
}

export const MODELOS_AVALIACAO: ModeloAvaliacao[] = [
  {
    id: 'med_1ciclo',
    nome: 'MED — 1.º Ciclo do Secundário',
    nivelEnsino: '7.ª, 8.ª e 9.ª Classe',
    descricao:
      'Modelo oficial do Ministério da Educação para o 1.º Ciclo. ' +
      'A Nota Trimestral combina a MAC (1–5 convertida ×4) com a NPP. ' +
      'A Nota Final combina a NT com a NPT (ambas em 0–20).',
    percMac: 30, percPp: 70, percNt: 60, percPt: 40, percPg: 40, percExame: 40,
    macMin: 1, macMax: 5, tipoEscala: 'proporcional',
    temNPP: true, temNPT: true,
    cor: '#1a6b3c', icone: 'school-outline',
  },
  {
    id: 'med_2ciclo',
    nome: 'MED — 2.º Ciclo / Pré-Universitário',
    nivelEnsino: '10.ª, 11.ª e 12.ª Classe',
    descricao:
      'Modelo oficial MED para o PUNIV. ' +
      'Igual ao 1.º Ciclo nos 1.º/2.º Trimestres. No 3.º Trimestre: ' +
      '10.ª/11.ª usam PG1+PG2; 12.ª usa EX1+EX2.',
    percMac: 30, percPp: 70, percNt: 60, percPt: 40, percPg: 40, percExame: 40,
    macMin: 1, macMax: 5, tipoEscala: 'proporcional',
    temNPP: true, temNPT: true,
    cor: '#1a4a8a', icone: 'ribbon-outline',
  },
  {
    id: 'med_primario',
    nome: 'MED — Ensino Primário',
    nivelEnsino: '1.ª a 6.ª Classe',
    descricao:
      'Modelo para o Ensino Primário. Não existe NPP — ' +
      'a NT é igual à MAC convertida. A NF combina NT com NPT.',
    percMac: 100, percPp: 0, percNt: 60, percPt: 40, percPg: 40, percExame: 40,
    macMin: 1, macMax: 5, tipoEscala: 'proporcional',
    temNPP: false, temNPT: true,
    cor: '#b45309', icone: 'book-outline',
  },
  {
    id: 'modelo_mac_npt_metade',
    nome: 'Modelo MAC + NPT ÷ 2',
    nivelEnsino: 'Escolas com modelo simplificado',
    descricao:
      'MT = (MAC + NPT) ÷ 2. Peso igual entre MAC e NPT. ' +
      'Sem NPT separada — incorporada directamente na MT.',
    percMac: 50, percPp: 50, percNt: 100, percPt: 0, percPg: 40, percExame: 40,
    macMin: 1, macMax: 5, tipoEscala: 'proporcional',
    temNPP: true, temNPT: false,
    cor: '#7c3aed', icone: 'calculator-outline',
  },
  {
    id: 'tecnico_profissional',
    nome: 'Ensino Técnico-Profissional (IMNE / ETP)',
    nivelEnsino: '10.ª a 13.ª Classe Técnica',
    descricao:
      'Escolas técnico-profissionais (IMNE, politécnicas). ' +
      'Avaliações directamente em 0–20. Maior peso à NPP (60%) e equilíbrio NT/NPT.',
    percMac: 40, percPp: 60, percNt: 50, percPt: 50, percPg: 40, percExame: 40,
    macMin: 0, macMax: 20, tipoEscala: 'proporcional',
    temNPP: true, temNPT: true,
    cor: '#c2410c', icone: 'construct-outline',
  },
  {
    id: 'formacao_professores',
    nome: 'Instituto Médio / Formação de Professores',
    nivelEnsino: 'IMAG, IME, ISCED e institutos médios',
    descricao:
      'Institutos médios e escolas de formação de professores. ' +
      'Avaliações em 0–20. NPP com 65%, NPT com 45% da NF.',
    percMac: 35, percPp: 65, percNt: 55, percPt: 45, percPg: 40, percExame: 40,
    macMin: 0, macMax: 20, tipoEscala: 'proporcional',
    temNPP: true, temNPT: true,
    cor: '#0891b2', icone: 'people-outline',
  },
  {
    id: 'sem_prova_trimestral',
    nome: 'Modelo sem Prova Trimestral (só MAC + NPP)',
    nivelEnsino: 'Escolas sem prova de período',
    descricao:
      'Sem NPT. A Nota Final é igual à NT: apenas MAC e NPP contam.',
    percMac: 30, percPp: 70, percNt: 100, percPt: 0, percPg: 40, percExame: 40,
    macMin: 1, macMax: 5, tipoEscala: 'proporcional',
    temNPP: true, temNPT: false,
    cor: '#64748b', icone: 'document-text-outline',
  },
  {
    id: 'personalizado',
    nome: 'Modelo Personalizado',
    nivelEnsino: 'Configuração livre',
    descricao:
      'Defina as percentagens e escala manualmente para adaptar ' +
      'às regras específicas da sua escola.',
    percMac: 30, percPp: 70, percNt: 60, percPt: 40, percPg: 40, percExame: 40,
    macMin: 1, macMax: 5, tipoEscala: 'proporcional',
    temNPP: true, temNPT: true,
    cor: '#374151', icone: 'settings-outline',
  },
];

export function getModeloPorId(id: string | null | undefined): ModeloAvaliacao | undefined {
  return MODELOS_AVALIACAO.find(m => m.id === id);
}

/** Detecta qual modelo está activo com base nas percentagens actuais */
export function detectarModeloActivo(
  percMac: number,
  percPp: number,
  percNt: number,
  percPt: number,
  percPg: number,
  percExame: number,
  modeloGuardado?: string | null,
): string {
  if (modeloGuardado) return modeloGuardado;
  const match = MODELOS_AVALIACAO.find(m =>
    m.id !== 'personalizado' &&
    m.percMac === percMac &&
    m.percPp === percPp &&
    m.percNt === percNt &&
    m.percPt === percPt &&
    m.percPg === percPg &&
    m.percExame === percExame,
  );
  return match?.id ?? 'personalizado';
}
