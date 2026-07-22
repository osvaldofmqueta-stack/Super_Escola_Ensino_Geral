// ─── Paleta SIGA v3 — Tema Profissional Académico ──────────────────────────
// Design philosophy:
//  • Fundos em azul-ardósia escuro (não navy puro) — menos cansativo
//  • Azul cobalto suave como cor de acção primária (substitui o vermelho)
//  • Dourado âmbar muted (substitui o laranja vivo)
//  • Texto branco-quente ligeiramente desaturado — conforto visual superior
//  • Hierarquia clara de luminosidade entre camadas

const PRIMARY      = "#1E3A5F";  // azul-ardósia profundo (era #1E3A5F)
const ACCENT       = "#4A90D9";  // azul cobalto profissional (era vermelho #4A90D9)
const GOLD         = "#C89A2A";  // âmbar dourado muted (era #C89A2A muito vivo)

export const Colors = {
  // ── Base ──────────────────────────────────────────────────────────────────
  primary:            PRIMARY,
  primaryLight:       "#2D5282",           // azul médio — hover/active
  primaryDark:        "#0D1F35",           // quase-preto azulado — header/drawer
  dark:               "#0D1F35",

  // ── Acção principal ───────────────────────────────────────────────────────
  accent:             ACCENT,
  accentLight:        "#6AAEE3",           // versão clara do cobalto

  // ── Destaque / CEO / Badge ─────────────────────────────────────────────
  gold:               GOLD,
  goldLight:          "#E8C060",           // amarelo suave — ícones / chips

  // ── Fundos em camadas (mais escuro → mais claro) ─────────────────────────
  background:         "#0D1F35",           // camada raiz
  backgroundCard:     "#122540",           // cards normais
  backgroundElevated: "#1A334F",           // modais / bottom sheets
  card:               "#122540",
  cardAlt:            "#1A334F",

  // ── Superfícies ───────────────────────────────────────────────────────────
  surface:            "#1E3A5F",
  surfaceLight:       "#253F66",

  // ── Bordas ────────────────────────────────────────────────────────────────
  border:             "#FFFFFF14",   // rgba(255,255,255,0.08) — compatible with hex suffix usage
  borderLight:        "#FFFFFF26",   // rgba(255,255,255,0.15)

  // ── Texto ─────────────────────────────────────────────────────────────────
  // Branco levemente quente em vez de #FFFFFF puro — muito menos cansativo
  text:               "#E8EEF6",
  textPrimary:        "#E8EEF6",     // alias de text — compatibilidade
  textSecondary:      "#E8EEF69E",   // rgba(232,238,246,0.62)
  textMuted:          "#E8EEF659",   // rgba(232,238,246,0.35)

  // ── Semânticas ────────────────────────────────────────────────────────────
  success:            "#22C47A",           // verde esmeralda suave
  warning:            "#D4920E",           // âmbar — aviso
  danger:             "#D94F4F",           // vermelho muted — erro / perigo
  info:               "#3E9BD4",           // azul informativo
  approved:           "#1DA86A",
  failed:             "#D94F4F",
  pending:            "#D4920E",
};

export default {
  light: {
    text:           Colors.text,
    background:     Colors.background,
    tint:           Colors.accent,
    tabIconDefault: Colors.textMuted,
    tabIconSelected:Colors.accent,
  },
};
