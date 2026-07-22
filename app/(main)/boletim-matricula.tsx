import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Modal, FlatList } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { useData, Aluno, Turma } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useLocalSearchParams } from 'expo-router';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '___/___/______';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function anoAtual(): string {
  return String(new Date().getFullYear());
}

// ─── QR Data Builder ─────────────────────────────────────────────────────────

function buildQrData(aluno: Aluno, turma: Turma | undefined, nomeEscola: string): string {
  return JSON.stringify({
    mat: aluno.numeroMatricula,
    nome: `${aluno.nome} ${aluno.apelido}`,
    turma: turma?.nome ?? '',
    classe: turma?.classe ?? '',
    anoLetivo: turma?.anoLetivo ?? '',
    escola: nomeEscola,
  });
}

// ─── Print HTML Generator ────────────────────────────────────────────────────

function generateBoletimHTML(
  aluno: Aluno,
  turma: Turma | undefined,
  nomeEscola: string,
  qrDataUrl: string,
  origin = '',
  municipioEscola = 'Luanda',
): string {
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  const classe = turma?.classe ?? '___';
  const turmaNome = turma?.nome ?? '___';
  const anoLetivo = turma?.anoLetivo ?? anoAtual();
  const nivel = turma?.nivel ?? '___';
  const turno = turma?.turno ?? '___';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Boletim de Matrícula — ${nomeCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
  }
  .page { width: 100%; }
  .header { text-align: center; margin-bottom: 4px; }
  .header p { font-size: 9.5pt; line-height: 1.5; }
  .header .bold { font-weight: bold; }
  .header .title { font-size: 11pt; font-weight: bold; margin-top: 4px; }
  .header-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 4px;
  }
  .header-text { flex: 1; text-align: center; }
  .qr-box {
    width: 90px;
    height: 90px;
    border: 1px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 2px;
    background: #fff;
  }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; }
  .qr-label { font-size: 6pt; text-align: center; margin-top: 2px; color: #333; }
  .boletim-num {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    font-size: 9.5pt;
    margin: 4px 0;
  }
  .alerta {
    background: #888;
    color: #fff;
    text-align: center;
    font-weight: bold;
    font-size: 9pt;
    padding: 3px 0;
    margin: 6px 0;
    letter-spacing: 0.5px;
  }
  .separator { border-top: 1px solid #000; margin: 5px 0; }
  .section-title {
    font-weight: bold;
    text-align: center;
    font-size: 9.5pt;
    margin: 5px 0 3px;
    text-decoration: underline;
  }
  .body-area {
    display: flex;
    gap: 6px;
  }
  .side-labels {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 7pt;
    text-align: center;
    width: 50px;
    flex-shrink: 0;
    padding-top: 20px;
  }
  .side-label-box {
    border: 1px solid #000;
    width: 46px;
    padding: 3px 2px;
    text-align: center;
    font-size: 7pt;
    margin-bottom: 4px;
  }
  .side-label-date { font-size: 7.5pt; margin-top: 2px; }
  .content-area { flex: 1; }
  .field-line {
    display: flex;
    align-items: baseline;
    gap: 3px;
    margin-bottom: 3px;
    flex-wrap: wrap;
    font-size: 9.5pt;
  }
  .field-line .label { white-space: nowrap; }
  .field-line .value {
    border-bottom: 1px solid #000;
    flex: 1;
    min-width: 60px;
    padding-bottom: 1px;
    font-size: 9.5pt;
  }
  .field-line .value.filled { font-weight: 500; }
  .multi-field {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 3px;
    font-size: 9.5pt;
  }
  .multi-field .item {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .multi-field .value {
    border-bottom: 1px solid #000;
    min-width: 50px;
    padding-bottom: 1px;
  }
  .bold-section { font-weight: bold; font-size: 10pt; margin: 5px 0 2px; }
  .declaracao {
    margin-top: 10px;
    border-top: 1px solid #000;
    padding-top: 8px;
  }
  .declaracao-title {
    font-weight: bold;
    text-align: center;
    font-size: 10pt;
    margin-bottom: 8px;
  }
  .decl-text { font-size: 9.5pt; line-height: 1.6; margin-bottom: 6px; text-align: justify; }
  .signature-area {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;
  }
  .sig-block { text-align: center; font-size: 9pt; }
  .sig-line {
    border-top: 1px solid #000;
    width: 180px;
    margin: 0 auto 3px;
    margin-top: 30px;
  }
  .local-data {
    text-align: center;
    margin: 10px 0;
    font-size: 9.5pt;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="header-row">
    <div style="width:50px;flex-shrink:0;"></div>
    <div class="header-text">
      <img src="${origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p>REPÚBLICA DE ANGOLA</p>
      <p>MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="bold">${nomeEscola}</p>
      <p class="title">BOLETIM DE MATRÍCULA N.º <span style="border-bottom:1px solid #000;padding:0 30px;">${aluno.numeroMatricula}</span></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="QR Code" />
      </div>
      <div class="qr-label">Nº ${aluno.numeroMatricula}</div>
    </div>
  </div>

  <!-- LINHA CLASSE/TURMA/ANO -->
  <div class="boletim-num">
    <span><strong>${classe}ª CLASSE</strong></span>
    <span>TURMA <strong>${turmaNome}</strong></span>
    <span>ANO LECTIVO DE <strong>${anoLetivo}</strong></span>
    <span>TURNO: <strong>${turno}</strong></span>
    <span>NÍVEL: <strong>${nivel}</strong></span>
  </div>

  <div class="alerta">PREENCHA SEM RASURAS E COM LETRA LEGÍVEL</div>

  <!-- CORPO PRINCIPAL -->
  <div class="body-area">
    <!-- Coluna lateral esquerda (assinaturas do director) -->
    <div class="side-labels">
      <div class="side-label-box">O Director<br/>da Escola</div>
      <div style="height:20px;border-left:1px solid #000;"></div>
      <div class="side-label-date">____/____/20____</div>
    </div>

    <!-- Conteúdo principal -->
    <div class="content-area">
      <div class="section-title">A — DADOS DO ALUNO</div>

      <div class="field-line">
        <span class="label">Nome completo</span>
        <span class="value filled">${nomeCompleto}</span>
        <span class="label">&nbsp;&nbsp;Data de nascimento:</span>
        <span class="value filled">${formatDate(aluno.dataNascimento)}</span>
      </div>

      <div class="field-line">
        <span class="label">Sexo</span>
        <span class="value filled">${aluno.genero === 'M' ? 'Masculino' : 'Feminino'}</span>
        <span class="label">&nbsp;&nbsp;Naturalidade:</span>
        <span class="value filled">${aluno.municipio}</span>
      </div>

      <div class="field-line">
        <span class="label">Distrito / Município</span>
        <span class="value filled">${aluno.municipio}</span>
        <span class="label">&nbsp;&nbsp;Província</span>
        <span class="value filled">${aluno.provincia}</span>
      </div>

      <div class="field-line">
        <span class="label">Filho(a) de</span>
        <span class="value"></span>
        <span class="label">&nbsp;e&nbsp;</span>
        <span class="value"></span>
      </div>

      <div class="field-line">
        <span class="label">Residência:</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Bairro</span>
        <span class="value"></span>
      </div>

      <div class="field-line">
        <span class="label">Cell</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Quarteirão</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Documentação de Identificação:</span>
      </div>

      <div class="multi-field">
        <div class="item"><span>BI</span>&nbsp;<span class="value"></span></div>
        <div class="item"><span>Cédula</span>&nbsp;<span class="value"></span></div>
        <div class="item"><span>Outros</span>&nbsp;<span class="value"></span></div>
        <div class="item"><span>Nº</span>&nbsp;<span class="value"></span></div>
        <div class="item"><span>Emitido aos</span>&nbsp;<span class="value" style="min-width:80px;"></span></div>
      </div>

      <div class="field-line">
        <span class="label">Pelo arquivo de Identificação civil de</span>
        <span class="value"></span>
      </div>

      <div class="field-line">
        <span class="label">Sofre de alguma doença crónica ou deficiência? Sim_______ Não_______ (Se sim, qual?</span>
        <span class="value"></span>
        <span>)</span>
      </div>

      <div class="field-line">
        <span class="label">É órfão de pai? Sim_____ Não_____</span>
        <span style="flex:1;"></span>
        <span class="label">É órfão de Mãe? Sim_____ Não_____</span>
      </div>

      <!-- DADOS DO ENCARREGADO -->
      <div class="bold-section">DADOS DO ENCARREGADO DE EDUCAÇÃO</div>

      <div class="field-line">
        <span class="label">Nome completo</span>
        <span class="value filled">${aluno.nomeEncarregado}</span>
      </div>

      <div class="field-line">
        <span class="label">Residência: Bairro</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Cell:</span>
        <span class="value filled">${aluno.telefoneEncarregado}</span>
        <span class="label">&nbsp;, Quarteirão</span>
        <span class="value"></span>
      </div>

      <div class="field-line">
        <span class="label">Av/Rua</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Nº</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Andar,</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Flat</span>
        <span class="value"></span>
        <span class="label">&nbsp;&nbsp;Local de Trabalho</span>
        <span class="value"></span>
      </div>

      <div class="field-line">
        <span class="label">Profissão</span>
        <span class="value"></span>
      </div>

      <!-- DADOS ESCOLARES -->
      <div class="bold-section">C — DADOS ESCOLARES</div>

      <div class="field-line">
        <span class="label">Escola que frequentou em 20</span>
        <span class="value"></span>
        <span>,</span>
      </div>

      <div class="multi-field">
        <div class="item"><span>Classe</span>&nbsp;<span class="value"></span></div>
        <div class="item"><span>, Turma</span>&nbsp;<span class="value"></span></div>
        <div class="item"><span>Nº</span>&nbsp;<span class="value"></span></div>
      </div>

      <!-- Assinatura do funcionário -->
      <div style="display:flex;justify-content:flex-end;margin-top:8px;font-size:9pt;gap:4px;">
        <span>${municipioEscola},</span>
        <span style="border-bottom:1px solid #000;min-width:30px;"></span>
        <span>de</span>
        <span style="border-bottom:1px solid #000;min-width:80px;"></span>
        <span>de 20</span>
        <span style="border-bottom:1px solid #000;min-width:30px;"></span>
      </div>
      <div style="text-align:center;font-size:9pt;margin-top:2px;">O Funcionário</div>
      <div style="border-top:1px solid #000;width:160px;margin:2px auto 0;"></div>
    </div>

    <!-- Coluna lateral direita (assinatura da secretaria) -->
    <div class="side-labels">
      <div class="side-label-box" style="font-style:italic;">Conferi<br/>O chefe da<br/>Secretaria</div>
      <div style="height:20px;border-left:1px solid #000;"></div>
      <div class="side-label-date">____/____/20____</div>
    </div>
  </div>

  <!-- DECLARAÇÃO SOB COMPROMISSO DE HONRA -->
  <div class="declaracao">
    <div class="declaracao-title">Declaração sob compromisso de honra</div>

    <div class="decl-text">
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:200px;">${nomeCompleto}</span>
      &nbsp;do sexo&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:80px;">${aluno.genero === 'M' ? 'Masculino' : 'Feminino'}</span>
      &nbsp;de nacionalidade&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">Angolana</span>,
      filho(a) de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:140px;"></span>
      &nbsp;e de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:140px;"></span>,
      nascido(a) aos&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;"></span>
      &nbsp;de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:80px;"></span>
      &nbsp;de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:40px;">${aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : ''}</span>,
      Município de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">${aluno.municipio}</span>,
      Província de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">${aluno.provincia}</span>,
      compromete-se a frequentar&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:60px;">${nivel}</span>
      &nbsp;Ciclo/Classe/Ano até à conclusão do mesmo e cumprir com o Regulamento Interno da Escola.
    </div>

    <div class="decl-text">
      Compromete-se igualmente, a conservar e devolver os livros e outros materiais de aprendizagem à escola, em condições de serem usados por outros alunos.
    </div>

    <div class="decl-text">
      O pai/encarregado de Educação compromete-se a fazer o acompanhamento regular do processo educativo do seu educando, participar em todos os encontros da Escola quando for <em>solicitado e sempre que necessário</em> e colaborar na conservação, manutenção e protecção do património da escola.
    </div>

    <!-- Assinaturas -->
    <div class="local-data">
      ${municipioEscola},&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;"></span>
      &nbsp;de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;"></span>
      &nbsp;de 20<span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;"></span>
    </div>

    <div class="signature-area">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>Assinatura do(a) Aluno(a)</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>Assinatura do Pai / Encarregado de Educação</div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BoletimMatriculaScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const { alunos, turmas } = useData();
  const { config } = useConfig();
  const { anoSelecionado } = useAnoAcademico();
  const { alunoId: alunoIdParam } = useLocalSearchParams<{ alunoId?: string }>();

  const [search, setSearch] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [showSearch, setShowSearch] = useState(true);
  const [printing, setPrinting] = useState(false);

  // Auto-select aluno when navigating from student profile
  useEffect(() => {
    if (!alunoIdParam || !alunos.length) return;
    const found = alunos.find(a => a.id === alunoIdParam);
    if (found && (!selectedAluno || selectedAluno.id !== found.id)) {
      setSelectedAluno(found);
      setSearch(`${found.nome} ${found.apelido}`);
      setShowSearch(false);
    }
  }, [alunoIdParam, alunos]);

  const qrSvgRef = useRef<any>(null);
  const qrContainerRef = useRef<View>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  // Stable callback ref for QRCode — avoids creating a new function on every render
  const qrGetRef = useCallback((ref: any) => { qrSvgRef.current = ref; }, []);

  const alunosFiltrados = useMemo(() => {
    if (!search.trim()) return alunos.filter(a => a.ativo).slice(0, 30);
    const s = search.toLowerCase();
    return alunos.filter(a =>
      a.ativo && (
        a.nome.toLowerCase().includes(s) ||
        a.apelido.toLowerCase().includes(s) ||
        a.numeroMatricula.toLowerCase().includes(s)
      )
    ).slice(0, 30);
  }, [alunos, search]);

  const turmaDoAluno = useMemo(() =>
    selectedAluno ? turmas.find(t => t.id === selectedAluno.turmaId) : undefined,
    [selectedAluno, turmas]
  );

  function handleSelectAluno(aluno: Aluno) {
    setSelectedAluno(aluno);
    setShowSearch(false);
    setQrDataUrl('');
  }

  function handlePrint() {
    if (!selectedAluno) return;
    setPrinting(true);

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(qrValue)}&bgcolor=ffffff&color=000000&margin=4&ecc=M`;

    const html = generateBoletimHTML(
      selectedAluno!,
      turmaDoAluno,
      config.nomeEscola,
      qrUrl,
      Platform.OS === 'web' ? window.location.origin : '',
      config.municipio || 'Luanda',
    );
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 600);
    }
    setPrinting(false);
  }

  const qrValue = selectedAluno
    ? buildQrData(selectedAluno, turmaDoAluno, config.nomeEscola)
    : 'QUETA';

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]}>
      <TopBar title="Boletim de Matrícula" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Painel de Pesquisa de Aluno ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="search" size={18} color={Colors.accent} />
            <Text style={styles.cardTitle}>Seleccionar Aluno</Text>
          </View>

          <View style={styles.searchRow}>
            <StableSearchInput
              value={search}
              onChangeText={v => { setSearch(v); setShowSearch(true); }}
              inputStyle={styles.searchInput}
              placeholder="Pesquisar por nome ou nº de matrícula..."
              iconColor={Colors.textMuted}
            />
            {selectedAluno && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => {
                setSelectedAluno(null);
                setSearch('');
                setShowSearch(true);
              }}>
                <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {showSearch && search.length > 0 && (
            <View style={styles.dropdownContainer}>
              <FlatList
                data={alunosFiltrados}
                keyExtractor={a => a.id}
                style={styles.dropdown}
                renderItem={({ item }) => {
                  const t = turmas.find(t => t.id === item.turmaId);
                  return (
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => { handleSelectAluno(item); setSearch(`${item.nome} ${item.apelido}`); }}
                    >
                      <View style={styles.dropdownIcon}>
                        <Ionicons name="person" size={14} color={Colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownName}>{item.nome} {item.apelido}</Text>
                        <Text style={styles.dropdownSub}>Matrícula: {item.numeroMatricula} · {t?.nome ?? '—'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyDropdown}>Nenhum aluno encontrado</Text>
                }
              />
            </View>
          )}
        </View>

        {/* ── Preview do Boletim ── */}
        {selectedAluno ? (
          <>
            {/* Botão de imprimir */}
            <TouchableOpacity
              style={[styles.printBtn, printing && styles.printBtnDisabled]}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <AppLoader color={Colors.text} size="small" />
              ) : (
                <Ionicons name="print" size={18} color={Colors.text} />
              )}
              <Text style={styles.printBtnText}>
                {printing ? 'A preparar...' : 'Imprimir / Exportar PDF'}
              </Text>
            </TouchableOpacity>

            {/* Cartão de resumo das variáveis */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="information-circle" size={18} color={Colors.info} />
                <Text style={styles.cardTitle}>Dados que serão preenchidos automaticamente</Text>
              </View>
              <View style={styles.varGrid}>
                {[
                  { label: 'Nº de Matrícula', value: selectedAluno.numeroMatricula },
                  { label: 'Nome Completo', value: `${selectedAluno.nome} ${selectedAluno.apelido}` },
                  { label: 'Data de Nascimento', value: formatDate(selectedAluno.dataNascimento) },
                  { label: 'Sexo', value: selectedAluno.genero === 'M' ? 'Masculino' : 'Feminino' },
                  { label: 'Município', value: selectedAluno.municipio },
                  { label: 'Província', value: selectedAluno.provincia },
                  { label: 'Encarregado', value: selectedAluno.nomeEncarregado },
                  { label: 'Telefone Enc.', value: selectedAluno.telefoneEncarregado },
                  { label: 'Turma', value: turmaDoAluno?.nome ?? '—' },
                  { label: 'Classe', value: turmaDoAluno?.classe ? `${turmaDoAluno.classe}ª` : '—' },
                  { label: 'Turno', value: turmaDoAluno?.turno ?? '—' },
                  { label: 'Nível', value: turmaDoAluno?.nivel ?? '—' },
                  { label: 'Ano Lectivo', value: turmaDoAluno?.anoLetivo ?? '—' },
                  { label: 'Escola', value: config.nomeEscola },
                ].map(v => (
                  <View key={v.label} style={styles.varRow}>
                    <Text style={styles.varLabel}>{v.label}</Text>
                    <Text style={styles.varValue}>{v.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Preview visual do boletim */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text" size={18} color={Colors.gold} />
                <Text style={styles.cardTitle}>Pré-visualização do Boletim</Text>
              </View>

              {/* Cabeçalho */}
              <View style={styles.previewHeader}>
                <View style={styles.previewHeaderText}>
                  <Text style={styles.previewHeaderLine}>REPÚBLICA DE ANGOLA</Text>
                  <Text style={styles.previewHeaderLine}>MINISTÉRIO DA EDUCAÇÃO</Text>
                  <Text style={[styles.previewHeaderLine, styles.bold]}>{config.nomeEscola}</Text>
                  <Text style={styles.previewTitle}>BOLETIM DE MATRÍCULA N.º {selectedAluno.numeroMatricula}</Text>
                </View>
                {/* QR Code */}
                <View style={styles.qrContainer} ref={qrContainerRef}>
                  <QRCode
                    value={qrValue}
                    size={80}
                    getRef={qrGetRef}
                    backgroundColor="#fff"
                    color="#000"
                  />
                  <Text style={styles.qrLabel}>Nº {selectedAluno.numeroMatricula}</Text>
                </View>
              </View>

              {/* Linha classe/turma/ano */}
              <View style={styles.previewSubHeader}>
                <Text style={styles.previewSubText}>{turmaDoAluno?.classe ?? '—'}ª CLASSE</Text>
                <Text style={styles.previewSubDivider}>|</Text>
                <Text style={styles.previewSubText}>TURMA {turmaDoAluno?.nome ?? '—'}</Text>
                <Text style={styles.previewSubDivider}>|</Text>
                <Text style={styles.previewSubText}>ANO LECTIVO {turmaDoAluno?.anoLetivo ?? anoAtual()}</Text>
              </View>

              <View style={styles.alertaBanner}>
                <Text style={styles.alertaText}>PREENCHA SEM RASURAS E COM LETRA LEGÍVEL</Text>
              </View>

              {/* Secção A */}
              <Text style={styles.sectionTitle}>A — DADOS DO ALUNO</Text>
              <PreviewRow label="Nome completo" value={`${selectedAluno.nome} ${selectedAluno.apelido}`} />
              <PreviewRow label="Data de nascimento" value={formatDate(selectedAluno.dataNascimento)} />
              <PreviewRow label="Sexo" value={selectedAluno.genero === 'M' ? 'Masculino' : 'Feminino'} />
              <PreviewRow label="Naturalidade / Município" value={selectedAluno.municipio} />
              <PreviewRow label="Província" value={selectedAluno.provincia} />
              <PreviewRow label="Filho(a) de" value="" />
              <PreviewRow label="Residência" value="" />
              <PreviewRow label="Documentação de Identificação (BI / Cédula)" value="" />
              <PreviewRow label="Sofre de doença crónica ou deficiência?" value="" />

              {/* Secção B */}
              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>B — DADOS DO ENCARREGADO DE EDUCAÇÃO</Text>
              <PreviewRow label="Nome completo" value={selectedAluno.nomeEncarregado} />
              <PreviewRow label="Telefone / Cell" value={selectedAluno.telefoneEncarregado} />
              <PreviewRow label="Residência / Bairro" value="" />
              <PreviewRow label="Profissão" value="" />

              {/* Secção C */}
              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>C — DADOS ESCOLARES</Text>
              <PreviewRow label="Escola que frequentou anteriormente" value="" />
              <PreviewRow label="Classe / Turma anterior" value="" />

              {/* Declaração */}
              <View style={styles.declaracaoBox}>
                <Text style={styles.declaracaoTitle}>Declaração sob compromisso de honra</Text>
                <Text style={styles.declaracaoText}>
                  {`${selectedAluno.nome} ${selectedAluno.apelido}`}, do sexo {selectedAluno.genero === 'M' ? 'Masculino' : 'Feminino'}, de nacionalidade Angolana, filho(a) de _____________ e de _____________, nascido(a) em {formatDate(selectedAluno.dataNascimento)}, Município de {selectedAluno.municipio}, Província de {selectedAluno.provincia}, compromete-se a frequentar {turmaDoAluno?.nivel ?? '___'} Ciclo/Classe/Ano até à conclusão do mesmo e cumprir com o Regulamento Interno da Escola.
                </Text>
              </View>

              {/* Assinaturas */}
              <View style={styles.signaturesRow}>
                <View style={styles.sigBlock}>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigLabel}>Assinatura do(a) Aluno(a)</Text>
                </View>
                <View style={styles.sigBlock}>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigLabel}>Assinatura do Pai / Encarregado</Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum aluno seleccionado</Text>
            <Text style={styles.emptyText}>
              Pesquise e seleccione um aluno para gerar o Boletim de Matrícula.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Preview Row ──────────────────────────────────────────────────────────────

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}:</Text>
      <View style={styles.previewValueBox}>
        <Text style={[styles.previewValue, value ? styles.previewValueFilled : {}]}>
          {value || ' '}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 10,
  },
  clearBtn: { padding: 4 },

  dropdownContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    maxHeight: 220,
    backgroundColor: Colors.backgroundElevated,
  },
  dropdown: { flex: 1 },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  dropdownIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownName: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  dropdownSub: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  emptyDropdown: {
    color: Colors.textMuted,
    fontSize: 13,
    padding: 14,
    textAlign: 'center',
  },

  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },

  varGrid: { gap: 4 },
  varRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  varLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    width: 130,
  },
  varValue: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },

  // Preview styles
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  previewHeaderText: { flex: 1 },
  previewHeaderLine: {
    color: Colors.text,
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
  previewTitle: {
    color: Colors.text,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginTop: 4,
  },
  bold: { fontFamily: 'Inter_700Bold' },
  qrContainer: { alignItems: 'center', gap: 4 },
  qrLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
  },

  previewSubHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  previewSubText: {
    color: Colors.text,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  previewSubDivider: {
    color: Colors.textMuted,
    fontSize: 11,
  },

  alertaBanner: {
    backgroundColor: Colors.textMuted,
    borderRadius: 4,
    paddingVertical: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  alertaText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },

  sectionTitle: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 6,
    textDecorationLine: 'underline',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  previewLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    width: 160,
    flexShrink: 0,
  },
  previewValueBox: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 2,
  },
  previewValue: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  previewValueFilled: {
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
  },

  declaracaoBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  declaracaoTitle: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  declaracaoText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
    textAlign: 'justify',
  },

  signaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 10,
  },
  sigBlock: { alignItems: 'center', gap: 6 },
  sigLine: {
    width: 140,
    height: 1,
    backgroundColor: Colors.textSecondary,
    marginBottom: 4,
  },
  sigLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});
