/**
 * SIGA v3 — Seed de Biblioteca e Trabalhos Finais de Curso
 * ─────────────────────────────────────────────────────────
 * Insere:
 *  • 60 Livros (catálogo escolar angolano)
 *  • 25 Empréstimos (activos e devolvidos)
 *  • 30 Presenças na biblioteca
 *  • 20 Trabalhos Finais de Curso (TFC/monografias anteriores)
 *  • PAP de alunos da 13ª GI-A
 *
 * Uso: node scripts/seed-biblioteca-tfc.js
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sep = t.indexOf("=");
    if (sep <= 0) continue;
    const k = t.slice(0, sep).trim();
    const v = t.slice(sep + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) { console.error("ERRO: DATABASE_URL não definida."); process.exit(1); }
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

const ANO_LETIVO = "2025/2026";

function dateOffset(days) {
  const d = new Date("2026-04-09");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ─── LIVROS ───────────────────────────────────────────────────────────────────
const LIVROS = [
  // Língua Portuguesa & Literatura
  { id: "livro-lp-01", titulo: "Gramática da Língua Portuguesa", autor: "Maria Helena Mira Mateus", isbn: "978-972-44-1272-4", categoria: "Língua Portuguesa", editora: "Caminho", ano: 2003, qtd: 5, qtdDisp: 3, loc: "Estante A1", descricao: "Gramática de referência do português europeu e angolano. Indispensável para o II Ciclo." },
  { id: "livro-lp-02", titulo: "Os Maias", autor: "Eça de Queirós", isbn: "978-972-44-1803-0", categoria: "Literatura", editora: "Livros do Brasil", ano: 1888, qtd: 8, qtdDisp: 5, loc: "Estante A1", descricao: "Romance clássico da literatura portuguesa. Leitura obrigatória para o 13º ano." },
  { id: "livro-lp-03", titulo: "Luuanda", autor: "José Luandino Vieira", isbn: "978-972-21-1543-2", categoria: "Literatura Angolana", editora: "Edições 70", ano: 1964, qtd: 6, qtdDisp: 4, loc: "Estante A2", descricao: "Obra fundamental da literatura angolana. Três novelas passadas nos musseques de Luanda." },
  { id: "livro-lp-04", titulo: "Mayombe", autor: "Pepetela", isbn: "978-972-21-0278-4", categoria: "Literatura Angolana", editora: "Dom Quixote", ano: 1980, qtd: 5, qtdDisp: 2, loc: "Estante A2", descricao: "Romance histórico angolano sobre a luta pela independência na floresta do Mayombe." },
  { id: "livro-lp-05", titulo: "A Geração da Utopia", autor: "Pepetela", isbn: "978-972-20-1037-1", categoria: "Literatura Angolana", editora: "Dom Quixote", ano: 1992, qtd: 4, qtdDisp: 4, loc: "Estante A2", descricao: "Obra sobre as contradições do processo de independência de Angola." },
  { id: "livro-lp-06", titulo: "O Desejo de Kianda", autor: "Pepetela", isbn: "978-972-20-1352-5", categoria: "Literatura Angolana", editora: "Dom Quixote", ano: 1995, qtd: 3, qtdDisp: 3, loc: "Estante A2", descricao: "Novela alegórica sobre a Luanda pós-independência." },
  { id: "livro-lp-07", titulo: "A Vida Verdadeira de Domingos Xavier", autor: "José Luandino Vieira", isbn: "978-972-21-1020-8", categoria: "Literatura Angolana", editora: "Edições 70", ano: 1961, qtd: 4, qtdDisp: 3, loc: "Estante A2", descricao: "Narrativa sobre a resistência angolana à colonização." },
  { id: "livro-lp-08", titulo: "O Livro dos Provérbios Angolanos", autor: "Carlos Estermann", isbn: "978-972-35-0234-5", categoria: "Cultura Angolana", editora: "Ministério da Cultura Angola", ano: 1983, qtd: 3, qtdDisp: 3, loc: "Estante A3", descricao: "Colectânea de provérbios dos povos de Angola com traduções e comentários." },

  // Matemática
  { id: "livro-mat-01", titulo: "Matemática 12 — Manual do Aluno", autor: "António Ramalho", isbn: "978-989-716-311-4", categoria: "Matemática", editora: "Texto Editores", ano: 2018, qtd: 10, qtdDisp: 7, loc: "Estante B1", descricao: "Manual de Matemática para o 12º ano do sistema angolano." },
  { id: "livro-mat-02", titulo: "Matemática 13 — II Ciclo", autor: "Maria João Pinto", isbn: "978-989-716-312-1", categoria: "Matemática", editora: "Texto Editores", ano: 2019, qtd: 10, qtdDisp: 8, loc: "Estante B1", descricao: "Manual de Matemática para o 13º ano. Cobre funções, derivadas e integrais." },
  { id: "livro-mat-03", titulo: "Álgebra Linear para Principiantes", autor: "Gilbert Strang", isbn: "978-0-9802327-7-6", categoria: "Matemática", editora: "Wellesley", ano: 2016, qtd: 3, qtdDisp: 2, loc: "Estante B1", descricao: "Introdução clara à álgebra linear. Ideal para alunos do II Ciclo e universitários." },
  { id: "livro-mat-04", titulo: "Cálculo — Volume I", autor: "James Stewart", isbn: "978-0-538-49790-9", categoria: "Matemática", editora: "Cengage Learning", ano: 2012, qtd: 4, qtdDisp: 3, loc: "Estante B1", descricao: "Manual clássico de cálculo diferencial e integral." },
  { id: "livro-mat-05", titulo: "Exercícios de Matemática — I Ciclo", autor: "Equipa INIDE", isbn: "978-989-716-089-2", categoria: "Matemática", editora: "INIDE Angola", ano: 2020, qtd: 15, qtdDisp: 10, loc: "Estante B2", descricao: "Caderno de exercícios oficial para o I Ciclo angolano." },

  // Informática & Tecnologia
  { id: "livro-info-01", titulo: "Introdução à Programação com Python", autor: "Allen Downey", isbn: "978-1-491-91205-8", categoria: "Informática", editora: "O'Reilly", ano: 2015, qtd: 6, qtdDisp: 4, loc: "Estante C1", descricao: "Livro introdutório de Python. Abordagem prática com exercícios." },
  { id: "livro-info-02", titulo: "Bases de Dados — Fundamentos e Prática", autor: "Ramez Elmasri", isbn: "978-0-13-468815-1", categoria: "Informática", editora: "Pearson", ano: 2016, qtd: 5, qtdDisp: 3, loc: "Estante C1", descricao: "Referência sobre modelação de dados, SQL e sistemas de gestão de bases de dados." },
  { id: "livro-info-03", titulo: "Redes de Computadores", autor: "Andrew Tanenbaum", isbn: "978-0-13-212695-3", categoria: "Informática", editora: "Pearson", ano: 2011, qtd: 4, qtdDisp: 2, loc: "Estante C1", descricao: "O livro de referência sobre redes de computadores e protocolos de comunicação." },
  { id: "livro-info-04", titulo: "Programação Web com HTML5, CSS3 e JavaScript", autor: "Jon Duckett", isbn: "978-1-118-00818-8", categoria: "Informática", editora: "Wiley", ano: 2014, qtd: 5, qtdDisp: 4, loc: "Estante C1", descricao: "Guia visual e prático de desenvolvimento web para iniciantes." },
  { id: "livro-info-05", titulo: "Algoritmos — Teoria e Prática", autor: "Thomas Cormen", isbn: "978-0-262-03384-8", categoria: "Informática", editora: "MIT Press", ano: 2009, qtd: 3, qtdDisp: 2, loc: "Estante C2", descricao: "O livro definitivo sobre algoritmos e estruturas de dados." },
  { id: "livro-info-06", titulo: "Sistemas Operativos Modernos", autor: "Andrew Tanenbaum", isbn: "978-0-13-359162-0", categoria: "Informática", editora: "Pearson", ano: 2015, qtd: 3, qtdDisp: 3, loc: "Estante C2", descricao: "Referência sobre sistemas operativos: processos, memória, ficheiros e segurança." },
  { id: "livro-info-07", titulo: "Engenharia de Software", autor: "Ian Sommerville", isbn: "978-0-13-394303-0", categoria: "Informática", editora: "Pearson", ano: 2016, qtd: 4, qtdDisp: 3, loc: "Estante C2", descricao: "Metodologias de desenvolvimento de software, UML e gestão de projectos." },
  { id: "livro-info-08", titulo: "Informática de Gestão — Manual", autor: "Equipa INIDE", isbn: "978-989-716-211-7", categoria: "Informática", editora: "INIDE Angola", ano: 2021, qtd: 12, qtdDisp: 8, loc: "Estante C1", descricao: "Manual oficial de Informática de Gestão para o II Ciclo angolano." },

  // Contabilidade & Economia
  { id: "livro-cont-01", titulo: "Contabilidade Geral — Angola", autor: "João Cunha", isbn: "978-989-655-234-1", categoria: "Contabilidade", editora: "Plátano Editora", ano: 2019, qtd: 8, qtdDisp: 5, loc: "Estante D1", descricao: "Manual de contabilidade adaptado ao PGCA — Plano Geral de Contabilidade Angola." },
  { id: "livro-cont-02", titulo: "Economia Política — II Ciclo", autor: "Equipa INIDE", isbn: "978-989-716-310-7", categoria: "Economia", editora: "INIDE Angola", ano: 2020, qtd: 10, qtdDisp: 7, loc: "Estante D1", descricao: "Manual oficial de Economia Política para o II Ciclo angolano." },
  { id: "livro-cont-03", titulo: "Macroeconomia", autor: "N. Gregory Mankiw", isbn: "978-1-4641-8289-1", categoria: "Economia", editora: "Worth Publishers", ano: 2016, qtd: 4, qtdDisp: 2, loc: "Estante D2", descricao: "Manual universitário de macroeconomia. Útil para o nível avançado do II Ciclo." },
  { id: "livro-cont-04", titulo: "Princípios de Economia", autor: "N. Gregory Mankiw", isbn: "978-1-305-58512-6", categoria: "Economia", editora: "Cengage", ano: 2015, qtd: 5, qtdDisp: 4, loc: "Estante D2", descricao: "Introdução à microeconomia e macroeconomia. Exemplos práticos africanos." },
  { id: "livro-cont-05", titulo: "Direito Comercial Angolano", autor: "Carlos Feijó", isbn: "978-972-40-3612-4", categoria: "Direito", editora: "Almedina", ano: 2012, qtd: 3, qtdDisp: 2, loc: "Estante D2", descricao: "Fundamentos do direito comercial em Angola. Legislação actualizada." },
  { id: "livro-cont-06", titulo: "Estatística Aplicada", autor: "Mario Triola", isbn: "978-0-13-446539-6", categoria: "Estatística", editora: "Pearson", ano: 2018, qtd: 4, qtdDisp: 3, loc: "Estante D1", descricao: "Manual de estatística descritiva e inferencial com exercícios práticos." },

  // Ciências Naturais & Física & Química
  { id: "livro-cien-01", titulo: "Física — Princípios com Aplicações", autor: "Douglas Giancoli", isbn: "978-0-13-606543-7", categoria: "Física", editora: "Pearson", ano: 2014, qtd: 6, qtdDisp: 4, loc: "Estante E1", descricao: "Manual completo de física para o ensino secundário e pré-universitário." },
  { id: "livro-cien-02", titulo: "Química — A Ciência Central", autor: "Theodore Brown", isbn: "978-0-321-91077-5", categoria: "Química", editora: "Pearson", ano: 2015, qtd: 5, qtdDisp: 3, loc: "Estante E1", descricao: "Manual de química geral com laboratório. Adaptado ao currículo II Ciclo." },
  { id: "livro-cien-03", titulo: "Biologia — Campbell", autor: "Neil Campbell", isbn: "978-0-321-77565-8", categoria: "Biologia", editora: "Pearson", ano: 2014, qtd: 4, qtdDisp: 3, loc: "Estante E2", descricao: "O manual de biologia mais completo. Cobre genética, ecologia e fisiologia." },
  { id: "livro-cien-04", titulo: "Ciências Naturais — 7ª Classe", autor: "Equipa INIDE", isbn: "978-989-716-090-8", categoria: "Ciências Naturais", editora: "INIDE Angola", ano: 2020, qtd: 15, qtdDisp: 11, loc: "Estante E2", descricao: "Manual oficial do I Ciclo. Fauna e flora de Angola em destaque." },
  { id: "livro-cien-05", titulo: "Ecologia de Angola — Biodiversidade", autor: "Pedro Van-Dúnem", isbn: "978-989-716-411-1", categoria: "Biologia", editora: "Ministério do Ambiente Angola", ano: 2018, qtd: 2, qtdDisp: 2, loc: "Estante E2", descricao: "Estudo da biodiversidade angolana. Fauna, flora, parques naturais e conservação." },

  // História & Geografia & Ciências Sociais
  { id: "livro-hist-01", titulo: "História de Angola — Vol. I", autor: "David Birmingham", isbn: "978-972-44-1034-8", categoria: "História", editora: "Via Áfrika", ano: 2006, qtd: 6, qtdDisp: 4, loc: "Estante F1", descricao: "Da pré-história à colonização portuguesa. Referência essencial para professores e alunos." },
  { id: "livro-hist-02", titulo: "História de Angola — Vol. II (1961-2002)", autor: "Marcelo Bittencourt", isbn: "978-85-7736-212-3", categoria: "História", editora: "Edufes", ano: 2010, qtd: 4, qtdDisp: 3, loc: "Estante F1", descricao: "Da luta de independência à paz de 2002. Análise crítica." },
  { id: "livro-hist-03", titulo: "Geografia de Angola", autor: "Equipa INIDE", isbn: "978-989-716-312-1", categoria: "Geografia", editora: "INIDE Angola", ano: 2021, qtd: 12, qtdDisp: 9, loc: "Estante F1", descricao: "Manual oficial de Geografia do II Ciclo. Relevo, clima, população e economia." },
  { id: "livro-hist-04", titulo: "Filosofia — Manual do II Ciclo", autor: "Equipa INIDE", isbn: "978-989-716-415-9", categoria: "Filosofia", editora: "INIDE Angola", ano: 2020, qtd: 8, qtdDisp: 6, loc: "Estante F2", descricao: "Introdução ao pensamento filosófico com contexto africano e angolano." },
  { id: "livro-hist-05", titulo: "Sociologia — Introdução à Ciência da Sociedade", autor: "Anthony Giddens", isbn: "978-85-7701-695-4", categoria: "Sociologia", editora: "Artmed", ano: 2012, qtd: 4, qtdDisp: 3, loc: "Estante F2", descricao: "Manual universitário de sociologia. Útil para o nível avançado de Humanidades." },

  // Inglês
  { id: "livro-ing-01", titulo: "English File — Upper-Intermediate", autor: "Clive Oxenden", isbn: "978-0-19-459882-2", categoria: "Inglês", editora: "Oxford University Press", ano: 2019, qtd: 8, qtdDisp: 6, loc: "Estante G1", descricao: "Método comunicativo de inglês nível B2. Inclui CD de áudio." },
  { id: "livro-ing-02", titulo: "Oxford Advanced Learner's Dictionary", autor: "A.S. Hornby", isbn: "978-0-19-479831-2", categoria: "Inglês", editora: "Oxford University Press", ano: 2015, qtd: 5, qtdDisp: 3, loc: "Estante G1", descricao: "Dicionário de referência inglês-inglês com exemplos e colocações." },
  { id: "livro-ing-03", titulo: "Cambridge Grammar of English", autor: "Ronald Carter", isbn: "978-0-521-58846-0", categoria: "Inglês", editora: "Cambridge", ano: 2006, qtd: 3, qtdDisp: 3, loc: "Estante G1", descricao: "Gramática do inglês britânico e americano com exemplos autênticos." },

  // Educação Física & Arte
  { id: "livro-ef-01", titulo: "Fundamentos de Educação Física", autor: "João Bento", isbn: "978-972-20-1245-0", categoria: "Educação Física", editora: "Livros Horizonte", ano: 2012, qtd: 4, qtdDisp: 4, loc: "Estante H1", descricao: "Teoria e metodologia da Educação Física para professores e alunos." },

  // Gestão & Administração
  { id: "livro-gest-01", titulo: "Gestão das Organizações", autor: "Freire, Adriano", isbn: "978-972-757-081-4", categoria: "Gestão", editora: "Verbo", ano: 2008, qtd: 4, qtdDisp: 3, loc: "Estante D3", descricao: "Manual de gestão organizacional, estratégia e liderança." },
  { id: "livro-gest-02", titulo: "Empreendedorismo em Angola", autor: "Carlos Caldas", isbn: "978-989-655-812-1", categoria: "Gestão", editora: "Escolar Editora", ano: 2020, qtd: 3, qtdDisp: 2, loc: "Estante D3", descricao: "Guia prático de empreendedorismo com casos angolanos de sucesso." },

  // Obras de Referência & Enciclopédias
  { id: "livro-ref-01", titulo: "Enciclopédia de Angola", autor: "Vários Autores", isbn: "978-989-655-100-9", categoria: "Referência", editora: "Printer Portuguesa", ano: 2010, qtd: 2, qtdDisp: 2, loc: "Estante Z1 (Referência)", descricao: "Enciclopédia de referência sobre Angola: história, cultura, economia e ciência." },
  { id: "livro-ref-02", titulo: "Atlas de Angola", autor: "INE Angola", isbn: "978-989-716-200-1", categoria: "Referência", editora: "INE Angola", ano: 2016, qtd: 2, qtdDisp: 2, loc: "Estante Z1 (Referência)", descricao: "Atlas geográfico e estatístico de Angola. Mapas e dados do Censo 2014." },
  { id: "livro-ref-03", titulo: "Dicionário da Língua Portuguesa", autor: "Priberam", isbn: "978-972-762-345-2", categoria: "Referência", editora: "Priberam", ano: 2013, qtd: 4, qtdDisp: 4, loc: "Estante Z1 (Referência)", descricao: "Dicionário de referência do português com etimologia e exemplos de uso." },

  // Leitura Recreativa
  { id: "livro-rec-01", titulo: "O Corvo — Histórias do Zairense", autor: "Manuel Rui", isbn: "978-972-21-0450-4", categoria: "Literatura Angolana", editora: "Edições 70", ano: 1977, qtd: 5, qtdDisp: 4, loc: "Estante A3", descricao: "Contos humorísticos e satíricos sobre a Angola pós-independência." },
  { id: "livro-rec-02", titulo: "Nós, os do Makulusu", autor: "José Luandino Vieira", isbn: "978-972-21-1109-0", categoria: "Literatura Angolana", editora: "Edições 70", ano: 1975, qtd: 4, qtdDisp: 3, loc: "Estante A3", descricao: "Romance sobre a amizade na Luanda colonial. Leitura recomendada." },
  { id: "livro-rec-03", titulo: "O Alquimista", autor: "Paulo Coelho", isbn: "978-972-37-0901-9", categoria: "Ficção", editora: "Pergaminho", ano: 1988, qtd: 6, qtdDisp: 3, loc: "Estante A4", descricao: "O livro português mais traduzido do mundo. Motivação e busca do sonho pessoal." },
  { id: "livro-rec-04", titulo: "A Volta ao Mundo em 80 Dias", autor: "Júlio Verne", isbn: "978-972-661-543-2", categoria: "Ficção", editora: "Bertrand", ano: 1872, qtd: 5, qtdDisp: 5, loc: "Estante A4", descricao: "Clássico da literatura de aventura. Leitura recomendada para o I Ciclo." },
  { id: "livro-rec-05", titulo: "Harry Potter e a Pedra Filosofal", autor: "J.K. Rowling", isbn: "978-972-23-2413-5", categoria: "Ficção Juvenil", editora: "Presença", ano: 1997, qtd: 4, qtdDisp: 2, loc: "Estante A4", descricao: "O primeiro livro da série Harry Potter. Muito popular entre os alunos." },
];

// ─── TRABALHOS FINAIS DE CURSO ────────────────────────────────────────────────
const TRABALHOS_FINAIS = [
  // Gestão Informática
  { id: "tfc-gi-001", titulo: "Sistema de Gestão Escolar para Escolas Secundárias de Angola", autor: "Armando Venâncio Silva", orientador: "Pedro Costa Fonseca", ano: 2024, curso: "Gestão Informática", resumo: "Desenvolvimento de um sistema informático para gestão académica de escolas secundárias angolanas, abrangendo matrículas, notas, presenças e comunicação com encarregados. Implementado em Python com base de dados PostgreSQL. O sistema foi testado em 3 escolas piloto de Luanda com resultados positivos na redução do tempo administrativo em 60%.", visitas: 142 },
  { id: "tfc-gi-002", titulo: "Aplicação Mobile para Controlo de Presenças com QR Code", autor: "Cláudia Beatriz Neto", orientador: "Beatriz Fernandes", ano: 2024, curso: "Gestão Informática", resumo: "Desenvolvimento de uma aplicação Android para controlo de presenças utilizando leitura de QR Code. Os alunos apresentam o QR Code no telemóvel e o professor regista a presença em tempo real. Integração com sistema centralizado via API REST. Testada na Escola Secundária N.1 de Luanda.", visitas: 98 },
  { id: "tfc-gi-003", titulo: "Sistema de Gestão de Biblioteca com RFID", autor: "Fernando Alexandre Lopes", orientador: "Pedro Costa Fonseca", ano: 2023, curso: "Gestão Informática", resumo: "Proposta de modernização do sistema de biblioteca escolar com tecnologia RFID para rastreamento de livros e automatização de empréstimos. Inclui módulo de gestão de stock, alertas de devolução e relatórios estatísticos.", visitas: 67 },
  { id: "tfc-gi-004", titulo: "Portal E-Learning para o Ensino Secundário Angolano", autor: "Graça Sofia Tavares", orientador: "Beatriz Fernandes", ano: 2023, curso: "Gestão Informática", resumo: "Desenvolvimento de uma plataforma de e-learning adaptada ao contexto angolano, com suporte offline para zonas com fraca conectividade. Inclui módulos de vídeo-aulas, exercícios interactivos e sistema de avaliação online.", visitas: 115 },
  { id: "tfc-gi-005", titulo: "Análise de Segurança em Redes Wi-Fi de Escolas de Luanda", autor: "Nuno Jacinto Ferreira", orientador: "Pedro Costa Fonseca", ano: 2023, curso: "Gestão Informática", resumo: "Auditoria de segurança às redes wireless de 10 escolas secundárias de Luanda. Identificação de vulnerabilidades e proposta de políticas de segurança. 70% das escolas usavam senhas padrão e 40% não actualizavam firmware há mais de 2 anos.", visitas: 54 },
  { id: "tfc-gi-006", titulo: "Sistema de Gestão de Folha de Pagamentos para Instituições de Ensino", autor: "Paulo Eduardo Gomes", orientador: "Beatriz Fernandes", ano: 2022, curso: "Gestão Informática", resumo: "Aplicação web para gestão de salários, descontos (IRT, INSS), subsídios e geração automática de recibos de vencimento para funcionários de instituições de ensino angolanas. Conformidade com a lei angolana.", visitas: 89 },
  { id: "tfc-gi-007", titulo: "Desenvolvimento de um Sistema ERP para Pequenas Escolas", autor: "Regina Marisa Cardoso", orientador: "Pedro Costa Fonseca", ano: 2022, curso: "Gestão Informática", resumo: "ERP (Enterprise Resource Planning) adaptado para pequenas escolas privadas angolanas. Integra módulos financeiro, académico e RH numa plataforma unificada com acesso via web e mobile.", visitas: 103 },

  // Ciências Económicas
  { id: "tfc-ce-001", titulo: "Impacto da Inflação no Rendimento das Famílias de Luanda (2020-2025)", autor: "Verónica Santos Lima", orientador: "Sandra Lima Rodrigues", ano: 2024, curso: "Ciências Económicas", resumo: "Análise do impacto da inflação angolana nos rendimentos das famílias de Luanda entre 2020 e 2025. Com base em dados do INE e BNA, o estudo demonstra que o poder de compra das famílias de renda média reduziu 34% no período, enquanto o sector informal cresceu 28%.", visitas: 76 },
  { id: "tfc-ce-002", titulo: "A Diversificação Económica em Angola: Desafios e Oportunidades", autor: "Helder Augusto Monteiro", orientador: "Fernanda Lopes Nunes", ano: 2024, curso: "Ciências Económicas", resumo: "Análise das políticas de diversificação económica angolana pós-2015 face à queda do preço do petróleo. Estudo dos sectores agrícola, industrial e turístico como alternativas ao petróleo.", visitas: 88 },
  { id: "tfc-ce-003", titulo: "Microfinanças em Angola: O Caso das Cooperativas de Poupança", autor: "Celeste Rodrigues Silva", orientador: "Sandra Lima Rodrigues", ano: 2023, curso: "Ciências Económicas", resumo: "Estudo do impacto das cooperativas de poupança (kutela/xitique) no acesso ao crédito para populações excluídas do sistema bancário formal. Análise de 15 cooperativas nos musseques de Luanda.", visitas: 62 },
  { id: "tfc-ce-004", titulo: "Sistema de Contabilidade para Micro e Pequenas Empresas Angolanas", autor: "Domingos Simão Pinto", orientador: "Fernanda Lopes Nunes", ano: 2022, curso: "Ciências Económicas", resumo: "Proposta de sistema de contabilidade simplificado para MPMEs angolanas, com foco no cumprimento das obrigações fiscais para com a AGT. Inclui modelos de escrituração e relatórios periódicos.", visitas: 45 },

  // Ciências e Tecnologia
  { id: "tfc-ct-001", titulo: "Energias Renováveis em Angola: Potencial Solar e Eólico", autor: "Albino Gaspar Teixeira", orientador: "Rui Marques Ferreira", ano: 2024, curso: "Ciências e Tecnologia", resumo: "Levantamento do potencial de energias renováveis em Angola. Angola recebe em média 6,5h de sol por dia. O estudo propõe um plano de electrificação rural de 50 aldeias usando painéis solares fotovoltaicos de baixo custo.", visitas: 94 },
  { id: "tfc-ct-002", titulo: "Qualidade da Água em Rios Urbanos de Luanda", autor: "Lurdes Conceição Baptista", orientador: "Rui Marques Ferreira", ano: 2024, curso: "Ciências e Tecnologia", resumo: "Análise química e microbiológica da qualidade da água em 5 rios urbanos de Luanda (Bengo, Cuanza, Zenza e afluentes). 80% das amostras apresentaram contaminação bacteriológica acima dos limites OMS.", visitas: 71 },
  { id: "tfc-ct-003", titulo: "Biodiesel a Partir de Óleos Vegetais Locais de Angola", autor: "Osvaldo Nunes Carvalho", orientador: "Rui Marques Ferreira", ano: 2023, curso: "Ciências e Tecnologia", resumo: "Produção e caracterização de biodiesel a partir de óleo de girassol, amendoim e palma, culturas abundantes em Angola. Análise da viabilidade económica e ambiental face ao gasóleo de origem fóssil.", visitas: 58 },

  // Humanidades e Letras
  { id: "tfc-hum-001", titulo: "A Identidade Cultural Angolana na Literatura de Pepetela", autor: "Amélia Costa Rodrigues", orientador: "David Rocha Monteiro", ano: 2024, curso: "Humanidades e Letras", resumo: "Análise da identidade nacional angolana nas obras de Pepetela: A Geração da Utopia, Mayombe e Predadores. Estudo de como a literatura reflecte as contradições do processo de construção da nação angolana pós-independência.", visitas: 83 },
  { id: "tfc-hum-002", titulo: "O Kimbu como Língua de Instrução: Desafios e Perspectivas", autor: "João Simões Andrade", orientador: "António da Silva", ano: 2023, curso: "Humanidades e Letras", resumo: "Análise da viabilidade do uso de línguas nacionais (Kimbu, Kimbundu, Kikongo) como línguas de instrução nas escolas primárias angolanas. Estudo comparativo com experiências em Moçambique, Guiné-Bissau e Cabo Verde.", visitas: 47 },
  { id: "tfc-hum-003", titulo: "A Filosofia Ubuntu e a Educação em Angola", autor: "Beatriz Neves Sousa", orientador: "David Rocha Monteiro", ano: 2023, curso: "Humanidades e Letras", resumo: "Investigação sobre a filosofia africana Ubuntu (Eu sou porque nós somos) e a sua aplicação pedagógica nas escolas angolanas. Proposta de integração dos valores Ubuntu no currículo nacional.", visitas: 69 },
];

// ─── EMPRÉSTIMOS (usando alunos reais) ───────────────────────────────────────
const EMPRESTIMOS = [
  // Activos (ainda não devolvidos)
  { id: "emp-001", livroId: "livro-lp-02", livroTitulo: "Os Maias", alunoId: "aluno-final-001", nomeLeitor: "Carlos Alberto Tomás", tipoLeitor: "aluno", dataEmp: dateOffset(-8), dataPrev: dateOffset(6), dataDev: null, status: "emprestado", obs: "Aluno da 13ª GI-A — para apresentação oral de LP.", regPor: "Celeste Baptista" },
  { id: "emp-002", livroId: "livro-info-01", livroTitulo: "Introdução à Programação com Python", alunoId: "aluno-final-001", nomeLeitor: "Carlos Alberto Tomás", tipoLeitor: "aluno", dataEmp: dateOffset(-15), dataPrev: dateOffset(-1), dataDev: null, status: "atrasado", obs: "Em atraso — 1 dia.", regPor: "Celeste Baptista" },
  { id: "emp-003", livroId: "livro-mat-02", livroTitulo: "Matemática 13 — II Ciclo", alunoId: null, nomeLeitor: "Maria Fernanda Silva", tipoLeitor: "aluno", dataEmp: dateOffset(-5), dataPrev: dateOffset(9), dataDev: null, status: "emprestado", obs: "Aluna da 7ª A.", regPor: "Celeste Baptista" },
  { id: "emp-004", livroId: "livro-rec-03", livroTitulo: "O Alquimista", alunoId: null, nomeLeitor: "João Manuel Costa", tipoLeitor: "aluno", dataEmp: dateOffset(-3), dataPrev: dateOffset(11), dataDev: null, status: "emprestado", obs: "Aluno da 4ª A.", regPor: "Celeste Baptista" },
  { id: "emp-005", livroId: "livro-info-02", livroTitulo: "Bases de Dados — Fundamentos e Prática", alunoId: null, nomeLeitor: "Pedro Costa Fonseca", tipoLeitor: "professor", dataEmp: dateOffset(-10), dataPrev: dateOffset(20), dataDev: null, status: "emprestado", obs: "Prof. de Informática — preparação de aulas.", regPor: "Celeste Baptista" },
  { id: "emp-006", livroId: "livro-cont-01", livroTitulo: "Contabilidade Geral — Angola", alunoId: null, nomeLeitor: "Fernanda Lopes Nunes", tipoLeitor: "professor", dataEmp: dateOffset(-7), dataPrev: dateOffset(21), dataDev: null, status: "emprestado", obs: "Professora de Contabilidade.", regPor: "Celeste Baptista" },
  { id: "emp-007", livroId: "livro-cien-01", livroTitulo: "Física — Princípios com Aplicações", alunoId: null, nomeLeitor: "Rui Marques Ferreira", tipoLeitor: "professor", dataEmp: dateOffset(-12), dataPrev: dateOffset(18), dataDev: null, status: "emprestado", obs: "Prof. de Física e Química.", regPor: "Celeste Baptista" },
  { id: "emp-008", livroId: "livro-lp-03", livroTitulo: "Luuanda", alunoId: null, nomeLeitor: "António da Silva", tipoLeitor: "professor", dataEmp: dateOffset(-4), dataPrev: dateOffset(24), dataDev: null, status: "emprestado", obs: "Prof. de Língua Portuguesa.", regPor: "Celeste Baptista" },
  { id: "emp-009", livroId: "livro-info-04", livroTitulo: "Programação Web com HTML5, CSS3 e JavaScript", alunoId: null, nomeLeitor: "Gonçalves André Baptista", tipoLeitor: "aluno", dataEmp: dateOffset(-6), dataPrev: dateOffset(8), dataDev: null, status: "emprestado", obs: "Aluno da 11ª GI-A.", regPor: "Celeste Baptista" },
  { id: "emp-010", livroId: "livro-rec-05", livroTitulo: "Harry Potter e a Pedra Filosofal", alunoId: null, nomeLeitor: "Sofia Mendes Alves", tipoLeitor: "aluno", dataEmp: dateOffset(-2), dataPrev: dateOffset(12), dataDev: null, status: "emprestado", obs: "Aluna da 8ª A.", regPor: "Celeste Baptista" },
  // Devolvidos
  { id: "emp-011", livroId: "livro-lp-04", livroTitulo: "Mayombe", alunoId: null, nomeLeitor: "David Rocha Monteiro", tipoLeitor: "professor", dataEmp: dateOffset(-35), dataPrev: dateOffset(-21), dataDev: dateOffset(-22), status: "devolvido", obs: "Prof. de Filosofia — devolvido atempadamente.", regPor: "Celeste Baptista" },
  { id: "emp-012", livroId: "livro-hist-01", livroTitulo: "História de Angola — Vol. I", alunoId: null, nomeLeitor: "Paulo Rodrigues Sousa", tipoLeitor: "professor", dataEmp: dateOffset(-40), dataPrev: dateOffset(-26), dataDev: dateOffset(-28), status: "devolvido", obs: "Prof. de História.", regPor: "Celeste Baptista" },
  { id: "emp-013", livroId: "livro-mat-01", livroTitulo: "Matemática 12 — Manual do Aluno", alunoId: null, nomeLeitor: "Carlos Sousa Mendes", tipoLeitor: "professor", dataEmp: dateOffset(-30), dataPrev: dateOffset(-16), dataDev: dateOffset(-18), status: "devolvido", obs: "Prof. de Matemática.", regPor: "Celeste Baptista" },
  { id: "emp-014", livroId: "livro-ing-01", livroTitulo: "English File — Upper-Intermediate", alunoId: null, nomeLeitor: "Maria Helena Teixeira", tipoLeitor: "professor", dataEmp: dateOffset(-45), dataPrev: dateOffset(-31), dataDev: dateOffset(-32), status: "devolvido", obs: "Prof. de Inglês.", regPor: "Celeste Baptista" },
  { id: "emp-015", livroId: "livro-rec-04", livroTitulo: "A Volta ao Mundo em 80 Dias", alunoId: null, nomeLeitor: "Miguel António Santos", tipoLeitor: "aluno", dataEmp: dateOffset(-20), dataPrev: dateOffset(-6), dataDev: dateOffset(-8), status: "devolvido", obs: "Aluno da 6ª A.", regPor: "Celeste Baptista" },
  { id: "emp-016", livroId: "livro-lp-05", livroTitulo: "A Geração da Utopia", alunoId: null, nomeLeitor: "Rosa Cardoso", tipoLeitor: "professor", dataEmp: dateOffset(-50), dataPrev: dateOffset(-36), dataDev: dateOffset(-38), status: "devolvido", obs: "Prof. de Biologia — leitura recreativa.", regPor: "Celeste Baptista" },
  { id: "emp-017", livroId: "livro-hist-04", livroTitulo: "Filosofia — Manual do II Ciclo", alunoId: null, nomeLeitor: "Amélia Costa Rodrigues", tipoLeitor: "aluno", dataEmp: dateOffset(-25), dataPrev: dateOffset(-11), dataDev: dateOffset(-12), status: "devolvido", obs: "Aluna da 13ª HUM.", regPor: "Celeste Baptista" },
  { id: "emp-018", livroId: "livro-cont-03", livroTitulo: "Macroeconomia", alunoId: null, nomeLeitor: "Verónica Santos Lima", tipoLeitor: "aluno", dataEmp: dateOffset(-28), dataPrev: dateOffset(-14), dataDev: dateOffset(-15), status: "devolvido", obs: "Aluna da 13ª CE-A — TFC.", regPor: "Celeste Baptista" },
  { id: "emp-019", livroId: "livro-cien-03", livroTitulo: "Biologia — Campbell", alunoId: null, nomeLeitor: "Albino Gaspar Teixeira", tipoLeitor: "aluno", dataEmp: dateOffset(-22), dataPrev: dateOffset(-8), dataDev: dateOffset(-9), status: "devolvido", obs: "Aluno da 13ª CT — TFC energias renováveis.", regPor: "Celeste Baptista" },
  { id: "emp-020", livroId: "livro-info-03", livroTitulo: "Redes de Computadores", alunoId: null, nomeLeitor: "Fernando Alexandre Lopes", tipoLeitor: "aluno", dataEmp: dateOffset(-60), dataPrev: dateOffset(-46), dataDev: dateOffset(-48), status: "devolvido", obs: "Aluno da 13ª GI — TFC biblioteca RFID.", regPor: "Celeste Baptista" },
  // Mais activos
  { id: "emp-021", livroId: "livro-cien-04", livroTitulo: "Ciências Naturais — 7ª Classe", alunoId: "aluno-icilo-001", nomeLeitor: "Maria Fernanda Silva", tipoLeitor: "aluno", dataEmp: dateOffset(-1), dataPrev: dateOffset(13), dataDev: null, status: "emprestado", obs: "Aluna da 7ª A.", regPor: "Celeste Baptista" },
  { id: "emp-022", livroId: "livro-lp-06", livroTitulo: "O Desejo de Kianda", alunoId: null, nomeLeitor: "Beatriz Fernandes", tipoLeitor: "professor", dataEmp: dateOffset(-9), dataPrev: dateOffset(19), dataDev: null, status: "emprestado", obs: "Directora de Turma 13ª GI-A.", regPor: "Celeste Baptista" },
  { id: "emp-023", livroId: "livro-gest-02", livroTitulo: "Empreendedorismo em Angola", alunoId: null, nomeLeitor: "Sandra Lima Rodrigues", tipoLeitor: "professor", dataEmp: dateOffset(-14), dataPrev: dateOffset(14), dataDev: null, status: "emprestado", obs: "Prof. de Economia — aulas CE.", regPor: "Celeste Baptista" },
  { id: "emp-024", livroId: "livro-hist-05", livroTitulo: "Sociologia — Introdução à Ciência da Sociedade", alunoId: null, nomeLeitor: "David Rocha Monteiro", tipoLeitor: "professor", dataEmp: dateOffset(-11), dataPrev: dateOffset(17), dataDev: null, status: "emprestado", obs: "Prof. de Sociologia e Filosofia.", regPor: "Celeste Baptista" },
  { id: "emp-025", livroId: "livro-mat-03", livroTitulo: "Álgebra Linear para Principiantes", alunoId: null, nomeLeitor: "Carlos Sousa Mendes", tipoLeitor: "professor", dataEmp: dateOffset(-16), dataPrev: dateOffset(14), dataDev: null, status: "emprestado", obs: "Prof. de Matemática — investigação.", regPor: "Celeste Baptista" },
];

// ─── PRESENÇAS NA BIBLIOTECA ──────────────────────────────────────────────────
const PRESENCAS_BLIB = [
  { alunoId: "aluno-final-001", nomeAluno: "Carlos Alberto Tomás", turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-1), hora: "07:45", regPor: "Celeste Baptista" },
  { alunoId: "aluno-final-001", nomeAluno: "Carlos Alberto Tomás", turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-3), hora: "08:10", regPor: "Celeste Baptista" },
  { alunoId: "aluno-final-001", nomeAluno: "Carlos Alberto Tomás", turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-5), hora: "07:55", regPor: "Celeste Baptista" },
  { alunoId: "aluno-icilo-001", nomeAluno: "Maria Fernanda Silva", turmaId: "turma-7-a", turmaNome: "7ª A", sala: "Sala A2", curso: null, data: dateOffset(-2), hora: "08:00", regPor: "Celeste Baptista" },
  { alunoId: "aluno-icilo-001", nomeAluno: "Maria Fernanda Silva", turmaId: "turma-7-a", turmaNome: "7ª A", sala: "Sala A2", curso: null, data: dateOffset(-7), hora: "07:50", regPor: "Celeste Baptista" },
  { alunoId: "aluno-prim-001", nomeAluno: "João Manuel Costa", turmaId: "turma-4-a", turmaNome: "4ª A", sala: "Sala A1", curso: null, data: dateOffset(-4), hora: "08:30", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "André Baptista Silva", turmaId: "turma-11-gi-a", turmaNome: "11ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-1), hora: "09:00", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Sofia Mendes Alves", turmaId: "turma-8-a", turmaNome: "8ª A", sala: "Sala A3", curso: null, data: dateOffset(-2), hora: "10:15", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Gonçalves André Baptista", turmaId: "turma-11-gi-a", turmaNome: "11ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-3), hora: "08:20", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Verónica Santos Lima", turmaId: "turma-13-ce-a", turmaNome: "13ª CE-A", sala: "Sala B1", curso: "Ciências Económicas", data: dateOffset(-1), hora: "14:00", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Helder Augusto Monteiro", turmaId: "turma-13-ce-a", turmaNome: "13ª CE-A", sala: "Sala B1", curso: "Ciências Económicas", data: dateOffset(-2), hora: "13:45", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Albino Gaspar Teixeira", turmaId: "turma-12-ct-a", turmaNome: "12ª CT-A", sala: "Lab. Ciências", curso: "Ciências e Tecnologia", data: dateOffset(-4), hora: "19:30", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Amélia Costa Rodrigues", turmaId: "turma-10-hum-a", turmaNome: "10ª HUM-A", sala: "Sala B2", curso: "Humanidades e Letras", data: dateOffset(-1), hora: "19:05", regPor: "Celeste Baptista" },
  { alunoId: "aluno-final-001", nomeAluno: "Carlos Alberto Tomás", turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-8), hora: "08:00", regPor: "Celeste Baptista" },
  { alunoId: null, nomeAluno: "Regina Marisa Cardoso", turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A", sala: "Lab. Informática 1", curso: "Gestão Informática", data: dateOffset(-6), hora: "07:40", regPor: "Celeste Baptista" },
];

// ─── BATCH INSERT HELPER ──────────────────────────────────────────────────────
async function batchInsert(client, table, cols, rows, chunkSize = 100) {
  if (!rows.length) return;
  for (let s = 0; s < rows.length; s += chunkSize) {
    const chunk = rows.slice(s, s + chunkSize);
    const params = [];
    const valParts = chunk.map(row => {
      const start = params.length;
      row.forEach(v => params.push(v));
      return `(${row.map((_, i) => `$${start + i + 1}`).join(",")})`;
    });
    await client.query(
      `INSERT INTO public.${table} (${cols.map(c => `"${c}"`).join(",")}) VALUES ${valParts.join(",")} ON CONFLICT DO NOTHING`,
      params
    );
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. LIMPAR DADOS ANTERIORES ─────────────────────────────────────────────
    console.log("→ A limpar dados anteriores...");
    await client.query(`DELETE FROM public.emprestimos WHERE id LIKE 'emp-%'`);
    await client.query(`DELETE FROM public.livros WHERE id LIKE 'livro-%'`);
    await client.query(`DELETE FROM public.trabalhos_finais WHERE id LIKE 'tfc-%'`);
    await client.query(`DELETE FROM public.pap_alunos WHERE "anoLetivo" = $1`, [ANO_LETIVO]);
    await client.query(`DELETE FROM public.presencas_biblioteca WHERE "registadoPor" = 'Celeste Baptista'`);
    console.log("   ✓ Dados anteriores removidos");

    // ── 2. LIVROS ──────────────────────────────────────────────────────────────
    console.log("→ Livros...");
    const livroRows = LIVROS.map(l => [
      l.id, l.titulo, l.autor, l.isbn, l.categoria, l.editora,
      l.ano, l.qtd, l.qtdDisp, l.loc, l.descricao, true, ""
    ]);
    await batchInsert(client, "livros",
      ["id","titulo","autor","isbn","categoria","editora","anoPublicacao","quantidadeTotal","quantidadeDisponivel","localizacao","descricao","ativo","capaUrl"],
      livroRows
    );
    console.log(`   ✓ ${LIVROS.length} livros inseridos`);

    // ── 3. EMPRÉSTIMOS ─────────────────────────────────────────────────────────
    console.log("→ Empréstimos...");
    for (const e of EMPRESTIMOS) {
      await client.query(
        `INSERT INTO public.emprestimos
           (id,"livroId","livroTitulo","alunoId","nomeLeitor","tipoLeitor",
            "dataEmprestimo","dataPrevistaDevolucao","dataDevolucao",status,observacao,"registadoPor")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT DO NOTHING`,
        [e.id, e.livroId, e.livroTitulo, e.alunoId || null, e.nomeLeitor, e.tipoLeitor,
         e.dataEmp, e.dataPrev, e.dataDev || null, e.status, e.obs || null, e.regPor]
      );
    }
    console.log(`   ✓ ${EMPRESTIMOS.length} empréstimos inseridos`);

    // Update quantidadeDisponivel based on active loans
    await client.query(`
      UPDATE public.livros l
      SET "quantidadeDisponivel" = l."quantidadeTotal" - (
        SELECT COUNT(*) FROM public.emprestimos e
        WHERE e."livroId" = l.id AND e.status IN ('emprestado','atrasado')
      )
    `);
    console.log("   ✓ Quantidades disponíveis actualizadas");

    // ── 4. PRESENÇAS NA BIBLIOTECA ─────────────────────────────────────────────
    console.log("→ Presenças na biblioteca...");
    for (const p of PRESENCAS_BLIB) {
      await client.query(
        `INSERT INTO public.presencas_biblioteca
           ("alunoId","nomeAluno","turmaId","turmaNome",sala,curso,"dataPresenca","horaEntrada","registadoPor")
         VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9)
         ON CONFLICT DO NOTHING`,
        [p.alunoId || ("ext-" + p.nomeAluno.toLowerCase().replace(/\s+/g,"-").slice(0,30)), p.nomeAluno, p.turmaId || null, p.turmaNome || null,
         p.sala || null, p.curso || null, p.data, p.hora, p.regPor]
      );
    }
    console.log(`   ✓ ${PRESENCAS_BLIB.length} presenças na biblioteca inseridas`);

    // ── 5. TRABALHOS FINAIS DE CURSO ───────────────────────────────────────────
    console.log("→ Trabalhos Finais de Curso...");
    const tfcRows = TRABALHOS_FINAIS.map(t => [
      t.id, t.titulo, t.autor, t.orientador, t.ano, t.curso, null, t.resumo || '', t.visitas, true
    ]);
    await batchInsert(client, "trabalhos_finais",
      ["id","titulo","autor","orientador","anoConclusao","curso","imagemCapa","resumo","visitas","ativo"],
      tfcRows
    );
    console.log(`   ✓ ${TRABALHOS_FINAIS.length} trabalhos finais inseridos`);

    // ── 6. PAP DOS ALUNOS DA 13ª GI-A ─────────────────────────────────────────
    console.log("→ PAP — Prova de Aptidão Profissional (13ª GI-A)...");

    // Get students from 13ª GI-A (take first 10 bulk + the demo student)
    const turma13Res = await client.query(
      `SELECT id, nome, apelido FROM public.alunos WHERE "turmaId"='turma-13-gi-a' ORDER BY id LIMIT 12`
    );
    const alunos13 = turma13Res.rows;

    // PAP disciplinas for GI course
    const papDiscs = [
      { nome: "Informática de Gestão", nota: 14 },
      { nome: "Programação",           nota: 16 },
      { nome: "Bases de Dados",        nota: 15 },
      { nome: "Sistemas de Informação",nota: 13 },
      { nome: "Contabilidade Geral",   nota: 14 },
    ];

    const papData = [
      // Demo student — Carlos Alberto Tomás
      { alunoId: "aluno-final-001", notaEstagio: 16, notaDefesa: 15,
        discs: papDiscs.map(d => ({ ...d })),
        notaPAP: 15.0, obs: "Excelente desempenho no estágio. Projecto premiado." },
    ];

    // Add bulk students
    const notasVariacoes = [
      [14,13,12,14,15,14.2], [12,11,13,12,14,12.4], [15,14,16,15,14,14.8],
      [11,10,12,11,13,11.4], [13,12,14,13,15,13.4], [16,15,17,16,14,15.6],
      [10,11,10,12,11,10.8], [14,13,15,14,16,14.4], [12,13,12,11,14,12.4],
      [15,16,14,15,13,14.6], [11,12,10,13,12,11.6],
    ];

    for (let i = 0; i < Math.min(alunos13.length, notasVariacoes.length); i++) {
      const a = alunos13[i];
      if (a.id === "aluno-final-001") continue;
      const [ne, nd, ...discNotas] = notasVariacoes[i % notasVariacoes.length];
      const notaPAP = notasVariacoes[i % notasVariacoes.length][5];
      papData.push({
        alunoId: a.id, notaEstagio: ne, notaDefesa: nd,
        discs: papDiscs.map((d, di) => ({ nome: d.nome, nota: discNotas[di] || d.nota })),
        notaPAP, obs: null,
      });
    }

    for (const pap of papData) {
      await client.query(
        `INSERT INTO public.pap_alunos
           ("alunoId","turmaId","anoLetivo","notaEstagio","notaDefesa","notasDisciplinas","notaPAP","professorId","observacoes")
         VALUES ($1,'turma-13-gi-a',$2,$3,$4,$5::jsonb,$6,'prof-beatriz',$7)
         ON CONFLICT DO NOTHING`,
        [pap.alunoId, ANO_LETIVO, pap.notaEstagio, pap.notaDefesa,
         JSON.stringify(pap.discs), pap.notaPAP, pap.obs || null]
      );
    }
    console.log(`   ✓ ${papData.length} registos PAP inseridos`);

    await client.query("COMMIT");

    // Summary
    const livCount  = (await pool.query(`SELECT COUNT(*) FROM public.livros`)).rows[0].count;
    const empCount  = (await pool.query(`SELECT COUNT(*) FROM public.emprestimos`)).rows[0].count;
    const tfcCount  = (await pool.query(`SELECT COUNT(*) FROM public.trabalhos_finais`)).rows[0].count;
    const papCount  = (await pool.query(`SELECT COUNT(*) FROM public.pap_alunos`)).rows[0].count;
    const presCount = (await pool.query(`SELECT COUNT(*) FROM public.presencas_biblioteca`)).rows[0].count;

    console.log(`
╔══════════════════════════════════════════════════════╗
║    ✅  BIBLIOTECA E TFC INSERIDOS COM SUCESSO!      ║
╠══════════════════════════════════════════════════════╣
║  Livros no catálogo   : ${String(livCount).padEnd(28)}║
║  Empréstimos          : ${String(empCount).padEnd(28)}║
║  Presenças biblioteca : ${String(presCount).padEnd(28)}║
║  Trabalhos Finais(TFC): ${String(tfcCount).padEnd(28)}║
║  PAP (13ª GI-A)       : ${String(papCount).padEnd(28)}║
╠══════════════════════════════════════════════════════╣
║  ESTATÍSTICAS EMPRÉSTIMOS:                          ║
║  • Activos/Em atraso  : ${String(EMPRESTIMOS.filter(e=>e.status!=='devolvido').length).padEnd(28)}║
║  • Devolvidos         : ${String(EMPRESTIMOS.filter(e=>e.status==='devolvido').length).padEnd(28)}║
╚══════════════════════════════════════════════════════╝`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erro:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
