/**
 * Saudações inteligentes inspiradas no estilo Claude AI:
 * - Variadas, calorosas, contextuais (hora, dia, data comemorativa, aniversário)
 * - Nunca repetitivas — selecção semi-aleatória baseada no minuto actual
 */

export type GreetingPeriod = 'madrugada' | 'manha' | 'tarde' | 'noite';

export function getGreetingPeriod(date: Date = new Date()): GreetingPeriod {
  const h = date.getHours();
  if (h >= 0 && h < 6) return 'madrugada';
  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';
  return 'noite';
}

export function getTimeGreeting(date: Date = new Date()): string {
  switch (getGreetingPeriod(date)) {
    case 'madrugada': return 'Boa madrugada';
    case 'manha':     return 'Bom dia';
    case 'tarde':     return 'Boa tarde';
    case 'noite':     return 'Boa noite';
  }
}

/** Selecciona um item da lista de forma estável por minuto (não muda a cada segundo). */
function pickByMinute<T>(list: T[], date: Date): T {
  const seed = date.getHours() * 60 + date.getMinutes();
  return list[seed % list.length];
}

/** Frases de boas-vindas calorosas por período — estilo Claude AI */
const FRASES_MANHA = [
  'Pronto para mais um dia produtivo?',
  'Que o dia de hoje seja incrível!',
  'Um novo dia cheio de possibilidades!',
  'Energia e foco para este dia!',
  'Vamos começar com tudo!',
  'Que bom tê-lo(a) aqui hoje!',
  'Mais um dia para fazer a diferença!',
  'Café na mão e vamos a isso!',
  'O sucesso começa cedo — parabéns!',
  'Que o seu dia flua com leveza e alegria!',
];

const FRASES_TARDE = [
  'A tarde ainda tem muito a oferecer!',
  'Continue assim — está a ir muito bem!',
  'Meio dia superado, vamos em frente!',
  'A tarde é sua — aproveite ao máximo!',
  'Boa produtividade para esta tarde!',
  'O dia está a correr muito bem!',
  'Que tarde cheia de realizações!',
  'Ainda há muito para conquistar hoje!',
];

const FRASES_NOITE = [
  'Que noite tranquila e produtiva!',
  'O esforço de hoje traz os frutos de amanhã.',
  'A dedicação não tem hora certa!',
  'Parabéns pela persistência!',
  'O trabalho nocturno é a prova do compromisso.',
  'Que a noite seja calma e produtiva!',
];

const FRASES_MADRUGADA = [
  'A madrugada pertence aos dedicados!',
  'Enquanto o mundo dorme, você constrói!',
  'Silêncio da madrugada — concentração máxima.',
  'Herói da madrugada — parabéns pela dedicação!',
];

const DIAS_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
] as const;

export function getNomeDiaSemana(date: Date = new Date()): string {
  return DIAS_SEMANA[date.getDay()];
}

/**
 * Datas comemorativas Angola + Internacionais — formato "MM-DD".
 * Lista abrangente para o ano escolar angolano.
 */
const DATAS_COMEMORATIVAS: Record<string, string> = {
  // ── Janeiro ──────────────────────────────────────────
  '01-01': '🎊 Feliz Ano Novo',
  '01-04': '🕊️ Dia Mundial do Braille',
  '01-11': '🇦🇴 Dia do Movimento dos Trabalhadores de Angola',

  // ── Fevereiro ─────────────────────────────────────────
  '02-04': '🔥 Feliz Dia do Início da Luta Armada de Libertação Nacional',
  '02-14': '❤️ Feliz Dia de São Valentim',
  '02-21': '🌍 Dia Internacional da Língua Materna',

  // ── Março ─────────────────────────────────────────────
  '03-08': '💜 Feliz Dia Internacional da Mulher',
  '03-21': '🌿 Dia Internacional da Eliminação da Discriminação Racial',
  '03-22': '💧 Dia Mundial da Água',
  '03-23': '🇦🇴 Feliz Dia da Libertação da África Austral',
  '03-25': '📖 Dia da Estela da Língua Portuguesa',

  // ── Abril ─────────────────────────────────────────────
  '04-02': '🧠 Dia Mundial da Consciencialização do Autismo',
  '04-04': '🕊️ Feliz Dia da Paz e Reconciliação Nacional de Angola',
  '04-07': '🏥 Dia Mundial da Saúde',
  '04-22': '🌱 Feliz Dia da Terra',
  '04-23': '📚 Dia Mundial do Livro e dos Direitos de Autor',

  // ── Maio ──────────────────────────────────────────────
  '05-01': '✊ Feliz Dia do Trabalhador',
  '05-03': '📰 Dia Mundial da Liberdade de Imprensa',
  '05-05': '🌐 Dia da Língua Portuguesa e da Cultura',
  '05-15': '👨‍👩‍👧‍👦 Feliz Dia Internacional da Família',
  '05-17': '📡 Dia Mundial das Telecomunicações',
  '05-25': '🌍 Dia de África',
  '05-31': '🚭 Dia Mundial sem Tabaco',

  // ── Junho ─────────────────────────────────────────────
  '06-01': '🧒 Feliz Dia Internacional da Criança',
  '06-05': '🌿 Feliz Dia Mundial do Ambiente',
  '06-12': '🚫 Dia Mundial contra o Trabalho Infantil',
  '06-13': '🎓 Dia do Estudante Angolano',
  '06-16': '✊ Dia Africano da Criança',
  '06-21': '☀️ Dia Mundial do Solstício de Verão',
  '06-23': '🌍 Dia das Nações Unidas para a Cooperação Sul-Sul',
  '06-26': '🚫 Dia Internacional contra o Uso Indevido de Drogas',

  // ── Julho ─────────────────────────────────────────────
  '07-11': '🌍 Dia Mundial da População',
  '07-30': '🚫 Dia Mundial contra o Tráfico de Pessoas',

  // ── Agosto ────────────────────────────────────────────
  '08-12': '👦 Dia Internacional da Juventude',
  '08-23': '⛓️ Dia Internacional da Memória do Tráfico Negreiro',

  // ── Setembro ──────────────────────────────────────────
  '09-08': '📖 Dia Mundial da Alfabetização',
  '09-17': '🦁 Feliz Dia do Herói Nacional — Agostinho Neto',
  '09-21': '🕊️ Dia Internacional da Paz',
  '09-28': '📢 Dia Internacional do Direito à Informação',

  // ── Outubro ───────────────────────────────────────────
  '10-01': '👴 Dia Internacional das Pessoas Idosas',
  '10-02': '🕊️ Dia Internacional da Não-Violência',
  '10-05': '🎓 Feliz Dia Mundial do Professor',
  '10-10': '🧠 Dia Mundial da Saúde Mental',
  '10-11': '👧 Dia Internacional da Rapariga',
  '10-14': '🌍 Dia Mundial dos Padrões',
  '10-16': '🍽️ Dia Mundial da Alimentação',
  '10-17': '🤝 Dia Internacional para a Erradicação da Pobreza',
  '10-31': '🎃 Véspera de Todos os Santos',

  // ── Novembro ──────────────────────────────────────────
  '11-01': '🕯️ Dia de Todos os Santos',
  '11-02': '🌹 Dia de Finados — em memória dos nossos',
  '11-11': '🇦🇴 Feliz Dia da Independência Nacional de Angola',
  '11-14': '💙 Dia Mundial do Diabetes',
  '11-19': '🚰 Dia Mundial do Saneamento',
  '11-20': '🧒 Feliz Dia Mundial da Criança',
  '11-25': '🚫 Dia Internacional pela Eliminação da Violência contra as Mulheres',

  // ── Dezembro ──────────────────────────────────────────
  '12-01': '🔴 Dia Mundial de Luta contra a SIDA',
  '12-03': '♿ Dia Internacional das Pessoas com Deficiência',
  '12-05': '🌍 Dia Mundial do Solo',
  '12-10': '🏛️ Dia Internacional dos Direitos Humanos',
  '12-18': '🌍 Dia Internacional dos Migrantes',
  '12-24': '🎄 Feliz Véspera de Natal',
  '12-25': '🎄 Feliz Natal',
  '12-31': '🎊 Feliz Véspera de Ano Novo',
};

function ddmm(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function getHolidayGreeting(date: Date = new Date()): string | null {
  return DATAS_COMEMORATIVAS[ddmm(date)] ?? null;
}

export function getDayContext(date: Date = new Date()): string | null {
  const holiday = getHolidayGreeting(date);
  if (holiday) return holiday;

  const day = date.getDay();
  const period = getGreetingPeriod(date);

  if (day === 0 || day === 6) return '😎 Bom fim-de-semana';
  if (day === 1 && (period === 'manha' || period === 'madrugada')) return '💪 Feliz segunda-feira';
  if (day === 5 && (period === 'tarde' || period === 'noite')) return '🎉 Boa sexta-feira';

  return null;
}

/** Extrai o primeiro nome. */
export function firstName(fullName?: string | null): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || null;
}

/** Extrai o último nome. */
export function lastName(fullName?: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}

/** Extrai primeiro e último nome formatados. */
export function firstAndLastName(fullName?: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * Verifica se hoje é o aniversário do utilizador.
 */
export function isBirthday(dataNascimento?: string | null, today: Date = new Date()): boolean {
  if (!dataNascimento) return false;
  const raw = String(dataNascimento).trim();
  if (!raw) return false;

  let mes: number | null = null;
  let dia: number | null = null;

  let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    mes = parseInt(m[2], 10);
    dia = parseInt(m[3], 10);
  } else {
    m = raw.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
    if (m) {
      dia = parseInt(m[1], 10);
      mes = parseInt(m[2], 10);
    }
  }

  if (mes === null || dia === null) return false;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  return today.getMonth() + 1 === mes && today.getDate() === dia;
}

/**
 * Calcula a idade que o utilizador faz (ou fez) no ano corrente.
 */
export function getAniversarioIdade(dataNascimento?: string | null, today: Date = new Date()): number | null {
  if (!dataNascimento) return null;
  const raw = String(dataNascimento).trim();
  let ano: number | null = null;

  let m = raw.match(/^(\d{4})[-/]\d{1,2}[-/]\d{1,2}/);
  if (m) ano = parseInt(m[1], 10);
  else {
    m = raw.match(/^\d{1,2}[-/]\d{1,2}[-/](\d{4})$/);
    if (m) ano = parseInt(m[1], 10);
  }

  if (!ano || ano < 1900 || ano > today.getFullYear()) return null;
  return today.getFullYear() - ano;
}

/**
 * Constrói a saudação inteligente estilo Claude AI.
 *
 * Prioridade:
 *   1. Aniversário do utilizador
 *   2. Data comemorativa
 *   3. Contexto do dia da semana especial
 *   4. Frase calorosa variada por hora + saudação horária
 */
export function buildSmartGreeting(
  fullName?: string | null,
  date: Date = new Date(),
  dataNascimento?: string | null,
): string {
  const name = firstName(fullName);
  const time = getTimeGreeting(date);
  const namePart = name ? `, ${name}` : '';

  // 1. Aniversário
  if (isBirthday(dataNascimento, date)) {
    const idade = getAniversarioIdade(dataNascimento, date);
    const idadeTxt = idade && idade > 0 && idade < 120 ? ` (${idade} anos!)` : '';
    return `🎉 Feliz aniversário${namePart}${idadeTxt} — ${time}`;
  }

  // 2. Data comemorativa ou dia da semana especial
  const context = getDayContext(date);
  if (context) {
    return `${context}${namePart} — ${time}`;
  }

  // 3. Frase calorosa variada por período
  const period = getGreetingPeriod(date);
  let frase: string;
  switch (period) {
    case 'manha':     frase = pickByMinute(FRASES_MANHA, date); break;
    case 'tarde':     frase = pickByMinute(FRASES_TARDE, date); break;
    case 'noite':     frase = pickByMinute(FRASES_NOITE, date); break;
    case 'madrugada': frase = pickByMinute(FRASES_MADRUGADA, date); break;
  }

  return `${time}${namePart} — ${frase}`;
}
