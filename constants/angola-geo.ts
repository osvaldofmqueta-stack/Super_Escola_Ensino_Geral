export const ANGOLA_GEO: Record<string, string[]> = {
  'Luanda': ['Luanda', 'Belas', 'Cacuaco', 'Cazenga', 'Icolo e Bengo', 'Kilamba Kiaxi', 'Quiçama', 'Sambizanga', 'Viana'],
  'Benguela': ['Benguela', 'Baía Farta', 'Balombo', 'Bocoio', 'Caimbambo', 'Chongoroi', 'Cubal', 'Ganda', 'Lobito', 'Longonjo'],
  'Huambo': ['Huambo', 'Bailundo', 'Caála', 'Catchiungo', 'Chinjenje', 'Ecunha', 'Londuimbali', 'Longonjo', 'Mungo', 'Ukuma'],
  'Bié': ['Kuito', 'Andulo', 'Camacupa', 'Catabola', 'Chitembo', 'Cuemba', 'Nharea'],
  'Uíge': ['Uíge', 'Alto Cauale', 'Ambuíla', 'Bembe', 'Bungo', 'Buza', 'Damba', 'Maquela do Zombo', 'Negage', 'Puri', 'Quitexe', 'Sanza Pombo', 'Songo', 'Yumbi'],
  'Malanje': ['Malanje', 'Cacuso', 'Calandula', 'Cambundi-Catembo', 'Cangandala', 'Caombo', 'Cuaba Nzoji', 'Cunda-dia-Baza', 'Luquembo', 'Marimba', 'Massango', 'Mucari', 'Quela', 'Quirima'],
  'Moxico': ['Luena', 'Alto Zambeze', 'Bundas', 'Camanongue', 'Léua', 'Luacano', 'Luchazes', 'Lucusse', 'Lumeje'],
  'Cuando Cubango': ['Menongue', 'Calai', 'Cuangar', 'Cuchi', 'Dirico', 'Kavango', 'Longa', 'Mavinga', 'Nancova', 'Rivungo'],
  'Cunene': ['Ondjiva', 'Cahama', 'Cuanhama', 'Cuvelai', 'Namacunde', 'Ombadja'],
  'Namibe': ['Moçâmedes', 'Bibala', 'Camucuio', 'Tômbwa', 'Virei'],
  'Huíla': ['Lubango', 'Caconda', 'Cacula', 'Caluquembe', 'Chiange', 'Chibia', 'Chicomba', 'Chipindo', 'Cuvango', 'Gambos', 'Humpata', 'Jamba', 'Matala', 'Quilengues', 'Quipungo'],
  'Kuanza Norte': ["N'dalatando", 'Alto Dande', 'Ambaca', 'Banga', 'Bolongongo', 'Cambambe', 'Cazengo', 'Golungo Alto', 'Gonguembo', 'Lucala', 'Ngonguembo', 'Quiculungo', 'Samba Caju'],
  'Kuanza Sul': ['Sumbe', 'Amboim', 'Cassongue', 'Cela', 'Conda', 'Ebo', 'Kibala', 'Mussende', 'Porto Amboim', 'Quibala', 'Quilenda', 'Seles', 'Waku Kungo'],
  'Lunda Norte': ['Dundo', 'Cambulo', 'Capenda-Camulemba', 'Caungula', 'Chitato', 'Cuango', 'Cuilo', 'Lubalo', 'Lucapa', 'Xá-Muteba'],
  'Lunda Sul': ['Saurimo', 'Cacolo', 'Dala', 'Muconda'],
  'Zaire': ["M'banza Kongo", 'Cuimba', 'Nóqui', 'Nzeto', 'Soyo', 'Tomboco'],
  'Cabinda': ['Cabinda', 'Belize', 'Buco-Zau', 'Cacongo'],
  'Bengo': ['Caxito', 'Ambriz', 'Bula Atumba', 'Dande', 'Dembos', 'Nambuangongo', 'Pango Aluquém'],
};

export const PROVINCIAS = Object.keys(ANGOLA_GEO);

export function getMunicipios(provincia: string): string[] {
  return ANGOLA_GEO[provincia] ?? [];
}
