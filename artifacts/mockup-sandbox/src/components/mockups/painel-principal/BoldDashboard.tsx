/**
 * BoldDashboard — Painel Principal (corpo, sem header)
 * Estilo: dashboard bold, gráficos grandes, paleta SIGA v3
 */

const C = {
  bg: "#0D1F35",
  card: "#122540",
  card2: "#0F1E32",
  accent: "#4A90D9",
  gold: "#C89A2A",
  success: "#22C47A",
  danger: "#D94F4F",
  warning: "#D4920E",
  text: "#E8EEF6",
  textSec: "#8BA3BE",
  border: "#1E3A5F",
  purple: "#9B59B6",
};

/* ---------- micro helpers ---------- */
function kformat(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

/* ---------- DonutChart ---------- */
function DonutChart({
  segments,
  size = 140,
  stroke = 22,
  label,
  sublabel,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  stroke?: number;
  label: string;
  sublabel: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  const slices = segments.map((s) => {
    const pct = total ? s.value / total : 0;
    const dash = pct * circ;
    const slice = { ...s, dash, offset };
    offset += dash;
    return slice;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={C.border}
            strokeWidth={stroke}
          />
          {slices.map((s, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${circ - s.dash}`}
              strokeDashoffset={circ / 4 - s.offset}
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{label}</span>
          <span style={{ fontSize: 10, color: C.textSec, textAlign: "center", maxWidth: 60 }}>
            {sublabel}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: C.textSec }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, marginLeft: "auto" }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- HorizontalBar ---------- */
function HBar({
  label,
  value,
  max,
  color,
  suffix = "%",
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.textSec }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}{suffix}</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: C.border,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            borderRadius: 4,
            transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
          }}
        />
      </div>
    </div>
  );
}

/* ---------- VerticalBarChart ---------- */
function VBarChart({
  bars,
  height = 120,
}: {
  bars: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        height,
        paddingBottom: 24,
        position: "relative",
      }}
    >
      {/* grid lines */}
      {[0, 25, 50, 75, 100].map((pct) => (
        <div
          key={pct}
          style={{
            position: "absolute",
            bottom: 24 + (pct / 100) * (height - 24),
            left: 0,
            right: 0,
            borderTop: `1px dashed ${C.border}`,
          }}
        />
      ))}
      {bars.map((b, i) => {
        const barH = ((b.value / max) * (height - 24));
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              position: "relative",
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: b.color,
                position: "absolute",
                top: -18,
              }}
            >
              {b.value}%
            </span>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: barH,
                  background: `linear-gradient(180deg, ${b.color}, ${b.color}66)`,
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.8s cubic-bezier(.4,0,.2,1)",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                color: C.textSec,
                textAlign: "center",
                position: "absolute",
                bottom: 0,
                lineHeight: "12px",
              }}
            >
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- KPI Card ---------- */
function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
  highlight = false,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight
          ? `linear-gradient(135deg, ${color}22, ${C.card})`
          : C.card,
        border: `1px solid ${highlight ? color + "55" : C.border}`,
        borderRadius: 14,
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: color,
          borderRadius: "3px 0 0 3px",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, color: C.textSec, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ paddingLeft: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.text, lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 10, color, marginTop: 3, fontWeight: 600 }}>{sub}</div>
      </div>
    </div>
  );
}

/* ---------- Section Header ---------- */
function SectionHeader({ title, accent }: { title: string; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {accent && (
        <div
          style={{
            width: 4,
            height: 20,
            background: accent,
            borderRadius: 2,
          }}
        />
      )}
      <span style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: 0.3 }}>
        {title}
      </span>
    </div>
  );
}

/* ---------- Card wrapper ---------- */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BoldDashboard() {
  // Mock data mirroring real API shape
  const kpis = {
    alunos: 1247,
    professores: 84,
    turmas: 36,
    ocupacao: 87,
    aprovacao: 91,
    mediaGeral: 13.4,
  };

  const turnoData = [
    { label: "Manhã", value: 523, color: C.accent },
    { label: "Tarde", value: 418, color: C.gold },
    { label: "Noite", value: 306, color: C.purple },
  ];

  const admissaoData = [
    { label: "Admitidos", value: 892, color: C.success },
    { label: "Pendentes", value: 187, color: C.warning },
    { label: "Rejeitados", value: 68, color: C.danger },
    { label: "Em análise", value: 100, color: C.accent },
  ];

  const ocupacaoTurmas = [
    { label: "12ºA", value: 98, color: C.danger },
    { label: "11ºB", value: 95, color: C.warning },
    { label: "10ºA", value: 91, color: C.accent },
    { label: "11ºA", value: 87, color: C.accent },
    { label: "9ºB", value: 82, color: C.success },
    { label: "10ºC", value: 79, color: C.success },
    { label: "8ºA", value: 74, color: C.success },
    { label: "9ºA", value: 68, color: C.success },
  ];

  const alunosRisco = [
    { nome: "Carlos Mendes", turma: "11ºA", media: 7.2, assiduidade: 68 },
    { nome: "Ana Pinto", turma: "10ºB", media: 8.1, assiduidade: 71 },
    { nome: "João Ferreira", turma: "12ºA", media: 6.8, assiduidade: 63 },
    { nome: "Maria Costa", turma: "9ºB", media: 9.0, assiduidade: 74 },
  ];

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        color: C.text,
        padding: "12px 14px 40px",
      }}
    >
      {/* ── Indicador de função ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: C.textSec, fontWeight: 500, letterSpacing: 1 }}>
            DIRECÇÃO ESCOLAR
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginTop: 2 }}>
            Visão Estratégica
          </div>
        </div>
        <div
          style={{
            background: `${C.success}22`,
            border: `1px solid ${C.success}55`,
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 11,
            color: C.success,
            fontWeight: 700,
          }}
        >
          ● Ao vivo
        </div>
      </div>

      {/* ══════════════════════════════════════════
          KPI GRID  2 × 3
         ══════════════════════════════════════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <KpiCard
          icon="👥"
          label="Alunos"
          value={kformat(kpis.alunos)}
          sub="Matriculados"
          color={C.accent}
          highlight
        />
        <KpiCard
          icon="🎓"
          label="Professores"
          value={String(kpis.professores)}
          sub="Activos"
          color={C.success}
        />
        <KpiCard
          icon="📚"
          label="Turmas"
          value={String(kpis.turmas)}
          sub="Activas"
          color={C.gold}
        />
        <KpiCard
          icon="🏢"
          label="Ocupação"
          value={`${kpis.ocupacao}%`}
          sub="1083 / 1247 vagas"
          color={kpis.ocupacao >= 90 ? C.danger : C.warning}
          highlight
        />
        <KpiCard
          icon="✅"
          label="Aprovação"
          value={`${kpis.aprovacao}%`}
          sub="Taxa global"
          color={C.success}
          highlight
        />
        <KpiCard
          icon="🏅"
          label="Média Geral"
          value={String(kpis.mediaGeral)}
          sub="Escala 0 – 20"
          color={C.gold}
        />
      </div>

      {/* ══════════════════════════════════════════
          TAXA DE OCUPAÇÃO POR TURMA  (vertical bars)
         ══════════════════════════════════════════ */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Taxa de Ocupação por Turma" accent={C.danger} />
        <VBarChart bars={ocupacaoTurmas} height={150} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 4 }}>
          {[
            { label: "≥90%", color: C.danger },
            { label: "75–90%", color: C.warning },
            { label: "<75%", color: C.success },
          ].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
              <span style={{ fontSize: 10, color: C.textSec }}>{l.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ══════════════════════════════════════════
          ALUNOS POR TURNO
         ══════════════════════════════════════════ */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Distribuição por Turno" accent={C.accent} />
        <DonutChart
          segments={turnoData}
          size={150}
          stroke={26}
          label={kformat(kpis.alunos)}
          sublabel="total"
        />
      </Card>

      {/* ══════════════════════════════════════════
          PROCESSO DE ADMISSÃO
         ══════════════════════════════════════════ */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Processo de Admissão" accent={C.gold} />
        <DonutChart
          segments={admissaoData}
          size={150}
          stroke={26}
          label="1.247"
          sublabel="inscritos"
        />
      </Card>

      {/* ══════════════════════════════════════════
          OCUPAÇÃO HORIZONTAL BARS  (top 8)
         ══════════════════════════════════════════ */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Ranking de Ocupação" accent={C.warning} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ocupacaoTurmas.map((t) => (
            <HBar key={t.label} label={t.label} value={t.value} max={100} color={t.color} />
          ))}
        </div>
      </Card>

      {/* ══════════════════════════════════════════
          ALUNOS EM RISCO
         ══════════════════════════════════════════ */}
      <Card>
        <SectionHeader title="Alunos em Risco" accent={C.danger} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alunosRisco.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: C.card2,
                borderRadius: 10,
                padding: "10px 12px",
                border: `1px solid ${C.border}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.nome}</div>
                <div style={{ fontSize: 11, color: C.textSec }}>Turma {a.turma}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: a.media < 8 ? C.danger : C.warning,
                    }}
                  >
                    {a.media}
                  </div>
                  <div style={{ fontSize: 9, color: C.textSec }}>Média</div>
                </div>
                <div
                  style={{ width: 1, background: C.border, alignSelf: "stretch" }}
                />
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: a.assiduidade < 70 ? C.danger : C.warning,
                    }}
                  >
                    {a.assiduidade}%
                  </div>
                  <div style={{ fontSize: 9, color: C.textSec }}>Assid.</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
