export interface NifData {
  nif: string;
  nome: string;
  tipo: 'SINGULAR' | 'COLECTIVO';
  estado: string;
  regimeIva: string;
  residenciaFiscal: string;
}

export async function consultarNIF(_nif: string): Promise<NifData | null> {
  return null;
}
