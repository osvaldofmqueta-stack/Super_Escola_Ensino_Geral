/**
 * SIGA v3 — Seed de Aluno com Irregularidades + Fotos
 * ─────────────────────────────────────────────────────
 * • Cria aluno "Mário Santos" na 13ª GI-A com irregularidades múltiplas:
 *     - 4 propinas pendentes (urgente)
 *     - Bloqueado = true
 *     - RUPE activo
 *     - 2 mensagens financeiras não lidas
 *     - Notas negativas (nf=3 em Matemática e Programação)
 *     - 28 faltas injustificadas (urgente ≥ 25)
 * • Adiciona fotos (avatares) aos alunos demo e ao aluno irregular
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
const DATA_HOJE  = "2026-04-09";

// Avatares usando ui-avatars.com (funciona sem API key)
function avatar(nome, bg = "1A2B5F", cor = "fff") {
  const encoded = encodeURIComponent(nome);
  return `https://ui-avatars.com/api/?name=${encoded}&background=${bg}&color=${cor}&size=200&bold=true&format=png`;
}

// Avatares de placeholder realistas usando robohash e dicebear para variar
function avatarPhoto(seed, style = "personas") {
  return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&size=200`;
}

async function main() {
  const client = await pool.connect();
  try {
    // ── 1. FOTOS NOS ALUNOS DEMO ──────────────────────────────────────────────
    console.log("→ Fotos nos alunos demo...");
    const fotosDemo = [
      { id: "aluno-prim-001",  foto: avatarPhoto("joao-manuel",  "personas"), nome: "João Manuel Costa" },
      { id: "aluno-icilo-001", foto: avatarPhoto("maria-fernanda","personas"), nome: "Maria Fernanda Silva" },
      { id: "aluno-final-001", foto: avatarPhoto("carlos-tomas",  "personas"), nome: "Carlos Alberto Tomás" },
    ];
    for (const a of fotosDemo) {
      await client.query(`UPDATE public.alunos SET foto=$1 WHERE id=$2`, [a.foto, a.id]);
    }
    console.log("   ✓ 3 fotos demo actualizadas");

    // ── 2. FOTOS EM AMOSTRA DE ALUNOS EM MASSA ────────────────────────────────
    console.log("→ Fotos em amostra de alunos em massa (50 alunos)...");
    const amostraRes = await client.query(
      `SELECT id, nome, apelido, genero FROM public.alunos
       WHERE "numeroMatricula" LIKE 'BULK-%' ORDER BY "createdAt" LIMIT 50`
    );
    const styles = { M: "micah", F: "personas" };
    for (const a of amostraRes.rows) {
      const style = styles[a.genero] || "personas";
      const seed  = encodeURIComponent(`${a.nome}-${a.apelido}`);
      const foto  = `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&size=200`;
      await client.query(`UPDATE public.alunos SET foto=$1 WHERE id=$2`, [foto, a.id]);
    }
    console.log(`   ✓ ${amostraRes.rows.length} fotos de alunos em massa`);

    // ── 3. CRIAR ALUNO IRREGULAR ──────────────────────────────────────────────
    console.log("→ Aluno irregular — Mário Santos...");
    const IRREG_ID  = "aluno-irreg-001";
    const TURMA_13  = "turma-13-gi-a";
    const CURSO_GI  = "curso-gi";

    await client.query(
      `INSERT INTO public.alunos
         (id,"numeroMatricula",nome,apelido,"dataNascimento",genero,
          provincia,municipio,"turmaId","cursoId",
          "nomeEncarregado","telefoneEncarregado","emailEncarregado",
          ativo,bloqueado,"permitirAcessoComPendencia",foto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,true,false,$14)
       ON CONFLICT (id) DO UPDATE SET
         bloqueado=true, foto=EXCLUDED.foto`,
      [
        IRREG_ID, "MTR-GI-IRREG", "Mário", "Santos Ferreira",
        "2004-06-15", "M", "Luanda", "Cacuaco",
        TURMA_13, CURSO_GI,
        "António Santos", "+244 923 777 001", "enc.mario.santos@gmail.com",
        avatarPhoto("mario-santos-irreg", "bottts"),
      ]
    );
    console.log("   ✓ Aluno criado (bloqueado=true)");

    // ── 4. PROPINAS PENDENTES (4 meses) ──────────────────────────────────────
    console.log("→ Propinas pendentes (Jan, Fev, Mar, Abr)...");
    await client.query(`DELETE FROM public.pagamentos WHERE "alunoId"=$1`, [IRREG_ID]);

    // Matrícula paga (para ter acesso ao sistema)
    await client.query(
      `INSERT INTO public.pagamentos
         ("alunoId","taxaId",valor,data,mes,trimestre,ano,status,"metodoPagamento",referencia,observacao)
       VALUES ($1,'taxa-mat-iicilo',25000,'2026-01-10',null,null,'2026','pago','multicaixa','MAT-IRREG','Matrícula paga')`,
      [IRREG_ID]
    );
    // 4 propinas pendentes → urgente
    const mesesPendentes = [
      { mes: 1, data: "2026-01-15" },
      { mes: 2, data: "2026-02-14" },
      { mes: 3, data: "2026-03-13" },
      { mes: 4, data: "2026-04-09" },
    ];
    for (const m of mesesPendentes) {
      await client.query(
        `INSERT INTO public.pagamentos
           ("alunoId","taxaId",valor,data,mes,trimestre,ano,status,"metodoPagamento",observacao)
         VALUES ($1,'taxa-prop-iicilo',10000,$2,$3,null,'2026','pendente','multicaixa','Propina em atraso — não paga')`,
        [IRREG_ID, m.data, m.mes]
      );
    }
    console.log("   ✓ 4 propinas pendentes (Jan–Abr) → urgente");

    // ── 5. RUPE ACTIVO ────────────────────────────────────────────────────────
    console.log("→ RUPE activo...");
    await client.query(`DELETE FROM public.rupes WHERE "alunoId"=$1`, [IRREG_ID]);
    await client.query(
      `INSERT INTO public.rupes
         ("alunoId","taxaId",valor,referencia,"dataGeracao","dataValidade",status)
       VALUES ($1,'taxa-prop-iicilo',10000,'RUPE-2026-IRREG-001','2026-03-13','2026-04-30','ativo')`,
      [IRREG_ID]
    );
    console.log("   ✓ RUPE activo gerado");

    // ── 6. MENSAGENS FINANCEIRAS NÃO LIDAS ───────────────────────────────────
    console.log("→ Mensagens financeiras não lidas...");
    await client.query(`DELETE FROM public.mensagens_financeiras WHERE "alunoId"=$1`, [IRREG_ID]);
    const mensagens = [
      { tipo: "bloqueio", texto: "O seu acesso ao sistema foi bloqueado por falta de pagamento das propinas de Janeiro a Abril de 2026. Regularize a situação com urgência." },
      { tipo: "aviso",    texto: "Aviso final: caso não regularize as propinas em atraso até 20 de Abril de 2026, será emitida uma nota de débito formal e comunicado ao encarregado de educação." },
      { tipo: "rupe",     texto: "Foi gerada uma referência RUPE n.º RUPE-2026-IRREG-001 no valor de 10.000 AOA. Efectue o pagamento antes de 30 de Abril de 2026." },
    ];
    for (const m of mensagens) {
      await client.query(
        `INSERT INTO public.mensagens_financeiras
           ("alunoId",remetente,texto,data,lida,tipo)
         VALUES ($1,'Serviço Financeiro',$2,$3,false,$4)`,
        [IRREG_ID, m.texto, DATA_HOJE, m.tipo]
      );
    }
    console.log("   ✓ 3 mensagens financeiras não lidas");

    // ── 7. NOTAS NEGATIVAS ────────────────────────────────────────────────────
    console.log("→ Notas negativas (nf=3 em Matemática, nf=4 em Programação)...");
    await client.query(
      `DELETE FROM public.notas WHERE "alunoId"=$1 AND "anoLetivo"=$2`,
      [IRREG_ID, ANO_LETIVO]
    );
    const notasNeg = [
      { disc: "Língua Portuguesa",     profId: "prof-antonio", aval1:12,aval2:11,aval3:13,aval4:10,mac1:12,pp1:12,mt1:12,nf:12 },
      { disc: "Inglês",                profId: "prof-maria-h", aval1:10,aval2:11,aval3:10,aval4:12,mac1:10,pp1:11,mt1:11,nf:11 },
      { disc: "Matemática",            profId: "prof-carlos",  aval1:3, aval2:4, aval3:2, aval4:5, mac1:3, pp1:4, mt1:3, nf:3  },
      { disc: "Informática de Gestão", profId: "prof-pedro",   aval1:14,aval2:13,aval3:15,aval4:12,mac1:13,pp1:14,mt1:14,nf:14 },
      { disc: "Contabilidade Geral",   profId: "prof-fernanda",aval1:10,aval2:9, aval3:11,aval4:8, mac1:9, pp1:10,mt1:9, nf:9  },
      { disc: "Economia",              profId: "prof-fernanda",aval1:8, aval2:7, aval3:9, aval4:6, mac1:7, pp1:8, mt1:7, nf:7  },
      { disc: "Programação",           profId: "prof-pedro",   aval1:4, aval2:3, aval3:5, aval4:4, mac1:4, pp1:4, mt1:4, nf:4  },
      { disc: "Sistemas de Informação",profId: "prof-beatriz", aval1:11,aval2:10,aval3:12,aval4:11,mac1:11,pp1:11,mt1:11,nf:11 },
    ];
    for (const n of notasNeg) {
      for (const trim of [1, 2, 3]) {
        // Trimestre 3 com notas ainda piores
        const fator = trim === 3 ? 0 : trim === 2 ? 1 : 2;
        await client.query(
          `INSERT INTO public.notas
             ("alunoId","turmaId",disciplina,trimestre,
              aval1,aval2,aval3,aval4,aval5,aval6,aval7,aval8,
              mac1,pp1,ppt,mt1,nf,mac,
              "anoLetivo","professorId",data,"camposAbertos","pedidosReabertura")
           VALUES ($1,$2,$3,$4, $5,$6,$7,$8,0,0,0,0, $9,$10,$10,$11,$12,$9, $13,$14,$15,'[]'::jsonb,'[]'::jsonb)
           ON CONFLICT DO NOTHING`,
          [
            IRREG_ID, TURMA_13, n.disc, trim,
            n.aval1,n.aval2,n.aval3,n.aval4,
            n.mac1, n.pp1, n.mt1, n.nf,
            ANO_LETIVO, n.profId, DATA_HOJE
          ]
        );
      }
    }
    console.log("   ✓ Notas inseridas (Matemática nf=3, Programação nf=4, Economia nf=7)");

    // ── 8. FALTAS EXCESSIVAS (28 faltas injustificadas) ───────────────────────
    console.log("→ Faltas injustificadas (28 faltas)...");
    await client.query(`DELETE FROM public.presencas WHERE "alunoId"=$1`, [IRREG_ID]);

    const disciplinasFaltas = [
      "Matemática", "Programação", "Economia",
      "Contabilidade Geral", "Língua Portuguesa",
    ];
    // Gerar datas de dias úteis a partir de Fevereiro
    const datasAulas = [];
    const meses = [
      { m: 2, dias: [3,4,5,6,10,11,12,13,17,18,19,20,24,25,26,27] },
      { m: 3, dias: [3,4,5,6,10,11,12,13,17,18,19,20,24,25,26,27] },
    ];
    for (const { m, dias } of meses) {
      for (const d of dias) {
        datasAulas.push(`2026-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
      }
    }

    let faltasInseridas = 0;
    // Distribuir 28 faltas pelas disciplinas e datas
    for (let i = 0; i < 28; i++) {
      const disc = disciplinasFaltas[i % disciplinasFaltas.length];
      const data = datasAulas[i % datasAulas.length];
      await client.query(
        `INSERT INTO public.presencas
           ("alunoId","turmaId",disciplina,data,status,observacao)
         VALUES ($1,$2,$3,$4,'F','Falta injustificada')
         ON CONFLICT DO NOTHING`,
        [IRREG_ID, TURMA_13, disc, data]
      );
      faltasInseridas++;
    }
    console.log(`   ✓ ${faltasInseridas} faltas injustificadas → urgente (≥25)`);

    // ── 9. FOTOS EM PROFESSORES DEMO (actualizar utilizadores) ────────────────
    console.log("→ Fotos nos utilizadores staff...");
    const fotosStaff = [
      { email: "chefe.secretaria@escola.ao", nome: "Celeste Baptista"    },
      { email: "prof.silva@escola.ao",        nome: "António da Silva"   },
      { email: "prof.directora@escola.ao",    nome: "Beatriz Fernandes"  },
      { email: "director@escola.ao",          nome: "Amílcar Nzinga"     },
    ];
    // Adicionar coluna telefone se ainda não existir (para consistência)
    for (const s of fotosStaff) {
      // Não há coluna foto em utilizadores — só em alunos e professores
      // Actualizar foto nos professores ligados a esses emails
      await client.query(
        `UPDATE public.professores SET foto=$1 WHERE email=$2`,
        [avatarPhoto(s.nome.toLowerCase().replace(/ /g,"-"), "personas"), s.email]
      ).catch(() => {});
    }
    console.log("   ✓ Fotos de professores actualizadas");

    // ── SUMÁRIO ───────────────────────────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║         ✅  IRREGULARIDADES E FOTOS INSERIDAS!             ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  ALUNO IRREGULAR: Mário Santos Ferreira                    ║");
    console.log("║  Turma: 13ª GI-A  |  Matrícula: MTR-GI-IRREG              ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  Irregularidades activas:                                   ║");
    console.log("║  🔴 Bloqueado = true                                        ║");
    console.log("║  🔴 4 propinas pendentes (Jan–Abr) → URGENTE               ║");
    console.log("║  🔴 RUPE activo: RUPE-2026-IRREG-001                       ║");
    console.log("║  🔴 3 mensagens financeiras não lidas (bloqueio + aviso)   ║");
    console.log("║  🔴 Matemática nf=3, Programação nf=4 → URGENTE            ║");
    console.log("║  🔴 28 faltas injustificadas → URGENTE (≥25)               ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  Fotos: 3 alunos demo + 50 alunos em massa + 4 prof        ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

  } catch (err) {
    console.error("\n❌ Erro:", err.message, err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
