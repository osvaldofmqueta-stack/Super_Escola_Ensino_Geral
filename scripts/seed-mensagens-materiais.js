/**
 * SIGA v3 — Seed de Mensagens e Materiais
 * ─────────────────────────────────────────
 * Insere:
 *  • Mensagens de turma (professor → turma)
 *  • Mensagens privadas entre professores e secretaria
 *  • Materiais didácticos (professores → turmas)
 *
 * Uso: node scripts/seed-mensagens-materiais.js
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

// ─── DADOS BASE ───────────────────────────────────────────────────────────────
const ANO_LETIVO = "2025/2026";

// Professores remetentes (id, utilizadorId correspondente)
const PROFS = [
  { id: "prof-antonio",  utilId: "util-prof-silva",   nome: "António da Silva" },
  { id: "prof-beatriz",  utilId: "util-prof-beatriz",  nome: "Beatriz Fernandes" },
  { id: "prof-carlos",   utilId: null,                 nome: "Carlos Sousa Mendes" },
  { id: "prof-pedro",    utilId: null,                 nome: "Pedro Costa Fonseca" },
  { id: "prof-fernanda", utilId: null,                 nome: "Fernanda Lopes Nunes" },
  { id: "prof-maria-h",  utilId: null,                 nome: "Maria Helena Teixeira" },
  { id: "prof-rosa",     utilId: null,                 nome: "Rosa Cardoso" },
  { id: "prof-paulo",    utilId: null,                 nome: "Paulo Rodrigues Sousa" },
  { id: "prof-eduardo",  utilId: null,                 nome: "Eduardo Mendes da Silva" },
  { id: "prof-tomas",    utilId: null,                 nome: "Tomás Neves Pereira" },
  { id: "prof-ana",      utilId: null,                 nome: "Ana Pinto Alves" },
  { id: "prof-rui",      utilId: null,                 nome: "Rui Marques Ferreira" },
  { id: "prof-sandra",   utilId: null,                 nome: "Sandra Lima Rodrigues" },
  { id: "prof-david",    utilId: null,                 nome: "David Rocha Monteiro" },
  { id: "prof-jose",     utilId: null,                 nome: "José Manuel Gonçalves" },
];

// Turmas representativas para mensagens
const TURMAS_MENSAGENS = [
  { id: "turma-13-gi-a", nome: "13ª GI-A", prof: "prof-beatriz",  profNome: "Beatriz Fernandes" },
  { id: "turma-13-gi-a", nome: "13ª GI-A", prof: "prof-antonio",  profNome: "António da Silva" },
  { id: "turma-13-gi-a", nome: "13ª GI-A", prof: "prof-pedro",    profNome: "Pedro Costa Fonseca" },
  { id: "turma-11-gi-a", nome: "11ª GI-A", prof: "prof-beatriz",  profNome: "Beatriz Fernandes" },
  { id: "turma-10-gi-a", nome: "10ª GI-A", prof: "prof-pedro",    profNome: "Pedro Costa Fonseca" },
  { id: "turma-10-ce-a", nome: "10ª CE-A", prof: "prof-sandra",   profNome: "Sandra Lima Rodrigues" },
  { id: "turma-11-ce-a", nome: "11ª CE-A", prof: "prof-sandra",   profNome: "Sandra Lima Rodrigues" },
  { id: "turma-10-ct-a", nome: "10ª CT-A", prof: "prof-rui",      profNome: "Rui Marques Ferreira" },
  { id: "turma-11-ct-a", nome: "11ª CT-A", prof: "prof-rui",      profNome: "Rui Marques Ferreira" },
  { id: "turma-7-a",     nome: "7ª A",     prof: "prof-paulo",    profNome: "Paulo Rodrigues Sousa" },
  { id: "turma-8-a",     nome: "8ª A",     prof: "prof-paulo",    profNome: "Paulo Rodrigues Sousa" },
  { id: "turma-9-a",     nome: "9ª A",     prof: "prof-paulo",    profNome: "Paulo Rodrigues Sousa" },
  { id: "turma-4-a",     nome: "4ª A",     prof: "prof-jose",     profNome: "José Manuel Gonçalves" },
  { id: "turma-5-a",     nome: "5ª A",     prof: "prof-jose",     profNome: "José Manuel Gonçalves" },
  { id: "turma-10-hum-a",nome: "10ª HUM-A",prof: "prof-david",    profNome: "David Rocha Monteiro" },
];

// ─── MENSAGENS DE TURMA ───────────────────────────────────────────────────────
const MENSAGENS_TURMA = [
  // 13ª GI-A — director de turma
  {
    turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A",
    profId: "prof-beatriz", profNome: "Beatriz Fernandes",
    assunto: "Bem-vindos ao 3º Trimestre — 13ª GI-A",
    corpo: "Caros alunos,\n\nIniciamos o 3º e último trimestre do ano lectivo 2025/2026. É fundamental mantermos a disciplina e o empenho para uma boa conclusão do ciclo.\n\nOs testes de avaliação estão previstos para as semanas de 20 a 30 de Abril. Consultem o horário afixado.\n\nForça e bom trabalho!\n\nProf. Beatriz Fernandes\nDirectora de Turma — 13ª GI-A",
    daysAgo: 3,
  },
  {
    turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A",
    profId: "prof-pedro", profNome: "Pedro Costa Fonseca",
    assunto: "Projecto Final — Informática de Gestão",
    corpo: "Bom dia turma 13ª GI-A,\n\nRecordo que o prazo de entrega do projecto final de Informática de Gestão é dia 25 de Abril. Os grupos devem submeter:\n\n• Relatório técnico (formato PDF, mín. 20 páginas)\n• Código fonte comentado\n• Apresentação PowerPoint (max. 15 slides)\n\nA apresentação oral decorrerá nos dias 28 e 29 de Abril, em data a confirmar por grupo.\n\nContactem-me por mensagem privada para esclarecer dúvidas.\n\nProf. Pedro Costa",
    daysAgo: 5,
  },
  {
    turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A",
    profId: "prof-antonio", profNome: "António da Silva",
    assunto: "Leitura Obrigatória — Língua Portuguesa",
    corpo: "Alunos da 13ª GI-A,\n\nPara a avaliação oral do 3º trimestre, cada aluno deverá apresentar uma análise de um capítulo da obra «Os Maias» de Eça de Queirós.\n\nA distribuição dos capítulos está afixada no placard da sala A1. Consultem com antecedência.\n\nData das apresentações: 5 a 9 de Maio.\n\nBoa preparação,\nProf. António da Silva",
    daysAgo: 7,
  },
  {
    turmaId: "turma-13-gi-a", turmaNome: "13ª GI-A",
    profId: "prof-carlos", profNome: "Carlos Sousa Mendes",
    assunto: "Revisões de Matemática — Exame Nacional",
    corpo: "Boa tarde alunos,\n\nCom o exame nacional a aproximar-se, vamos intensificar as revisões. Nas próximas aulas focaremo-nos em:\n\n• Análise combinatória e probabilidades\n• Funções e continuidade\n• Integrais\n\nTratem de rever os exercícios dos testes anteriores. Disponibilizo fichas de revisão no portal do aluno.\n\nProf. Carlos Sousa",
    daysAgo: 10,
  },
  // 11ª GI-A
  {
    turmaId: "turma-11-gi-a", turmaNome: "11ª GI-A",
    profId: "prof-beatriz", profNome: "Beatriz Fernandes",
    assunto: "Aviso — Aula de Recuperação de SI",
    corpo: "Alunos da 11ª GI-A,\n\nInformo que haverá uma aula de recuperação de Sistemas de Informação na próxima Quinta-feira (10 de Abril) das 10h00 às 11h30, na sala Lab. Informática 1.\n\nPresença obrigatória para todos os alunos com nota abaixo de 10 no 2º trimestre.\n\nProf. Beatriz Fernandes",
    daysAgo: 2,
  },
  {
    turmaId: "turma-11-gi-a", turmaNome: "11ª GI-A",
    profId: "prof-pedro", profNome: "Pedro Costa Fonseca",
    assunto: "Trabalho de Grupo — Programação",
    corpo: "Caros alunos da 11ª GI-A,\n\nOs grupos de trabalho de Programação já foram definidos e estão publicados na plataforma. Cada grupo deve desenvolver uma aplicação de gestão simples utilizando Python.\n\nPrazo de entrega: 30 de Abril.\nApresentação: 5 de Maio.\n\nQualquer dúvida, contactem durante o horário de atendimento (Terças 14h-15h).\n\nProf. Pedro Costa",
    daysAgo: 4,
  },
  // 10ª GI-A
  {
    turmaId: "turma-10-gi-a", turmaNome: "10ª GI-A",
    profId: "prof-pedro", profNome: "Pedro Costa Fonseca",
    assunto: "Introdução às Bases de Dados — Material de Apoio",
    corpo: "Bom dia turma 10ª GI-A,\n\nPartilhei os materiais de apoio sobre «Introdução às Bases de Dados» na plataforma. Inclui:\n\n- Slides da aula (PDF)\n- Exercícios práticos de SQL\n- Tutorial de instalação do MySQL\n\nNa próxima aula (Quarta-feira) faremos a primeira prática no laboratório. Venham com o computador e o tutorial instalado.\n\nProf. Pedro Costa",
    daysAgo: 1,
  },
  // 10ª CE-A
  {
    turmaId: "turma-10-ce-a", turmaNome: "10ª CE-A",
    profId: "prof-sandra", profNome: "Sandra Lima Rodrigues",
    assunto: "Teste de Economia Política — Semana de 14 de Abril",
    corpo: "Caros alunos da 10ª CE-A,\n\nO 1º teste de Economia Política do 3º trimestre realizará na semana de 14 de Abril (data exacta a confirmar consoante o horário final).\n\nMatéria a estudar:\n• Conceito e funções do Estado na economia\n• Tipos de sistemas económicos\n• Oferta e procura — equilíbrio de mercado\n\nBons estudos!\nProf. Sandra Lima",
    daysAgo: 6,
  },
  // 10ª CT-A
  {
    turmaId: "turma-10-ct-a", turmaNome: "10ª CT-A",
    profId: "prof-rui", profNome: "Rui Marques Ferreira",
    assunto: "Laboratório de Física — Regras de Segurança",
    corpo: "Atenção alunos da 10ª CT-A,\n\nNas próximas 3 aulas realizaremos experiências no laboratório de Ciências. É OBRIGATÓRIO:\n\n✓ Trazer a bata branca\n✓ Cabelo preso (raparigas)\n✓ Não tocar em equipamentos sem autorização\n✓ Ler as fichas de segurança antes de cada experiência\n\nAlunos que não cumprirem as regras de segurança serão retirados do laboratório.\n\nProf. Rui Marques",
    daysAgo: 3,
  },
  // 7ª A
  {
    turmaId: "turma-7-a", turmaNome: "7ª A",
    profId: "prof-paulo", profNome: "Paulo Rodrigues Sousa",
    assunto: "Visita de Estudo — Museu Nacional de Angola",
    corpo: "Caros Encarregados de Educação e alunos da 7ª A,\n\nInformamos que está prevista uma visita de estudo ao Museu Nacional de Angola no dia 22 de Abril (Terça-feira), no âmbito da disciplina de História.\n\nA saída é às 8h00 e o regresso previsto é às 13h00.\n\nOs alunos que pretendem participar devem entregar a autorização assinada pelo encarregado de educação até dia 15 de Abril.\n\nProf. Paulo Rodrigues\nDirector de Turma — 7ª A",
    daysAgo: 8,
  },
  // 4ª A — Primário
  {
    turmaId: "turma-4-a", turmaNome: "4ª A",
    profId: "prof-jose", profNome: "José Manuel Gonçalves",
    assunto: "Reunião de Pais — 4ª A — 15 de Abril",
    corpo: "Caros Encarregados de Educação,\n\nConvocamos uma reunião de pais e encarregados de educação da turma 4ª A para o dia 15 de Abril de 2026, às 15h30, na Sala A1.\n\nOrdem de trabalhos:\n1. Apreciação dos resultados do 2º trimestre\n2. Situação comportamental e assiduidade\n3. Informações para o 3º trimestre\n\nA vossa presença é muito importante.\n\nProf. José Manuel Gonçalves\nDirector de Turma — 4ª A",
    daysAgo: 5,
  },
  // 10ª HUM-A
  {
    turmaId: "turma-10-hum-a", turmaNome: "10ª HUM-A",
    profId: "prof-david", profNome: "David Rocha Monteiro",
    assunto: "Debate Filosófico — Preparação",
    corpo: "Caros alunos da 10ª HUM-A,\n\nNa próxima sexta-feira realizaremos o nosso primeiro debate filosófico do trimestre. O tema é:\n\n«A liberdade individual e os limites impostos pela sociedade»\n\nDividam-se em dois grupos (pró e contra). Cada grupo deve preparar pelo menos 5 argumentos sólidos.\n\nO debate terá duração de 45 minutos e conta para a avaliação oral.\n\nBoa preparação filosófica!\nProf. David Rocha",
    daysAgo: 2,
  },
];

// ─── MENSAGENS PRIVADAS ───────────────────────────────────────────────────────
const MENSAGENS_PRIVADAS = [
  {
    remetenteId: "util-prof-beatriz", remetenteNome: "Beatriz Fernandes",
    destinatarioId: "root", destinatarioNome: "Administrador do Sistema",
    destinatarioTipo: "utilizador",
    assunto: "Relatório de Turma — 13ª GI-A — 2º Trimestre",
    corpo: "Boa tarde,\n\nAdjunto envio o relatório de desempenho da turma 13ª GI-A referente ao 2º trimestre.\n\nDestaques positivos:\n- Taxa de aprovação: 87% (acima da meta de 80%)\n- Média geral: 13,2 valores\n\nAlunos em risco:\n- 4 alunos com média abaixo de 10 (acompanhamento especial requerido)\n\nSolicito reunião com a direcção pedagógica para definir estratégias de recuperação.\n\nCom os melhores cumprimentos,\nProf. Beatriz Fernandes",
    daysAgo: 12,
  },
  {
    remetenteId: "util-prof-silva", remetenteNome: "António da Silva",
    destinatarioId: "util-prof-beatriz", destinatarioNome: "Beatriz Fernandes",
    destinatarioTipo: "professor",
    assunto: "Colaboração — Projecto Língua Portuguesa + Informática",
    corpo: "Olá Beatriz,\n\nEstava a pensar em propor uma actividade interdisciplinar que una Língua Portuguesa e Sistemas de Informação para a 13ª GI-A.\n\nA ideia é que os alunos criem um blog ou site simples sobre literatura angolana, desenvolvendo competências de escrita e de programação web em simultâneo.\n\nO que achas? Poderíamos apresentar à direcção como projecto da escola.\n\nAbraço,\nAntónio",
    daysAgo: 9,
  },
  {
    remetenteId: "util-prof-beatriz", remetenteNome: "Beatriz Fernandes",
    destinatarioId: "util-prof-silva", destinatarioNome: "António da Silva",
    destinatarioTipo: "professor",
    assunto: "Re: Colaboração — Projecto Língua Portuguesa + Informática",
    corpo: "Olá António,\n\nAdoro a ideia! Seria mesmo uma forma de motivar os alunos para as duas disciplinas ao mesmo tempo.\n\nSugiro marcarmos uma reunião na próxima semana para estruturarmos o projecto. Que tal Terça-feira às 12h30?\n\nAbraço,\nBeatriz",
    daysAgo: 8,
  },
  {
    remetenteId: "root", remetenteNome: "Administração SIGA",
    destinatarioId: "util-prof-beatriz", destinatarioNome: "Beatriz Fernandes",
    destinatarioTipo: "professor",
    assunto: "Confirmação — Acesso ao Portal do Professor",
    corpo: "Professora Beatriz,\n\nInformamos que o seu acesso ao portal SIGA v3 foi activado com sucesso.\n\nAs suas credenciais são:\nEmail: prof.directora@escola.ao\nPerfil: Professor / Directora de Turma\n\nPor motivos de segurança, recomendamos a alteração da palavra-passe no primeiro acesso.\n\nEquipa SIGA",
    daysAgo: 30,
  },
  {
    remetenteId: "util-prof-silva", remetenteNome: "António da Silva",
    destinatarioId: "root", destinatarioNome: "Administrador do Sistema",
    destinatarioTipo: "utilizador",
    assunto: "Problema no Lançamento de Notas",
    corpo: "Boa tarde,\n\nEstou com dificuldade em fechar a pauta da turma 11ª GI-B. O sistema apresenta um erro de validação ao submeter as notas do 2º trimestre.\n\nPoderá verificar o problema? Já tentei fazer o lançamento em dois computadores diferentes com o mesmo resultado.\n\nObrigado,\nProf. António da Silva",
    daysAgo: 15,
  },
];

// ─── MATERIAIS DIDÁCTICOS ─────────────────────────────────────────────────────
const MATERIAIS = [
  // 13ª GI-A — Informática de Gestão (prof-pedro)
  {
    profId: "prof-pedro", turmaId: "turma-13-gi-a",
    disciplina: "Informática de Gestão",
    titulo: "Slides — Redes de Computadores e Protocolos TCP/IP",
    descricao: "Apresentação completa sobre arquitectura de redes, modelo OSI, e protocolos TCP/IP. Inclui diagramas e exemplos práticos.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/IG_Redes_TCP-IP.pdf",
    daysAgo: 14,
  },
  {
    profId: "prof-pedro", turmaId: "turma-13-gi-a",
    disciplina: "Informática de Gestão",
    titulo: "Ficha de Exercícios — Algoritmos e Pseudo-código",
    descricao: "20 exercícios práticos de algoritmos com nível de dificuldade progressivo. Inclui soluções comentadas.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/IG_Algoritmos_Exercicios.pdf",
    daysAgo: 10,
  },
  {
    profId: "prof-pedro", turmaId: "turma-13-gi-a",
    disciplina: "Programação",
    titulo: "Tutorial Python — Introdução à Programação Orientada a Objectos",
    descricao: "Tutorial passo-a-passo de Python com foco em classes, objectos, herança e polimorfismo.",
    tipo: "link",
    conteudo: "https://docs.python.org/pt-br/3/tutorial/classes.html",
    daysAgo: 7,
  },
  {
    profId: "prof-pedro", turmaId: "turma-13-gi-a",
    disciplina: "Bases de Dados",
    titulo: "Enunciado — Projecto Final de Bases de Dados",
    descricao: "Enunciado completo do projecto final. Inclui requisitos, critérios de avaliação e formato de entrega.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/BD_Projecto_Final_Enunciado.pdf",
    daysAgo: 5,
  },
  // 13ª GI-A — Língua Portuguesa (prof-antonio)
  {
    profId: "prof-antonio", turmaId: "turma-13-gi-a",
    disciplina: "Língua Portuguesa",
    titulo: "Os Maias — Capítulos para Apresentação Oral",
    descricao: "Distribuição dos capítulos por aluno e grelha de avaliação da apresentação oral.",
    tipo: "doc",
    conteudo: "/materiais/13gi-a/LP_Os_Maias_Distribuicao.docx",
    daysAgo: 7,
  },
  {
    profId: "prof-antonio", turmaId: "turma-13-gi-a",
    disciplina: "Língua Portuguesa",
    titulo: "Ficha de Revisão — Coesão e Coerência Textual",
    descricao: "Exercícios práticos sobre coesão referencial, lexical e gramatical. Preparação para o exame nacional.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/LP_Coesao_Coerencia.pdf",
    daysAgo: 3,
  },
  // 13ª GI-A — Matemática (prof-carlos)
  {
    profId: "prof-carlos", turmaId: "turma-13-gi-a",
    disciplina: "Matemática",
    titulo: "Fichas de Revisão — Funções e Continuidade",
    descricao: "Conjunto de fichas de revisão para o exame nacional. Cobre todos os tópicos do programa do 13º ano.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/MAT_Revisao_Funcoes.pdf",
    daysAgo: 10,
  },
  {
    profId: "prof-carlos", turmaId: "turma-13-gi-a",
    disciplina: "Matemática",
    titulo: "Simulacro de Exame Nacional — Matemática 2024",
    descricao: "Exame simulacro baseado nos modelos dos anos anteriores. Com correcção detalhada.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/MAT_Simulacro_Exame_2024.pdf",
    daysAgo: 6,
  },
  // 13ª GI-A — Contabilidade (prof-fernanda)
  {
    profId: "prof-fernanda", turmaId: "turma-13-gi-a",
    disciplina: "Contabilidade Geral",
    titulo: "Mapa de Exercícios — Balanço e Demonstração de Resultados",
    descricao: "30 exercícios práticos de contabilidade com casos reais angolanos. Inclui templates de balanço.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/CONT_Balanco_Exercicios.pdf",
    daysAgo: 12,
  },
  {
    profId: "prof-fernanda", turmaId: "turma-13-gi-a",
    disciplina: "Economia",
    titulo: "Slides — Macroeconomia e Política Económica de Angola",
    descricao: "Apresentação sobre o contexto macroeconómico angolano, PIB, inflação e políticas do BNA.",
    tipo: "pdf",
    conteudo: "/materiais/13gi-a/ECO_Macroeconomia_Angola.pdf",
    daysAgo: 9,
  },
  // 11ª GI-A — Sistemas de Informação (prof-beatriz)
  {
    profId: "prof-beatriz", turmaId: "turma-11-gi-a",
    disciplina: "Sistemas de Informação",
    titulo: "Trabalho de Grupo — Análise de Sistemas de Informação Empresarial",
    descricao: "Enunciado do trabalho de grupo sobre análise e design de sistemas de informação. Inclui template de relatório.",
    tipo: "doc",
    conteudo: "/materiais/11gi-a/SI_Trabalho_Grupo.docx",
    daysAgo: 4,
  },
  {
    profId: "prof-beatriz", turmaId: "turma-11-gi-a",
    disciplina: "Informática de Gestão",
    titulo: "Slides — Arquitectura de Software e Padrões de Design",
    descricao: "Apresentação sobre MVC, padrões de design e boas práticas de desenvolvimento de software.",
    tipo: "pdf",
    conteudo: "/materiais/11gi-a/IG_Arquitectura_Software.pdf",
    daysAgo: 8,
  },
  // 10ª GI-A — Pedro
  {
    profId: "prof-pedro", turmaId: "turma-10-gi-a",
    disciplina: "Informática de Gestão",
    titulo: "Tutorial — Introdução ao HTML e CSS",
    descricao: "Tutorial básico de desenvolvimento web para iniciantes. Exercícios práticos incluídos.",
    tipo: "link",
    conteudo: "https://developer.mozilla.org/pt-BR/docs/Learn/Getting_started_with_the_web",
    daysAgo: 5,
  },
  {
    profId: "prof-pedro", turmaId: "turma-10-gi-a",
    disciplina: "Bases de Dados",
    titulo: "Slides — Modelo Entidade-Relação",
    descricao: "Introdução ao modelo ER, entidades, atributos, relacionamentos e cardinalidade.",
    tipo: "pdf",
    conteudo: "/materiais/10gi-a/BD_Modelo_ER.pdf",
    daysAgo: 2,
  },
  // 10ª CE-A — Sandra
  {
    profId: "prof-sandra", turmaId: "turma-10-ce-a",
    disciplina: "Economia Política",
    titulo: "Fichas de Estudo — Sistemas Económicos",
    descricao: "Resumo comparativo dos sistemas económicos: capitalismo, socialismo e economia mista. Com questões de revisão.",
    tipo: "pdf",
    conteudo: "/materiais/10ce-a/EP_Sistemas_Economicos.pdf",
    daysAgo: 6,
  },
  {
    profId: "prof-sandra", turmaId: "turma-10-ce-a",
    disciplina: "Contabilidade e Gestão",
    titulo: "Exercícios — Documentos Comerciais e Facturação",
    descricao: "Exercícios práticos sobre facturas, recibos, notas de crédito e débito. Com modelos preenchidos.",
    tipo: "pdf",
    conteudo: "/materiais/10ce-a/CG_Documentos_Comerciais.pdf",
    daysAgo: 3,
  },
  // 10ª CT-A — Rui
  {
    profId: "prof-rui", turmaId: "turma-10-ct-a",
    disciplina: "Física",
    titulo: "Fichas de Laboratório — Leis de Newton",
    descricao: "Guias de laboratório para as experiências sobre as 3 leis de Newton. Inclui ficha de segurança e grelha de observações.",
    tipo: "pdf",
    conteudo: "/materiais/10ct-a/FIS_Lab_Newton.pdf",
    daysAgo: 3,
  },
  {
    profId: "prof-rui", turmaId: "turma-10-ct-a",
    disciplina: "Química",
    titulo: "Slides — Tabela Periódica e Ligações Químicas",
    descricao: "Apresentação interactiva sobre a tabela periódica, propriedades dos elementos e tipos de ligações químicas.",
    tipo: "pdf",
    conteudo: "/materiais/10ct-a/QUI_Tabela_Periodica.pdf",
    daysAgo: 7,
  },
  // 7ª A — Paulo (I Ciclo)
  {
    profId: "prof-paulo", turmaId: "turma-7-a",
    disciplina: "História",
    titulo: "Fichas de Estudo — História de Angola Colonial",
    descricao: "Resumos e mapas conceptuais sobre o período colonial em Angola. Com linha cronológica.",
    tipo: "pdf",
    conteudo: "/materiais/7a/HIS_Angola_Colonial.pdf",
    daysAgo: 8,
  },
  {
    profId: "prof-paulo", turmaId: "turma-7-a",
    disciplina: "Geografia",
    titulo: "Mapa de Angola — Províncias e Recursos Naturais",
    descricao: "Mapa interactivo das 18 províncias de Angola com principais recursos naturais e dados demográficos.",
    tipo: "link",
    conteudo: "https://www.worldatlas.com/maps/angola",
    daysAgo: 5,
  },
  // 4ª A — José (Primário)
  {
    profId: "prof-jose", turmaId: "turma-4-a",
    disciplina: "Matemática",
    titulo: "Fichas de Cálculo Mental — 4ª Classe",
    descricao: "Conjunto de 50 fichas de cálculo mental para praticar as 4 operações básicas. Níveis progressivos.",
    tipo: "pdf",
    conteudo: "/materiais/4a/MAT_Calculo_Mental.pdf",
    daysAgo: 10,
  },
  {
    profId: "prof-jose", turmaId: "turma-4-a",
    disciplina: "Língua Portuguesa",
    titulo: "Leituras Obrigatórias — 4ª Classe — 3º Trimestre",
    descricao: "Lista de textos para leitura e análise no 3º trimestre. Inclui perguntas de compreensão.",
    tipo: "doc",
    conteudo: "/materiais/4a/LP_Leituras_3Trimestre.docx",
    daysAgo: 4,
  },
  // 10ª HUM-A — David
  {
    profId: "prof-david", turmaId: "turma-10-hum-a",
    disciplina: "Filosofia",
    titulo: "Texto Base — O Contrato Social (Rousseau)",
    descricao: "Excertos seleccionados de O Contrato Social de Jean-Jacques Rousseau com anotações pedagógicas.",
    tipo: "pdf",
    conteudo: "/materiais/10hum-a/FIL_Contrato_Social.pdf",
    daysAgo: 6,
  },
  {
    profId: "prof-david", turmaId: "turma-10-hum-a",
    disciplina: "Sociologia",
    titulo: "Slides — Estratificação Social e Mobilidade Social em Angola",
    descricao: "Análise sociológica da estratificação social angolana contemporânea. Com dados do INE-Angola.",
    tipo: "pdf",
    conteudo: "/materiais/10hum-a/SOC_Estratificacao_Angola.pdf",
    daysAgo: 9,
  },
  // 11ª CE-A — Sandra
  {
    profId: "prof-sandra", turmaId: "turma-11-ce-a",
    disciplina: "Economia Política",
    titulo: "Caso de Estudo — Análise Económica da Sonangol",
    descricao: "Caso de estudo sobre a Sonangol como empresa pública estratégica na economia angolana.",
    tipo: "pdf",
    conteudo: "/materiais/11ce-a/EP_Caso_Sonangol.pdf",
    daysAgo: 11,
  },
  {
    profId: "prof-fernanda", turmaId: "turma-11-ce-a",
    disciplina: "Contabilidade e Gestão",
    titulo: "Exercícios Práticos — Demonstrações Financeiras",
    descricao: "20 exercícios sobre balanço, DRE e fluxos de caixa. Com correcção detalhada.",
    tipo: "pdf",
    conteudo: "/materiais/11ce-a/CG_Demonstracoes_Financeiras.pdf",
    daysAgo: 7,
  },
  // 11ª CT-A — Rui
  {
    profId: "prof-rui", turmaId: "turma-11-ct-a",
    disciplina: "Física Aplicada",
    titulo: "Slides — Electricidade e Magnetismo",
    descricao: "Apresentação completa sobre lei de Coulomb, campo eléctrico, lei de Faraday e indução electromagnética.",
    tipo: "pdf",
    conteudo: "/materiais/11ct-a/FA_Electricidade_Magnetismo.pdf",
    daysAgo: 5,
  },
  {
    profId: "prof-rui", turmaId: "turma-11-ct-a",
    disciplina: "Química Aplicada",
    titulo: "Ficha de Laboratório — Reacções de Oxidação-Redução",
    descricao: "Guia laboratorial para experiências de redox. Inclui questões pré e pós-laboratório.",
    tipo: "pdf",
    conteudo: "/materiais/11ct-a/QA_Lab_Redox.pdf",
    daysAgo: 3,
  },
];

// ─── HELPER ───────────────────────────────────────────────────────────────────
function daysAgoTs(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // Vary the time slightly
  d.setHours(8 + (days % 10), (days * 7) % 60, 0, 0);
  return d.toISOString();
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. LIMPAR DADOS ANTIGOS ────────────────────────────────────────────────
    console.log("→ A limpar mensagens e materiais anteriores do seed...");
    await client.query(`DELETE FROM public.mensagens WHERE "remetenteNome" IN (${
      PROFS.map(p => `'${p.nome}'`).join(",")
    }, 'Administração SIGA')`);
    await client.query(`DELETE FROM public.materiais WHERE "professorId" IN (${
      PROFS.map(p => `'${p.id}'`).join(",")
    })`);
    console.log("   ✓ Dados anteriores limpos");

    // ── 2. MENSAGENS DE TURMA ─────────────────────────────────────────────────
    console.log("→ Mensagens de turma...");
    for (const m of MENSAGENS_TURMA) {
      await client.query(
        `INSERT INTO public.mensagens
           ("remetenteId","remetenteNome",tipo,"turmaId","turmaNome",assunto,corpo,"lidaPor","createdAt")
         VALUES ($1,$2,'turma',$3,$4,$5,$6,'[]'::jsonb,$7::timestamptz)
         ON CONFLICT DO NOTHING`,
        [m.profId, m.profNome, m.turmaId, m.turmaNome, m.assunto, m.corpo, daysAgoTs(m.daysAgo)]
      );
    }
    console.log(`   ✓ ${MENSAGENS_TURMA.length} mensagens de turma inseridas`);

    // ── 3. MENSAGENS PRIVADAS ─────────────────────────────────────────────────
    console.log("→ Mensagens privadas...");
    for (const m of MENSAGENS_PRIVADAS) {
      await client.query(
        `INSERT INTO public.mensagens
           ("remetenteId","remetenteNome",tipo,"destinatarioId","destinatarioNome","destinatarioTipo",
            assunto,corpo,"lidaPor","createdAt")
         VALUES ($1,$2,'privada',$3,$4,$5,$6,$7,'[]'::jsonb,$8::timestamptz)
         ON CONFLICT DO NOTHING`,
        [m.remetenteId, m.remetenteNome, m.destinatarioId, m.destinatarioNome, m.destinatarioTipo,
         m.assunto, m.corpo, daysAgoTs(m.daysAgo)]
      );
    }
    console.log(`   ✓ ${MENSAGENS_PRIVADAS.length} mensagens privadas inseridas`);

    // ── 4. MATERIAIS DIDÁCTICOS ───────────────────────────────────────────────
    console.log("→ Materiais didácticos...");
    for (const mat of MATERIAIS) {
      // Look up turmaNome
      const turmaRes = await client.query(`SELECT nome FROM public.turmas WHERE id=$1`, [mat.turmaId]);
      const turmaNome = turmaRes.rows[0]?.nome || mat.turmaNome || mat.turmaId;
      await client.query(
        `INSERT INTO public.materiais
           ("professorId","turmaId","turmaNome",disciplina,titulo,descricao,conteudo,tipo,"createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz)
         ON CONFLICT DO NOTHING`,
        [mat.profId, mat.turmaId, turmaNome, mat.disciplina, mat.titulo, mat.descricao || '',
         mat.conteudo || '', mat.tipo, daysAgoTs(mat.daysAgo)]
      );
    }
    console.log(`   ✓ ${MATERIAIS.length} materiais didácticos inseridos`);

    await client.query("COMMIT");

    console.log(`
╔══════════════════════════════════════════════════════╗
║     ✅  MENSAGENS E MATERIAIS INSERIDOS!            ║
╠══════════════════════════════════════════════════════╣
║  Mensagens de turma  : ${String(MENSAGENS_TURMA.length).padEnd(28)}║
║  Mensagens privadas  : ${String(MENSAGENS_PRIVADAS.length).padEnd(28)}║
║  Materiais didácticos: ${String(MATERIAIS.length).padEnd(28)}║
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
