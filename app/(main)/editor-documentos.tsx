import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import {ActivityIndicator, Animated, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { Colors } from '@/constants/colors';
import DateInput from '@/components/DateInput';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { calcMFD_auto, calcNEN, classeParaNum, isClasseExame } from '@/lib/formulasDecreto';
import { calcularTransicaoAngola, isClasseICicloRestricao, isClasseIICicloRestricao } from '@/lib/angola-transicao';

// TinyMCE carregado de forma lazy para evitar TDZ (Temporal Dead Zone) no bundle
const TinyEditor = Platform.OS === 'web'
  ? lazy(() => import('@tinymce/tinymce-react').then(m => ({ default: m.Editor as any })))
  : null;

// ─── Types ─────────────────────────────────────────────────────────────────

type DocTipo = 'declaracao' | 'certificado' | 'atestado' | 'oficio' | 'pauta' | 'mini_pauta' | 'pauta_disciplina' | 'pauta_final' | 'ficha_matricula' | 'ficha_individual' | 'mapa_aproveitamento' | 'mapa_frequencias' | 'lista_turma' | 'certificado_primario' | 'ficha_inscricao' | 'boletim_matricula' | 'lista_admitidos' | 'lista_inscritos' | 'lista_resultados_admissao' | 'recibo_salario' | 'titulo_salario' | 'extrato_propina' | 'historico_academico' | 'relatorio_biblioteca' | 'comprovativo_matricula' | 'outro';
type Mode = 'list' | 'editor' | 'emit';

interface DocTemplate {
  id: string;
  nome: string;
  tipo: DocTipo;
  conteudo: string;
  criadoEm: string;
  atualizadoEm: string;
  insigniaBase64?: string;
  marcaAguaBase64?: string;
  cabecalhoNome?: string;
  cabecalhoExtra?: string;
  cabecalhoAlign?: 'left' | 'center' | 'right';
  classeAlvo?: string;
  bloqueado?: boolean;
  disponivelAluno?: boolean;
  eliminadoEm?: string;
}

// ─── Variables definition ───────────────────────────────────────────────────

type VariableDefinition = { tag: string; desc: string; exemplo: string };
type VariableGroup = { grupo: string; icon: string; cor: string; vars: VariableDefinition[] };

const VARIABLE_GROUPS: VariableGroup[] = [
  {
    grupo: 'Aluno',
    icon: 'person',
    cor: Colors.info,
    vars: [
      { tag: '{{NOME_COMPLETO}}', desc: 'Nome e apelido completos', exemplo: 'João Manuel Silva' },
      { tag: '{{NOME}}', desc: 'Primeiro nome', exemplo: 'João' },
      { tag: '{{APELIDO}}', desc: 'Apelido', exemplo: 'Silva' },
      { tag: '{{DATA_NASCIMENTO}}', desc: 'Data de nascimento', exemplo: '15/03/2005' },
      { tag: '{{GENERO}}', desc: 'Género', exemplo: 'Masculino' },
      { tag: '{{PROVINCIA}}', desc: 'Província de naturalidade', exemplo: 'Luanda' },
      { tag: '{{MUNICIPIO}}', desc: 'Município / Naturalidade', exemplo: 'Belas' },
      { tag: '{{NUMERO_MATRICULA}}', desc: 'Número de matrícula', exemplo: '2025001' },
      { tag: '{{NOME_ENCARREGADO}}', desc: 'Nome do encarregado de educação', exemplo: 'Manuel Silva' },
      { tag: '{{TELEFONE_ENCARREGADO}}', desc: 'Telefone do encarregado', exemplo: '+244 923 456 789' },
    ],
  },
  {
    grupo: 'Turma',
    icon: 'people',
    cor: Colors.success,
    vars: [
      { tag: '{{TURMA}}', desc: 'Nome da turma', exemplo: '10ª A' },
      { tag: '{{SALA}}', desc: 'Sala atribuída à turma', exemplo: 'Sala 12' },
      { tag: '{{CLASSE}}', desc: 'Classe', exemplo: '10ª Classe' },
      { tag: '{{NIVEL}}', desc: 'Nível de ensino', exemplo: 'II Ciclo' },
      { tag: '{{TURNO}}', desc: 'Turno', exemplo: 'Manhã' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo', exemplo: '2025' },
      { tag: '{{NOME_DIRECTOR_TURMA}}', desc: 'Nome do Director de Turma (professor responsável)', exemplo: 'Ana Pereira' },
      { tag: '{{COMPORTAMENTO}}', desc: 'Comportamento derivado das ocorrências disciplinares: Muito Bom (sem ocorrências) · Bom (leves) · Regular (moderadas) · Mau (graves)', exemplo: 'Muito Bom' },
    ],
  },
  {
    grupo: 'Escola',
    icon: 'school',
    cor: Colors.gold,
    vars: [
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome da escola', exemplo: 'Escola Secundária N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do Director Geral', exemplo: 'António Gomes' },
      { tag: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', desc: 'Nome do(a) Subdirector(a) / Director(a) Pedagógico(a) (configurado em Admin → Escola)', exemplo: 'Joaquim Manuel' },
      { tag: '{{NOME_DIRECTOR_PEDAGOGICO}}', desc: 'Nome do(a) Director(a) Pedagógico(a) (mesmo valor, alias mais curto)', exemplo: 'Joaquim Manuel' },
      { tag: '{{NOME_DIRECTOR_PROVINCIAL}}', desc: 'Nome do(a) Director(a) Provincial da Educação (configurado em Admin → Escola)', exemplo: 'Carlos Sebastião' },
      { tag: '{{CHEFE_SECRETARIA}}', desc: 'Nome do Chefe de Secretaria', exemplo: 'Maria da Silva' },
      { tag: '{{TELEFONE_ESCOLA}}', desc: 'Telefone(s) da Secretaria', exemplo: '974108813/952304725' },
      { tag: '{{EMAIL_ESCOLA}}', desc: 'E-mail da escola', exemplo: 'secretaria@escola.ao' },
      { tag: '{{MORADA_ESCOLA}}', desc: 'Morada da escola', exemplo: 'Rua da Escola, n.º 123, Luanda' },
    ],
  },
  {
    grupo: 'Data',
    icon: 'calendar',
    cor: Colors.warning,
    vars: [
      { tag: '{{DATA_ACTUAL}}', desc: 'Data actual completa', exemplo: '20 de Março de 2026' },
      { tag: '{{MES_ACTUAL}}', desc: 'Mês actual por extenso', exemplo: 'Março' },
      { tag: '{{ANO_ACTUAL}}', desc: 'Ano actual', exemplo: '2026' },
    ],
  },
  {
    grupo: 'Identificação',
    icon: 'card',
    cor: '#ec4899',
    vars: [
      { tag: '{{PAI}}', desc: 'Nome do pai', exemplo: 'Fernando Mpinge Kalute' },
      { tag: '{{MAE}}', desc: 'Nome da mãe', exemplo: 'Fernanda João' },
      { tag: '{{NATURALIDADE}}', desc: 'Local de nascimento', exemplo: 'Mucope Ombadja Xangongo' },
      { tag: '{{DIA_NASC}}', desc: 'Dia de nascimento', exemplo: '15' },
      { tag: '{{MES_NASC}}', desc: 'Mês de nascimento por extenso', exemplo: 'Março' },
      { tag: '{{ANO_NASC}}', desc: 'Ano de nascimento', exemplo: '2005' },
      { tag: '{{BI_NUMERO}}', desc: 'Número do Bilhete de Identidade', exemplo: '005895569555CE049' },
      { tag: '{{BI_DATA_EMISSAO}}', desc: 'Data de emissão do BI', exemplo: '03 de Janeiro de 2015' },
      { tag: '{{BI_LOCAL_EMISSAO}}', desc: 'Arquivo de identificação onde o BI foi emitido', exemplo: 'Luanda' },
      { tag: '{{ENCARREGADO_PROFISSAO}}', desc: 'Profissão do encarregado', exemplo: 'Professor' },
      { tag: '{{ENCARREGADO_LOCAL_TRABALHO}}', desc: 'Local de trabalho do encarregado', exemplo: 'Escola Primária N.º 5' },
      { tag: '{{ENCARREGADO_RESIDENCIA}}', desc: 'Residência do encarregado', exemplo: 'Rangel, Luanda' },
      { tag: '{{ENCARREGADO_CONTACTO2}}', desc: 'Segundo contacto do encarregado', exemplo: '+244 912 345 678' },
      { tag: '{{GENERO_FILHO}}', desc: 'Filho ou filha conforme o género do aluno (usado em certificados)', exemplo: 'filha' },
    ],
  },
  {
    grupo: 'Académico',
    icon: 'ribbon',
    cor: '#14b8a6',
    vars: [
      { tag: '{{AREA}}', desc: 'Área de estudos', exemplo: 'Ciências Económicas e Jurídicas' },
      { tag: '{{CICLO}}', desc: 'Ciclo de ensino', exemplo: 'IIº Ciclo' },
      { tag: '{{RESULTADO}}', desc: 'Resultado final', exemplo: 'APTO' },
      { tag: '{{RESULTADO_LETRA}}', desc: 'Resultado abreviado', exemplo: 'A' },
      { tag: '{{PAUTA_NUMERO}}', desc: 'Número da pauta', exemplo: '039' },
      { tag: '{{PROCESSO_NUMERO}}', desc: 'Número do processo (= Nº de matrícula do aluno)', exemplo: '858' },
      { tag: '{{CODIGO_BARRAS}}', desc: 'Código de barras Code39 com o número de matrícula do aluno (SVG embutido, imprimível sem internet)', exemplo: '<em>[Barcode gerado automaticamente]</em>' },
      { tag: '{{MEDIA_FINAL_EXTENSO}}', desc: 'Média final por extenso (em valores)', exemplo: 'Doze valores' },
      { tag: '{{TABELA_CERTIFICADO_II_CICLO}}', desc: 'Tabela de classificações do IIº Ciclo (10ª, 11ª, 12ª) agrupada por Formação geral, Formação específica e Disciplina Opcional — gerada automaticamente a partir das notas lançadas', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'Certificado',
    icon: 'medal',
    cor: '#1e3a5f',
    vars: [
      { tag: '{{LIVRO_REGISTO}}', desc: 'Número do livro de registo do certificado', exemplo: '53191AN2003' },
      { tag: '{{FOLHA_REGISTO}}', desc: 'Folha do livro de registo do certificado', exemplo: 'CH-2024/2025' },
      { tag: '{{NOME_DENOMINACAO}}', desc: 'Denominação / nome próprio da escola (ex: Ngola Kiluanje)', exemplo: 'Ngola Kiluanje' },
      { tag: '{{DECRETO_ESCOLA}}', desc: 'Número e data do Decreto Executivo de criação da escola', exemplo: '175/21 de 19 de Julho' },
    ],
  },
  {
    grupo: 'Mini-Pauta / Pauta',
    icon: 'document-text',
    cor: '#1a6b3c',
    vars: [
      { tag: '{{TABELA_MINI_PAUTA}}', desc: 'Tabela completa de notas dos alunos por trimestre e disciplina (gerada automaticamente ao emitir)', exemplo: '<em>[Tabela gerada automaticamente]</em>' },
      { tag: '{{LEGENDA_MINI_PAUTA}}', desc: 'Legenda das abreviaturas usadas na tabela (MAC, NPP, NPT, MT, etc.)', exemplo: '<em>[Legenda gerada automaticamente]</em>' },
      { tag: '{{NOME_PROFESSOR}}', desc: 'Nome do professor da turma / director de turma', exemplo: 'Ana Pereira' },
      { tag: '{{TRIMESTRE}}', desc: 'Número do trimestre seleccionado (1, 2 ou 3)', exemplo: '2' },
      { tag: '{{LOCAL_DATA}}', desc: 'Localidade e data actual (ex: Luanda, 20 de Março de 2026)', exemplo: 'Luanda, 20 de Março de 2026' },
    ],
  },
  {
    grupo: 'Notas',
    icon: 'school',
    cor: '#f97316',
    vars: [
      { tag: '{{TERMOS_DE_FREQUENCIA}}', desc: 'Tabelas de Termos de Frequência (10ª, 11ª e 12ª classe) agrupadas por Formação Geral, Formação Específica e Opções — mostra MT e Nota Final por trimestre + MFD — gerada automaticamente', exemplo: '<em>[Tabelas geradas automaticamente ao emitir]</em>' },
      { tag: '{{MAPA_ACADEMICO}}', desc: 'Mapa Académico completo do aluno — tabela por ano lectivo/classe com todas as disciplinas, notas por trimestre (MT e NF), MFD e situação (APROVADO/REPROVADO) — gerado automaticamente ao emitir', exemplo: '<em>[Mapa gerado automaticamente ao emitir]</em>' },
      { tag: '{{TABELA_NOTAS_II_CICLO}}', desc: 'Tabela de notas do IIº Ciclo (10ª–12ª classe) com todas as disciplinas e classificações por trimestre — gerada automaticamente ao emitir o boletim', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
      { tag: '{{TABELA_NOTAS_HORIZONTAL}}', desc: 'Tabela de notas horizontal (Ensino Primário / Iº Ciclo) com disciplinas, notas por trimestre e média — gerada automaticamente ao emitir', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
      { tag: '{{TABELA_NOTAS_FICHA}}', desc: 'Tabela resumida de notas para a Ficha de Reconfirmação de Matrícula — gerada automaticamente ao emitir', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
      { tag: '{{TABELA_NOTAS}}', desc: 'Tabela de notas genérica (usada em certificados ITAQ/13ª classe) — gerada automaticamente ao emitir', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'Mapa de Aproveitamento — Por Curso',
    icon: 'stats-chart',
    cor: '#065f46',
    vars: [
      { tag: '{{TRIMESTRE}}', desc: 'Número do trimestre (1, 2 ou 3)', exemplo: '3' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da escola', exemplo: '2023/24' },
      { tag: '{{NOME_CURSO}}', desc: 'Nome completo do curso selecionado', exemplo: 'Técnico de Produção Vegetal' },
      { tag: '{{REGIME}}', desc: 'Regime/Período das turmas (Manhã, Tarde, etc.)', exemplo: 'Manhã' },
      { tag: '{{MUNICIPIO}}', desc: 'Município da escola', exemplo: 'Luanda' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão do documento', exemplo: '27 de Abril de 2026' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome completo da escola', exemplo: 'Escola N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do director geral', exemplo: 'Maria Silva' },
      { tag: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', desc: 'Nome do subdirector pedagógico', exemplo: 'João Costa' },
      { tag: '{{TABELA_MAPA_APROVEITAMENTO_CURSO}}', desc: 'Tabela completa gerada automaticamente: Matriculados, Avaliados, Aprovados, Reprovados, Desistentes, Anulados, Transferidos, Excluídos e percentagens — por turma do curso seleccionado', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'Mapa de Aproveitamento — Por Curso e Classe',
    icon: 'stats-chart',
    cor: '#1a6b3c',
    vars: [
      { tag: '{{TRIMESTRE}}', desc: 'Número do trimestre (1, 2 ou 3)', exemplo: '2' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da escola', exemplo: '2023/24' },
      { tag: '{{REGIME}}', desc: 'Período/Regime das turmas', exemplo: 'Manhã' },
      { tag: '{{MUNICIPIO}}', desc: 'Município da escola', exemplo: 'Luanda' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão do documento', exemplo: '27 de Abril de 2026' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome completo da escola', exemplo: 'Escola N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do director geral', exemplo: 'Maria Silva' },
      { tag: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', desc: 'Nome do subdirector pedagógico', exemplo: 'João Costa' },
      { tag: '{{TABELA_MAPA_APROVEITAMENTO}}', desc: 'Tabela gerada automaticamente — Aprovados/Reprovados/D-AM-T-E por Curso e Classe (10ª–13ª)', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'Mapa de Frequências',
    icon: 'stats-chart',
    cor: '#1a2a6c',
    vars: [
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da escola', exemplo: '2023/24' },
      { tag: '{{REGIME}}', desc: 'Período/Regime das turmas', exemplo: 'Manhã' },
      { tag: '{{MUNICIPIO}}', desc: 'Município da escola', exemplo: 'Luanda' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão do documento', exemplo: '27 de Abril de 2026' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome completo da escola', exemplo: 'Escola N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do director geral', exemplo: 'Maria Silva' },
      { tag: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', desc: 'Nome do subdirector pedagógico', exemplo: 'João Costa' },
      { tag: '{{TABELA_MAPA_FREQUENCIAS}}', desc: 'Tabela gerada automaticamente — Nº de Turmas e Alunos Matriculados (M/F/Total) por Curso e Classe', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'Mapa de Aproveitamento — Ensino Primário (Tabela Oficial MED)',
    icon: 'stats-chart',
    cor: '#1a6b3c',
    vars: [
      { tag: '{{TRIMESTRE}}', desc: 'Número do trimestre (1, 2 ou 3)', exemplo: '2' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da escola', exemplo: '2023/24' },
      { tag: '{{REGIME}}', desc: 'Período/Regime das turmas', exemplo: 'Manhã' },
      { tag: '{{MUNICIPIO}}', desc: 'Município da escola', exemplo: 'Luanda' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão do documento', exemplo: '27 de Abril de 2026' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome completo da escola', exemplo: 'Escola N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do director geral', exemplo: 'Maria Silva' },
      { tag: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', desc: 'Nome do subdirector pedagógico', exemplo: 'João Costa' },
      { tag: '{{TABELA_MAPA_APROV_PRIMARIO}}', desc: 'Tabela gerada automaticamente — Ensino Primário (Iniciação a 6ª Classe): NÍVEL, CLASSE, Matriculados (M/F), Desistência (M/F), Avaliados (M/F), C/Aproveitamento (M/F/%), S/Aproveitamento (M/F/%), Nº Professores (M/F) + SUB-TOTAL', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'Mapa de Aproveitamento — I Ciclo (Tabela Oficial MED)',
    icon: 'stats-chart',
    cor: '#1a3c6b',
    vars: [
      { tag: '{{TRIMESTRE}}', desc: 'Número do trimestre (1, 2 ou 3)', exemplo: '2' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da escola', exemplo: '2023/24' },
      { tag: '{{REGIME}}', desc: 'Período/Regime das turmas', exemplo: 'Manhã' },
      { tag: '{{MUNICIPIO}}', desc: 'Município da escola', exemplo: 'Luanda' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão do documento', exemplo: '27 de Abril de 2026' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome completo da escola', exemplo: 'Escola N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do director geral', exemplo: 'Maria Silva' },
      { tag: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', desc: 'Nome do subdirector pedagógico', exemplo: 'João Costa' },
      { tag: '{{TABELA_MAPA_APROV_I_CICLO}}', desc: 'Tabela gerada automaticamente — I Ciclo (7ª a 9ª Classe): NÍVEL, CLASSE, Matriculados (M/F), Desistência (M/F), Avaliados (M/F), C/Aproveitamento (M/F/%), S/Aproveitamento (M/F/%), Nº Professores (M/F) + SUB-TOTAL', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
    ],
  },
  {
    grupo: 'PAP — 13ª Classe',
    icon: 'ribbon',
    cor: '#a855f7',
    vars: [
      { tag: '{{NOTA_PAP}}', desc: 'Nota PAP final calculada', exemplo: '14.5' },
      { tag: '{{NOTA_PAP_EXTENSO}}', desc: 'Nota PAP por extenso', exemplo: 'Catorze Valores' },
      { tag: '{{NOTA_ESTAGIO}}', desc: 'Nota do Estágio', exemplo: '15' },
      { tag: '{{NOTA_DEFESA}}', desc: 'Nota da Defesa / Oral', exemplo: '14' },
    ],
  },
  {
    grupo: 'Funcionário / RH',
    icon: 'briefcase',
    cor: '#10b981',
    vars: [
      { tag: '{{FUNC_NOME}}', desc: 'Nome completo do funcionário', exemplo: 'António Manuel da Silva' },
      { tag: '{{FUNC_CARGO}}', desc: 'Cargo do funcionário', exemplo: 'Professor' },
      { tag: '{{FUNC_CATEGORIA}}', desc: 'Categoria / nível', exemplo: 'Técnico Superior' },
      { tag: '{{MES_ANO_FOLHA}}', desc: 'Mês e ano da folha de salário', exemplo: 'Março 2026' },
      { tag: '{{SALARIO_BASE}}', desc: 'Salário base (Kz)', exemplo: '150.000,00 Kz' },
      { tag: '{{SUB_ALIMENTACAO}}', desc: 'Subsídio de alimentação (Kz)', exemplo: '15.000,00 Kz' },
      { tag: '{{SUB_TRANSPORTE}}', desc: 'Subsídio de transporte (Kz)', exemplo: '10.000,00 Kz' },
      { tag: '{{SUB_HABITACAO}}', desc: 'Subsídio de habitação (Kz)', exemplo: '20.000,00 Kz' },
      { tag: '{{OUTROS_SUBSIDIOS}}', desc: 'Outros subsídios (Kz)', exemplo: '0,00 Kz' },
      { tag: '{{SALARIO_BRUTO}}', desc: 'Total bruto (Kz)', exemplo: '195.000,00 Kz' },
      { tag: '{{INSS_EMPREGADO}}', desc: 'INSS empregado 3% (Kz)', exemplo: '4.500,00 Kz' },
      { tag: '{{IRT}}', desc: 'IRT — tabela progressiva (Kz)', exemplo: '12.000,00 Kz' },
      { tag: '{{OUTROS_DESCONTOS}}', desc: 'Outros descontos (Kz)', exemplo: '0,00 Kz' },
      { tag: '{{TOTAL_DESCONTOS}}', desc: 'Total de descontos (Kz)', exemplo: '16.500,00 Kz' },
      { tag: '{{SALARIO_LIQUIDO}}', desc: 'Salário líquido a receber (Kz)', exemplo: '178.500,00 Kz' },
      { tag: '{{INSS_PATRONAL}}', desc: 'INSS patronal 8% — informativo (Kz)', exemplo: '12.000,00 Kz' },
      { tag: '{{STATUS_FOLHA}}', desc: 'Estado da folha de salário', exemplo: 'Aprovada' },
      { tag: '{{NUM_FALTAS_INJ}}', desc: 'Nº faltas injustificadas descontadas', exemplo: '2' },
      { tag: '{{NUM_MEIO_DIA}}', desc: 'Nº faltas meio-dia descontadas', exemplo: '1' },
      { tag: '{{DESCONTO_FALTAS}}', desc: 'Valor descontado por faltas (Kz)', exemplo: '6.000,00 Kz' },
      { tag: '{{NUM_TEMPOS}}', desc: 'Nº tempos lectivos / dias trabalhados', exemplo: '42' },
      { tag: '{{REMUNERACAO_TEMPOS}}', desc: 'Remuneração por tempos lectivos (Kz)', exemplo: '21.000,00 Kz' },
      { tag: '{{QR_CODE}}', desc: 'Código QR de autenticidade (imagem inline)', exemplo: '<img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=QUETA-DOC-EXEMPLO" style="width:80px;height:80px"/>' },
    ],
  },
  {
    grupo: 'Tabela de Notas',
    icon: 'grid',
    cor: '#7c3aed',
    vars: [
      {
        tag: '{{TABELA_NOTAS}}',
        desc: 'Tabela completa de notas (Disciplina | Nota | Por Extenso | Resultado)',
        exemplo: `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;"><thead><tr><th style="padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:left;font-size:12px;">Disciplina</th><th style="padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:center;width:55px;font-size:12px;">Nota</th><th style="padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:left;font-size:12px;">Por Extenso</th><th style="padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:center;width:90px;font-size:12px;">Resultado</th></tr></thead><tbody><tr><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;">Língua Portuguesa</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;">14</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;">Catorze Valores</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;color:#166534;">Aprovado</td></tr><tr><td style="padding:6px 10px;border:1px solid #ccc;background:#f5f6fb;">Matemática</td><td style="padding:6px 10px;border:1px solid #ccc;background:#f5f6fb;text-align:center;font-weight:bold;">12</td><td style="padding:6px 10px;border:1px solid #ccc;background:#f5f6fb;">Doze Valores</td><td style="padding:6px 10px;border:1px solid #ccc;background:#f5f6fb;text-align:center;font-weight:bold;color:#166534;">Aprovado</td></tr><tr><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;">Educação Física</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;">16</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;">Dezasseis Valores</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;color:#166534;">Aprovado</td></tr></tbody><tfoot><tr style="background:#eef2ff;"><td colspan="2" style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;">Média Final</td><td colspan="2" style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;">14 — Catorze Valores</td></tr></tfoot></table>`,
      },
      {
        tag: '{{TABELA_NOTAS_SIMPLES}}',
        desc: 'Tabela simples de notas (Disciplina | Nota)',
        exemplo: `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;"><thead><tr><th style="padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:left;font-size:12px;">Disciplina</th><th style="padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:center;width:60px;font-size:12px;">Nota</th></tr></thead><tbody><tr><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;">Língua Portuguesa</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;">14</td></tr><tr><td style="padding:6px 10px;border:1px solid #ccc;background:#f5f6fb;">Matemática</td><td style="padding:6px 10px;border:1px solid #ccc;background:#f5f6fb;text-align:center;font-weight:bold;">12</td></tr><tr><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;">Educação Física</td><td style="padding:6px 10px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;">16</td></tr></tbody><tfoot><tr style="background:#eef2ff;"><td style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;">Média Final</td><td style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;text-align:center;">14</td></tr></tfoot></table>`,
      },
      {
        tag: '{{TABELA_NOTAS_2COL}}',
        desc: 'Tabela de notas em 2 colunas lado a lado (compacta, ideal para declarações)',
        exemplo: `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;"><tbody><tr><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;width:38%;">Língua Portuguesa</td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;width:12%;">14</td><td style="padding:5px 8px;border:none;width:2%;"></td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;width:38%;">Matemática</td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;width:10%;">12</td></tr></tbody></table>`,
      },
      {
        tag: '{{TABELA_NOTAS_3COL}}',
        desc: 'Tabela de notas em 3 colunas lado a lado (muito compacta, para muitas disciplinas)',
        exemplo: `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;"><tbody><tr><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;width:27%;">Língua Portuguesa</td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;width:6%;">14</td><td style="padding:5px 8px;border:none;width:1%;"></td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;width:27%;">Matemática</td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;width:6%;">12</td><td style="padding:5px 8px;border:none;width:1%;"></td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;width:27%;">Educação Física</td><td style="padding:5px 8px;border:1px solid #ccc;background:#fff;text-align:center;font-weight:bold;width:5%;">16</td></tr></tbody></table>`,
      },
      {
        tag: '{{TABELA_NOTAS_HORIZONTAL}}',
        desc: 'Tabela horizontal — disciplinas no cabeçalho e notas finais numa linha (formato Boletim)',
        exemplo: `<table style="width:100%;border-collapse:collapse;margin:10px 0;font-family:'Times New Roman',serif;"><thead><tr><th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:left;font-size:12px;">Disciplina</th><th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-size:12px;">L.Port</th><th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-size:12px;">Mat</th><th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-size:12px;">Est.Meio</th><th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-size:12px;">Ed.Fis</th><th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-size:12px;">Comport.</th></tr></thead><tbody><tr><td style="padding:5px 6px;border:1px solid #000;font-size:12px;">Notas</td><td style="padding:5px 6px;border:1px solid #000;text-align:center;font-weight:bold;font-size:12px;">14</td><td style="padding:5px 6px;border:1px solid #000;text-align:center;font-weight:bold;font-size:12px;">12</td><td style="padding:5px 6px;border:1px solid #000;text-align:center;font-weight:bold;font-size:12px;">15</td><td style="padding:5px 6px;border:1px solid #000;text-align:center;font-weight:bold;font-size:12px;">16</td><td style="padding:5px 6px;border:1px solid #000;text-align:center;font-size:12px;">Bom</td></tr></tbody></table>`,
      },
      {
        tag: '{{TABELA_NOTAS_II_CICLO}}',
        desc: 'Tabela oficial do Boletim II Ciclo — Nº | Disciplinas | MAC NPT MT1 | MAC NPT MT2 | MAC NPT MT3 | Obs. (3 trimestres lado a lado, formato Angola)',
        exemplo: `<table style="width:100%;border-collapse:collapse;font-size:9pt;"><thead><tr><th rowspan="2" style="border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;">Nº</th><th rowspan="2" style="border:1px solid #000;padding:3px 2px;text-align:left;font-weight:bold;font-size:8pt;background:#efefef;">Disciplinas</th><th colspan="3" style="border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;">NOTAS DO Iº TRIMESTRE</th><th colspan="3" style="border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;">NOTAS DO IIº TRIMESTRE</th><th colspan="3" style="border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;">NOTAS DO IIIº TRIMESTRE</th><th rowspan="2" style="border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;">Obs.</th></tr><tr><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">MAC</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">NPT</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">MT1</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">MAC</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">NPT</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">MT2</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">MAC</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">NPT</th><th style="border:1px solid #000;padding:2px;text-align:center;font-size:8pt;background:#efefef;">MT3</th></tr></thead><tbody><tr><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">1</td><td style="border:1px solid #000;padding:3px 5px;text-align:left;font-size:9pt;">Língua Portuguesa</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">12</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">14</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">13</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">11</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">13</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;">12</td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;"></td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;"></td><td style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;"></td><td style="border:1px solid #000;padding:3px 4px;text-align:left;font-size:8pt;">&nbsp;</td></tr></tbody></table>`,
      },
      {
        tag: '{{MEDIA_GERAL}}',
        desc: 'Média geral final do aluno (número)',
        exemplo: '14',
      },
      {
        tag: '{{MEDIA_GERAL_EXTENSO}}',
        desc: 'Média geral final por extenso',
        exemplo: 'Catorze Valores',
      },
    ],
  },
  {
    grupo: 'Comprovativo de Matrícula',
    icon: 'school',
    cor: '#16a34a',
    vars: [
      { tag: '{{NOME_COMPLETO}}', desc: 'Nome completo do aluno', exemplo: 'João Manuel Silva' },
      { tag: '{{NUMERO_MATRICULA}}', desc: 'Número de matrícula do aluno', exemplo: '2025001' },
      { tag: '{{BI_NUMERO}}', desc: 'Número do BI ou Cédula pessoal do aluno', exemplo: '005895569555CE049' },
      { tag: '{{DATA_NASCIMENTO}}', desc: 'Data de nascimento formatada (DD/MM/AAAA)', exemplo: '15/03/2005' },
      { tag: '{{GENERO}}', desc: 'Género por extenso', exemplo: 'Masculino' },
      { tag: '{{CLASSE}}', desc: 'Classe do aluno', exemplo: '10ª' },
      { tag: '{{TURMA}}', desc: 'Nome da turma', exemplo: '10ª A — Turma 2025' },
      { tag: '{{NIVEL}}', desc: 'Nível de ensino', exemplo: 'II Ciclo' },
      { tag: '{{TURNO}}', desc: 'Turno', exemplo: 'Manhã' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da matrícula', exemplo: '2025/2026' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome completo da escola', exemplo: 'Escola Secundária N.º 1' },
      { tag: '{{NOME_DIRECTOR}}', desc: 'Nome do director geral', exemplo: 'Maria Silva' },
      { tag: '{{MUNICIPIO}}', desc: 'Município da escola', exemplo: 'Luanda' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão do comprovativo', exemplo: '10 de Julho de 2026' },
      { tag: '{{TABELA_PLANO_CURRICULAR}}', desc: 'Tabela com disciplinas e carga horária da classe/curso do aluno — gerada automaticamente ao emitir a partir dos dados reais da turma', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
      { tag: '{{TABELA_DEFICIENCIAS}}', desc: 'Tabela de disciplinas com deficiência (média 7–9 val.) conforme Art. 23º §10 do Decreto 04/2026 — gerada automaticamente ao emitir; só aparece se existirem deficiências', exemplo: '<em>[Tabela gerada automaticamente ao emitir — omitida se sem deficiências]</em>' },
    ],
  },
  {
    grupo: 'Extracto de Propinas',
    icon: 'cash',
    cor: '#0d9488',
    vars: [
      { tag: '{{TOTAL_PAGO}}', desc: 'Total pago pelo aluno (Kz)', exemplo: '75.000,00 Kz' },
      { tag: '{{TOTAL_PENDENTE}}', desc: 'Total de propinas em atraso (Kz)', exemplo: '15.000,00 Kz' },
      { tag: '{{TOTAL_CANCELADO}}', desc: 'Total de pagamentos cancelados (Kz)', exemplo: '0,00 Kz' },
      { tag: '{{TOTAL_TRANSACCOES}}', desc: 'Número total de transacções', exemplo: '9' },
      { tag: '{{PERIODO_INICIO}}', desc: 'Data de início do período do extracto', exemplo: '01/01/2025' },
      { tag: '{{PERIODO_FIM}}', desc: 'Data de fim do período do extracto', exemplo: '31/12/2025' },
      { tag: '{{DOC_REF}}', desc: 'Referência única do documento', exemplo: 'EXTR-2025001-ABC123' },
    ],
  },
  {
    grupo: 'Histórico Académico',
    icon: 'time',
    cor: '#4f46e5',
    vars: [
      {
        tag: '{{HISTORICO_ANOS}}',
        desc: 'Blocos completos de histórico por ano lectivo (com notas por trimestre e situação)',
        exemplo: `<div style="margin:14px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;"><div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1a2b5f;"><span style="font-size:11pt;font-weight:700;color:white;">2024</span><span style="font-size:7.5pt;font-weight:700;padding:2px 8px;border-radius:20px;background:#16a34a20;color:#16a34a;border:1px solid #16a34a50;">Aprovado</span><span style="margin-left:auto;font-size:8pt;color:#cbd5e1;">Média: <strong>13.5</strong></span></div><div style="padding:5px 10px;font-size:8.5pt;font-weight:600;background:#3b82f620;border-left:4px solid #3b82f6;color:#3b82f6;">1º Trimestre — Média: 13.5</div><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="background:#f1f5f9;font-size:7.5pt;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:left;">Disciplina</th><th style="background:#f1f5f9;font-size:7.5pt;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">MAC</th><th style="background:#f1f5f9;font-size:7.5pt;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">PP</th><th style="background:#f1f5f9;font-size:7.5pt;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">PT</th><th style="background:#f1f5f9;font-size:7.5pt;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">NF</th></tr></thead><tbody><tr><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;">Língua Portuguesa</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">11.5</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">14</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">13</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#16a34a;">14</td></tr></tbody></table></div>`,
      },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome da escola (já disponível em Escola)', exemplo: 'Escola Secundária N.º 1' },
      { tag: '{{NOME_COMPLETO}}', desc: 'Nome completo do aluno (já disponível em Aluno)', exemplo: 'João Manuel Silva' },
      { tag: '{{NUMERO_MATRICULA}}', desc: 'Número de matrícula (já disponível em Aluno)', exemplo: '2025001' },
      { tag: '{{TURMA}}', desc: 'Turma actual (já disponível em Turma)', exemplo: '10ª A' },
      { tag: '{{CLASSE}}', desc: 'Classe actual (já disponível em Turma)', exemplo: '10ª Classe' },
      { tag: '{{TURNO}}', desc: 'Turno (já disponível em Turma)', exemplo: 'Manhã' },
      { tag: '{{NOME_ENCARREGADO}}', desc: 'Encarregado de educação (já disponível em Aluno)', exemplo: 'Manuel Silva' },
      { tag: '{{DATA_ACTUAL}}', desc: 'Data de emissão actual (já disponível em Data)', exemplo: '30 de Março de 2026' },
    ],
  },
  {
    grupo: 'Ficha Individual do Aluno',
    icon: 'document-text',
    cor: '#0f172a',
    vars: [
      { tag: '{{TOOLBAR}}', desc: 'Barra superior com botões "Imprimir/PDF", "Reimprimir" e "Fechar" (gerada automaticamente; não imprime)', exemplo: '<div class="toolbar">[botões]</div>' },
      { tag: '{{LOGO_HTML}}', desc: 'Logótipo da escola (img tag) ou caixa com inicial quando não há logótipo', exemplo: '<img class="logo" src="..."/>' },
      { tag: '{{LINHA_CONTACTO_ESCOLA}}', desc: 'Linha composta: morada · telefone · email (vazia se nada definido)', exemplo: 'Rua da Escola, Luanda · 974108813 · secretaria@escola.ao' },
      { tag: '{{BADGE_EMISSAO}}', desc: 'Etiqueta indicando 1ª emissão original ou reimpressão Nº X', exemplo: '<div>1ª EMISSÃO (ORIGINAL)</div>' },
      { tag: '{{TITULO_DOC}}', desc: 'Título do documento — "FICHA INDIVIDUAL DO ALUNO" ou com sufixo trimestral', exemplo: 'FICHA INDIVIDUAL DO ALUNO — 2º TRIMESTRE' },
      { tag: '{{AVATAR_HTML}}', desc: 'Foto do aluno (img tag) ou iniciais quando não há foto', exemplo: 'JS' },
      { tag: '{{AVATAR_BG}}', desc: 'Cor de fundo do avatar (rosa para F, azul para M)', exemplo: '#3b82f6' },
      { tag: '{{DATA_NASCIMENTO_AVATAR}}', desc: 'Etiqueta com a data de nascimento por baixo do avatar (vazio se sem data)', exemplo: '<div class="avatar-birth">15/03/2005</div>' },
      { tag: '{{NOME_COMPLETO}}', desc: 'Nome completo do aluno', exemplo: 'João Manuel Silva' },
      { tag: '{{NUMERO_MATRICULA}}', desc: 'Número de matrícula', exemplo: '2025001' },
      { tag: '{{DATA_NASCIMENTO}}', desc: 'Data de nascimento formatada pt-PT', exemplo: '15/03/2005' },
      { tag: '{{IDADE}}', desc: 'Idade calculada em anos', exemplo: '20' },
      { tag: '{{GENERO}}', desc: 'Género por extenso', exemplo: 'Masculino' },
      { tag: '{{PROVINCIA}}', desc: 'Província de naturalidade', exemplo: 'Luanda' },
      { tag: '{{MUNICIPIO}}', desc: 'Município de naturalidade', exemplo: 'Belas' },
      { tag: '{{BI}}', desc: 'Número de BI ou Cédula', exemplo: '005895569555CE049' },
      { tag: '{{NOME_PAI}}', desc: 'Nome do pai', exemplo: 'Manuel Silva' },
      { tag: '{{NOME_MAE}}', desc: 'Nome da mãe', exemplo: 'Maria João' },
      { tag: '{{SITUACAO}}', desc: 'Situação académica (Activo, Concluído, Desistente, etc.)', exemplo: 'Activo' },
      { tag: '{{SITUACAO_COR}}', desc: 'Cor da situação (verde activo, azul concluído, vermelho outros)', exemplo: '#16a34a' },
      { tag: '{{BARCODE_IMG}}', desc: 'Código de barras Code128 do número de matrícula (img tag)', exemplo: '<img src="https://barcode.tec-it.com/..."/>' },
      { tag: '{{TURMA}}', desc: 'Nome da turma', exemplo: '10ª A' },
      { tag: '{{CLASSE}}', desc: 'Classe', exemplo: '10ª Classe' },
      { tag: '{{TURNO}}', desc: 'Turno', exemplo: 'Manhã' },
      { tag: '{{NIVEL}}', desc: 'Nível de ensino', exemplo: 'II Ciclo' },
      { tag: '{{SALA}}', desc: 'Sala atribuída', exemplo: 'Sala 12' },
      { tag: '{{ANO_LECTIVO}}', desc: 'Ano lectivo da turma', exemplo: '2025' },
      { tag: '{{CURSO}}', desc: 'Curso ou área de formação ("Ensino Geral" se não houver)', exemplo: 'Ciências Económicas e Jurídicas' },
      { tag: '{{AREA_FORMACAO}}', desc: 'Área de formação do curso (alias de {{ÁREA}})', exemplo: 'Ciências Económicas e Jurídicas' },
      { tag: '{{CLASSE_NUMERO}}', desc: 'Número da classe (só o número, sem "ª")', exemplo: '10' },
      { tag: '{{CLASSE_TEXTO}}', desc: 'Classe com sufixo "Classe"', exemplo: '10ª Classe' },
      { tag: '{{TELEFONE_ALUNO}}', desc: 'Telefone/contacto do aluno', exemplo: '+244 923 456 789' },
      { tag: '{{CONTACTO_ALUNO}}', desc: 'Contacto do aluno (alias de {{TELEFONE_ALUNO}})', exemplo: '+244 923 456 789' },
      { tag: '{{MUNICIPIO_TITULO}}', desc: 'Administração Municipal de <Município>', exemplo: 'Administração Municipal de Luanda' },
      { tag: '{{DATA_MATRICULA}}', desc: 'Data de matrícula formatada', exemplo: '02/09/2024' },
      { tag: '{{ENCARREGADO_NOME}}', desc: 'Nome do encarregado', exemplo: 'Manuel Silva' },
      { tag: '{{ENCARREGADO_TELEFONE}}', desc: 'Telefone do encarregado', exemplo: '+244 923 456 789' },
      { tag: '{{ENCARREGADO_EMAIL}}', desc: 'Email do encarregado', exemplo: 'manuel@email.com' },
      { tag: '{{ENCARREGADO_PROFISSAO}}', desc: 'Profissão do encarregado', exemplo: 'Professor' },
      { tag: '{{ENCARREGADO_LOCAL_TRABALHO}}', desc: 'Local de trabalho do encarregado', exemplo: 'Escola Primária N.º 5' },
      { tag: '{{ENCARREGADO_RESIDENCIA}}', desc: 'Residência do encarregado', exemplo: 'Rangel, Luanda' },
      { tag: '{{TITULO_NOTAS}}', desc: 'Título da secção de notas (Anual: "NOTAS DISCRIMINADAS — Ano" / Trimestral: "NOTAS DO Xº TRIMESTRE — Ano")', exemplo: 'NOTAS DISCRIMINADAS — 2025' },
      { tag: '{{TABELA_NOTAS_FICHA}}', desc: 'Tabela completa de notas — colunas variam consoante anual (MT1/MT2/MT3 + NF1/NF2/NF3 + MFD + Situação) ou trimestral (MAC, PG1, PG2, MT, NF, Situação). Inclui linha azul de Média Geral e total de aprovados', exemplo: '<em>[Tabela gerada automaticamente ao emitir]</em>' },
      { tag: '{{ASSIDUIDADE_TITULO}}', desc: 'Título da secção de assiduidade (acrescenta "(acumulada do ano lectivo)" no modo trimestral)', exemplo: 'ASSIDUIDADE' },
      { tag: '{{ASSIDUIDADE_PRESENCAS}}', desc: 'Total de presenças', exemplo: '142' },
      { tag: '{{ASSIDUIDADE_FALTAS_J}}', desc: 'Faltas justificadas', exemplo: '3' },
      { tag: '{{ASSIDUIDADE_FALTAS_I}}', desc: 'Faltas injustificadas', exemplo: '5' },
      { tag: '{{ASSIDUIDADE_PERCENT}}', desc: 'Percentagem de assiduidade', exemplo: '94.7%' },
      { tag: '{{ASSIDUIDADE_CLASS}}', desc: 'Classe CSS do cartão de assiduidade (ok ≥75%, warn ≥50%, bad <50%)', exemplo: 'ok' },
      { tag: '{{FINANCEIRO_TITULO}}', desc: 'Título da secção financeira (acrescenta "(acumulada do ano lectivo)" no modo trimestral)', exemplo: 'SITUAÇÃO FINANCEIRA' },
      { tag: '{{FIN_PAGAMENTOS}}', desc: 'Número de pagamentos efectuados', exemplo: '9' },
      { tag: '{{FIN_PENDENCIAS}}', desc: 'Número de pendências', exemplo: '0' },
      { tag: '{{FIN_TOTAL_PAGO}}', desc: 'Total pago em AOA', exemplo: '75.000 AOA' },
      { tag: '{{FIN_ESTADO}}', desc: 'Estado financeiro ("Em dia" / "Em atraso")', exemplo: 'Em dia' },
      { tag: '{{FIN_PEND_CLASS}}', desc: 'Classe CSS do cartão de pendências (ok se 0, bad se > 0)', exemplo: 'ok' },
      { tag: '{{FIN_ESTADO_CLASS}}', desc: 'Classe CSS do cartão de estado (ok se em dia, bad se em atraso)', exemplo: 'ok' },
      { tag: '{{FIN_SALDO}}', desc: 'Saldo actual da conta-corrente do aluno em AOA (vem da tabela saldo_alunos)', exemplo: '5.000 AOA' },
      { tag: '{{FIN_SALDO_CLASS}}', desc: 'Classe CSS do cartão de saldo (ok se positivo, bad se negativo, vazio se zero)', exemplo: 'ok' },
      { tag: '{{QR_VERIFICACAO}}', desc: 'QR Code de verificação de autenticidade (img tag)', exemplo: '<img src="https://api.qrserver.com/..."/>' },
      { tag: '{{URL_VERIFICACAO}}', desc: 'URL pública de verificação', exemplo: 'https://escola.com/api/alunos/.../ficha/verificar?h=abc123' },
      { tag: '{{HASH_VERIFICACAO}}', desc: 'Hash determinístico SHA-256 (12 chars) que valida a ficha', exemplo: 'abc123def456' },
      { tag: '{{NUMERO_EMISSAO}}', desc: 'Número sequencial de emissão (1ª original, depois reimpressões)', exemplo: '1' },
      { tag: '{{DIRECTOR_PEDAGOGICO}}', desc: 'Nome do(a) Subdirector(a) Pedagógico(a) (config_geral)', exemplo: 'Joaquim Manuel' },
      { tag: '{{DIRECTOR_GERAL}}', desc: 'Nome do(a) Director(a) Geral (config_geral)', exemplo: 'António Gomes' },
      { tag: '{{NOME_ESCOLA}}', desc: 'Nome da escola (config_geral)', exemplo: 'Escola Secundária N.º 1' },
      { tag: '{{DATA_EMISSAO}}', desc: 'Data e hora completas da emissão (pt-PT)', exemplo: '20 de Março de 2026 às 14:32' },
    ],
  },
];

function normalizeDisciplinaToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
}

function buildNotaTagFromDisciplina(nome: string, codigo?: string): string {
  const token = normalizeDisciplinaToken(codigo || nome);
  return `{{NOTA_${token || 'DISCIPLINA'}}}`;
}

function buildDisciplinaNotaVars(disciplinasCatalogo: any[]): VariableDefinition[] {
  const seen = new Set<string>();
  return disciplinasCatalogo
    .filter(d => d && d.nome && d.ativo !== false)
    .map(d => ({
      tag: buildNotaTagFromDisciplina(String(d.nome), d.codigo ? String(d.codigo) : undefined),
      desc: String(d.nome),
      exemplo: '14',
    }))
    .filter(v => {
      if (seen.has(v.tag)) return false;
      seen.add(v.tag);
      return true;
    });
}

function buildVariableGroups(disciplinasCatalogo: any[]): VariableGroup[] {
  const notaVars = buildDisciplinaNotaVars(disciplinasCatalogo);
  return VARIABLE_GROUPS.map(group =>
    group.grupo === 'Notas'
      ? { ...group, vars: notaVars }
      : group
  );
}

function computeComportamento(ocorrencias: { gravidade: string }[]): string {
  if (ocorrencias.length === 0) return 'Muito Bom';
  const gravs = ocorrencias.map(o => o.gravidade);
  if (gravs.includes('grave')) return 'Mau';
  if (gravs.includes('moderada')) return 'Regular';
  return 'Bom';
}

function buildVariableExampleMap(groups: VariableGroup[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const group of groups) {
    for (const v of group.vars) {
      map[v.tag] = v.exemplo;
    }
  }
  return map;
}

const HISTORICO_ACADEMICO_DEFAULT = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9pt;max-width:210mm;margin:0 auto;">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px;border-bottom:3px solid #1a2b5f;padding-bottom:8px;">
    <div style="width:54px;height:54px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:20pt;font-weight:900;flex-shrink:0;">E</div>
    <div style="flex:1;">
      <div style="font-size:14pt;font-weight:700;color:#1a2b5f;">{{NOME_ESCOLA}}</div>
      <div style="font-size:7.5pt;color:#6b7280;margin-top:2px;letter-spacing:1px;">SISTEMA INTEGRADO DE GESTÃO ACADÉMICA</div>
    </div>
    <div style="text-align:right;padding:8px 12px;background:#1a2b5f;color:white;border-radius:6px;min-width:130px;">
      <div style="font-size:6pt;letter-spacing:2px;opacity:.7;">DOCUMENTO OFICIAL</div>
      <div style="font-size:9.5pt;font-weight:700;">HISTÓRICO ACADÉMICO</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0;background:#f8fafc;border-radius:6px;padding:8px 12px;border:1px solid #e2e8f0;">
    <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Nome Completo</div><div style="font-size:9pt;font-weight:600;color:#1e293b;">{{NOME_COMPLETO}}</div></div>
    <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Nº de Matrícula</div><div style="font-size:9pt;font-weight:600;color:#1e293b;">{{NUMERO_MATRICULA}}</div></div>
    <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Turma Actual</div><div style="font-size:9pt;font-weight:600;color:#1e293b;">{{TURMA}} · {{CLASSE}}</div></div>
    <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Turno</div><div style="font-size:9pt;font-weight:600;color:#1e293b;">{{TURNO}}</div></div>
    <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Encarregado de Educação</div><div style="font-size:9pt;font-weight:600;color:#1e293b;">{{NOME_ENCARREGADO}}</div></div>
    <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Data de Emissão</div><div style="font-size:9pt;font-weight:600;color:#1e293b;">{{DATA_ACTUAL}}</div></div>
  </div>

  {{HISTORICO_ANOS}}

  <div style="display:flex;justify-content:space-around;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;gap:20px;">
    <div style="text-align:center;flex:1;">
      <div style="border-top:1px solid #374151;margin:20px 10px 4px;"></div>
      <div style="font-size:7pt;color:#6b7280;">Director(a) Pedagógico(a)</div>
    </div>
    <div style="text-align:center;flex:1;">
      <div style="border-top:1px solid #374151;margin:20px 10px 4px;"></div>
      <div style="font-size:7pt;color:#6b7280;">Director(a) Geral</div>
    </div>
    <div style="text-align:center;flex:1;">
      <div style="border-top:1px solid #374151;margin:20px 10px 4px;"></div>
      <div style="font-size:7pt;color:#6b7280;">Encarregado de Educação</div>
    </div>
  </div>

  <div style="text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:10px;border-top:1px dashed #e5e7eb;padding-top:6px;">
    Emitido em {{DATA_ACTUAL}} · {{NOME_ESCOLA}} · Documento Oficial · Lei n.º 17/16 Angola
  </div>
</div>`;

const RECIBO_SALARIO_DEFAULT = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9pt;max-width:210mm;margin:0 auto;padding:20px;">
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1a2b5f;padding-bottom:10px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:52px;height:52px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:18pt;font-weight:900;">E</div>
      <div>
        <div style="font-size:13pt;font-weight:700;color:#1a2b5f;">{{NOME_ESCOLA}}</div>
        <div style="font-size:7pt;color:#6b7280;letter-spacing:1px;margin-top:2px;">SISTEMA INTEGRADO DE GESTÃO ACADÉMICA</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:6pt;letter-spacing:2px;color:#6b7280;text-transform:uppercase;">Documento Oficial</div>
      <div style="font-size:12pt;font-weight:800;color:#1a2b5f;margin-top:2px;">RECIBO DE VENCIMENTO</div>
      <div style="font-size:9pt;color:#6b7280;">{{MES_ANO_FOLHA}}</div>
    </div>
  </div>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
    <div style="font-size:7pt;font-weight:700;color:#1a2b5f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">Dados do Funcionário</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
      <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Nome Completo</div><div style="font-size:9pt;font-weight:600;">{{FUNC_NOME}}</div></div>
      <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Cargo</div><div style="font-size:9pt;font-weight:600;">{{FUNC_CARGO}}</div></div>
      <div><div style="font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Categoria</div><div style="font-size:9pt;font-weight:600;">{{FUNC_CATEGORIA}}</div></div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:8.5pt;">
    <thead>
      <tr>
        <th style="background:#1a2b5f;color:#fff;padding:7px 10px;text-align:left;font-size:8pt;">VENCIMENTOS</th>
        <th style="background:#1a2b5f;color:#fff;padding:7px 10px;text-align:right;width:140px;">VALOR (Kz)</th>
        <th style="background:#7f1d1d;color:#fff;padding:7px 10px;text-align:left;width:140px;font-size:8pt;">DESCONTOS</th>
        <th style="background:#7f1d1d;color:#fff;padding:7px 10px;text-align:right;width:140px;">VALOR (Kz)</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#fff;">
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Salário Base</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SALARIO_BASE}}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">INSS Empregado (3%)</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{INSS_EMPREGADO}}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Subsídio Alimentação</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SUB_ALIMENTACAO}}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">IRT (tabela progressiva)</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{IRT}}</td>
      </tr>
      <tr style="background:#fff;">
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Subsídio Transporte</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SUB_TRANSPORTE}}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Faltas ({{NUM_FALTAS_INJ}} inj. + {{NUM_MEIO_DIA}} meio-dia)</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{DESCONTO_FALTAS}}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Subsídio Habitação</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SUB_HABITACAO}}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Outros Descontos</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{OUTROS_DESCONTOS}}</td>
      </tr>
      <tr style="background:#fff;">
        <td style="padding:6px 10px;border:1px solid #e2e8f0;">Tempos Lectivos ({{NUM_TEMPOS}} unid.)</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">{{REMUNERACAO_TEMPOS}}</td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;"></td>
        <td style="padding:6px 10px;border:1px solid #e2e8f0;"></td>
      </tr>
      <tr style="background:#eef2ff;">
        <td style="padding:7px 10px;border:1px solid #c7d2fe;font-weight:700;color:#1a2b5f;">TOTAL BRUTO</td>
        <td style="padding:7px 10px;border:1px solid #c7d2fe;text-align:right;font-weight:700;color:#1a2b5f;">{{SALARIO_BRUTO}}</td>
        <td style="padding:7px 10px;border:1px solid #c7d2fe;font-weight:700;color:#dc2626;">TOTAL DESCONTOS</td>
        <td style="padding:7px 10px;border:1px solid #c7d2fe;text-align:right;font-weight:700;color:#dc2626;">{{TOTAL_DESCONTOS}}</td>
      </tr>
    </tbody>
  </table>

  <div style="display:flex;justify-content:space-between;align-items:center;background:#1a2b5f;color:#fff;border-radius:8px;padding:12px 18px;margin-bottom:14px;">
    <div>
      <div style="font-size:7.5pt;opacity:0.7;letter-spacing:1.5px;text-transform:uppercase;">Salário Líquido a Receber</div>
      <div style="font-size:18pt;font-weight:800;margin-top:2px;">{{SALARIO_LIQUIDO}}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:7pt;opacity:0.7;">Estado da Folha</div>
      <div style="font-size:10pt;font-weight:700;margin-top:2px;">{{STATUS_FOLHA}}</div>
      <div style="font-size:7pt;opacity:0.6;margin-top:6px;">INSS Patronal (8%): {{INSS_PATRONAL}}</div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;gap:20px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div>{{QR_CODE}}</div>
      <div style="font-size:7pt;color:#9ca3af;">Escaneie para<br/>verificar autenticidade</div>
    </div>
    <div style="flex:1;display:flex;justify-content:space-around;">
      <div style="text-align:center;">
        <div style="border-top:1px solid #374151;margin:30px 10px 4px;width:120px;"></div>
        <div style="font-size:7pt;color:#6b7280;">Responsável RH</div>
      </div>
      <div style="text-align:center;">
        <div style="border-top:1px solid #374151;margin:30px 10px 4px;width:120px;"></div>
        <div style="font-size:7pt;color:#6b7280;">Director(a) Geral</div>
      </div>
    </div>
  </div>

  <div style="text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:14px;border-top:1px dashed #e5e7eb;padding-top:6px;">
    Emitido em {{DATA_ACTUAL}} · {{NOME_ESCOLA}} · Documento Oficial · QUETA v3
  </div>
</div>`;

const TITULO_SALARIO_DEFAULT = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9pt;max-width:210mm;margin:0 auto;padding:20px;">
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1a2b5f;padding-bottom:10px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:52px;height:52px;background:#1a2b5f;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:18pt;font-weight:900;">E</div>
      <div>
        <div style="font-size:13pt;font-weight:700;color:#1a2b5f;">{{NOME_ESCOLA}}</div>
        <div style="font-size:7pt;color:#6b7280;letter-spacing:1px;margin-top:2px;">SISTEMA INTEGRADO DE GESTÃO ACADÉMICA</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:6pt;letter-spacing:2px;color:#6b7280;text-transform:uppercase;">Documento Oficial</div>
      <div style="font-size:12pt;font-weight:800;color:#1a2b5f;margin-top:2px;">TÍTULO DE SALÁRIO</div>
      <div style="font-size:9pt;color:#6b7280;">{{MES_ANO_FOLHA}}</div>
    </div>
  </div>

  <p style="font-size:9pt;text-align:justify;line-height:1.7;margin-bottom:14px;">
    A <strong>{{NOME_ESCOLA}}</strong> certifica que <strong>{{FUNC_NOME}}</strong>, exercendo o cargo de
    <strong>{{FUNC_CARGO}}</strong>{{FUNC_CATEGORIA}}, tem direito ao processamento salarial referente
    ao período de <strong>{{MES_ANO_FOLHA}}</strong>, conforme discriminado abaixo:
  </p>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:14px;">
    <div style="font-size:7pt;font-weight:700;color:#1a2b5f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Discriminação Salarial</div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5pt;">
      <tbody>
        <tr><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#374151;">Salário Base</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SALARIO_BASE}}</td></tr>
        <tr style="background:#fff;"><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#374151;">Subsídio Alimentação</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SUB_ALIMENTACAO}}</td></tr>
        <tr><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#374151;">Subsídio Transporte</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SUB_TRANSPORTE}}</td></tr>
        <tr style="background:#fff;"><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#374151;">Subsídio Habitação</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">{{SUB_HABITACAO}}</td></tr>
        <tr><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1a2b5f;">Salário Bruto</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#1a2b5f;">{{SALARIO_BRUTO}}</td></tr>
        <tr style="background:#fff;"><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#dc2626;">— INSS Empregado (3%)</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{INSS_EMPREGADO}}</td></tr>
        <tr><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#dc2626;">— IRT (tabela progressiva)</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{IRT}}</td></tr>
        <tr style="background:#fff;"><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#dc2626;">— Desconto Faltas</td><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626;">{{DESCONTO_FALTAS}}</td></tr>
        <tr style="background:#eef2ff;"><td style="padding:7px 8px;font-weight:800;color:#1a2b5f;font-size:10pt;">LÍQUIDO A RECEBER</td><td style="padding:7px 8px;text-align:right;font-weight:800;color:#1a2b5f;font-size:10pt;">{{SALARIO_LIQUIDO}}</td></tr>
      </tbody>
    </table>
  </div>

  <p style="font-size:9pt;text-align:justify;line-height:1.7;margin-bottom:20px;">
    O presente título é emitido para os devidos efeitos legais, em conformidade com a legislação laboral angolana vigente.
  </p>

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;gap:20px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div>{{QR_CODE}}</div>
      <div style="font-size:7pt;color:#9ca3af;">Código de verificação<br/>de autenticidade</div>
    </div>
    <div style="flex:1;display:flex;justify-content:space-around;">
      <div style="text-align:center;">
        <div style="border-top:1px solid #374151;margin:30px 10px 4px;width:120px;"></div>
        <div style="font-size:7pt;color:#6b7280;">Responsável RH</div>
      </div>
      <div style="text-align:center;">
        <div style="border-top:1px solid #374151;margin:30px 10px 4px;width:120px;"></div>
        <div style="font-size:7pt;color:#6b7280;">Director(a) Geral</div>
      </div>
    </div>
  </div>

  <div style="text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:14px;border-top:1px dashed #e5e7eb;padding-top:6px;">
    Emitido em {{DATA_ACTUAL}} · {{NOME_ESCOLA}} · Documento Oficial · QUETA v3
  </div>
</div>`;

// Template da Ficha Individual — 100% estilos inline + tabelas, sem `<style>`
// nem classes CSS. O TinyMCE preserva tudo sem ter de manter um <head>/<style>
// (que ele remove silenciosamente). Todas as variáveis {{...}} continuam a ser
// substituídas pelo servidor em `server/ficha-aluno-routes.ts`.
const FICHA_INDIVIDUAL_DEFAULT = `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:210mm;margin:0 auto;padding:8mm 10mm;background:#fff;">

  <table style="width:100%;border:none;border-collapse:collapse;border-bottom:2px solid #0f172a;margin-bottom:10px;">
    <tr>
      <td style="width:62px;border:none;vertical-align:middle;padding:0 8px 6px 0;">{{LOGO_HTML}}</td>
      <td style="border:none;text-align:center;vertical-align:middle;padding:0 0 6px 0;">
        <div style="font-size:9px;text-transform:uppercase;color:#475569;letter-spacing:0.5px;">República de Angola — Ministério da Educação</div>
        <div style="font-size:14px;font-weight:bold;text-transform:uppercase;color:#0f172a;margin-top:2px;">{{NOME_ESCOLA}}</div>
        <div style="font-size:8px;color:#64748b;margin-top:2px;">{{LINHA_CONTACTO_ESCOLA}}</div>
      </td>
      <td style="width:160px;border:none;text-align:right;vertical-align:middle;padding:0 0 6px 8px;">{{BADGE_EMISSAO}}</td>
    </tr>
  </table>

  <div style="text-align:center;font-size:16px;font-weight:bold;color:#0f172a;margin:8px 0 12px;background:#f1f5f9;padding:8px;border-radius:6px;letter-spacing:1px;">{{TITULO_DOC}}</div>

  <table style="width:100%;border:1px solid #cbd5e1;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin-bottom:10px;">
    <tr>
      <td style="width:120px;border:none;vertical-align:top;padding:10px;text-align:center;">
        <div style="width:100px;height:128px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:bold;border:2px solid #fff;box-shadow:0 0 0 1px #cbd5e1;overflow:hidden;background:{{AVATAR_BG}};color:#fff;margin:0 auto;">{{AVATAR_HTML}}</div>
        <div style="margin-top:4px;">{{DATA_NASCIMENTO_AVATAR}}</div>
      </td>
      <td style="border:none;vertical-align:top;padding:10px 6px;">
        <h3 style="font-size:14px;color:#0f172a;margin:0 0 4px;font-weight:bold;">{{NOME_COMPLETO}}</h3>
        <div style="font-size:11px;color:#475569;margin-bottom:8px;">Nº de Matrícula: <strong style="color:#0f172a;">{{NUMERO_MATRICULA}}</strong></div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
          <tr>
            <td style="color:#64748b;font-weight:600;width:24%;padding:3px 6px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">Data de Nascimento</td>
            <td style="padding:3px 12px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{DATA_NASCIMENTO}} ({{IDADE}} anos)</td>
            <td style="color:#64748b;font-weight:600;width:18%;padding:3px 6px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">Género</td>
            <td style="padding:3px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{GENERO}}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-weight:600;padding:3px 6px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">Província</td>
            <td style="padding:3px 12px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{PROVINCIA}}</td>
            <td style="color:#64748b;font-weight:600;padding:3px 6px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">Município</td>
            <td style="padding:3px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{MUNICIPIO}}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-weight:600;padding:3px 6px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">Nº BI / Cédula</td>
            <td style="padding:3px 12px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{BI}}</td>
            <td style="color:#64748b;font-weight:600;padding:3px 6px 3px 0;border:none;border-bottom:1px dotted #cbd5e1;">Situação</td>
            <td style="padding:3px 0;border:none;border-bottom:1px dotted #cbd5e1;color:{{SITUACAO_COR}};font-weight:bold;">{{SITUACAO}}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-weight:600;padding:3px 6px 3px 0;border:none;">Pai</td>
            <td style="padding:3px 12px 3px 0;border:none;">{{NOME_PAI}}</td>
            <td style="color:#64748b;font-weight:600;padding:3px 6px 3px 0;border:none;">Mãe</td>
            <td style="padding:3px 0;border:none;">{{NOME_MAE}}</td>
          </tr>
        </table>
      </td>
      <td style="width:170px;border:none;vertical-align:middle;padding:10px;text-align:center;">
        {{BARCODE_IMG}}
        <div style="font-size:10px;color:#475569;margin-top:2px;font-family:'Courier New',monospace;letter-spacing:1px;">{{NUMERO_MATRICULA}}</div>
      </td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:bold;background:#0f172a;color:#fff;padding:5px 10px;border-radius:4px;margin:12px 0 6px;letter-spacing:0.5px;">DADOS ACADÉMICOS</div>
  <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <tr>
      <td style="color:#64748b;font-weight:600;width:24%;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Turma</td>
      <td style="padding:4px 12px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{TURMA}}</td>
      <td style="color:#64748b;font-weight:600;width:18%;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Classe</td>
      <td style="padding:4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{CLASSE}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Turno</td>
      <td style="padding:4px 12px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{TURNO}}</td>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Nível</td>
      <td style="padding:4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{NIVEL}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Sala</td>
      <td style="padding:4px 12px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{SALA}}</td>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Ano Lectivo</td>
      <td style="padding:4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{ANO_LECTIVO}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;">Curso / Área</td>
      <td style="padding:4px 12px 4px 0;border:none;">{{CURSO}}</td>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;">Data de Matrícula</td>
      <td style="padding:4px 0;border:none;">{{DATA_MATRICULA}}</td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:bold;background:#0f172a;color:#fff;padding:5px 10px;border-radius:4px;margin:12px 0 6px;letter-spacing:0.5px;">ENCARREGADO DE EDUCAÇÃO</div>
  <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <tr>
      <td style="color:#64748b;font-weight:600;width:24%;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Nome</td>
      <td style="padding:4px 12px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{ENCARREGADO_NOME}}</td>
      <td style="color:#64748b;font-weight:600;width:18%;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Telefone</td>
      <td style="padding:4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{ENCARREGADO_TELEFONE}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Email</td>
      <td style="padding:4px 12px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{ENCARREGADO_EMAIL}}</td>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;border-bottom:1px dotted #cbd5e1;">Profissão</td>
      <td style="padding:4px 0;border:none;border-bottom:1px dotted #cbd5e1;">{{ENCARREGADO_PROFISSAO}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;">Local de Trabalho</td>
      <td style="padding:4px 12px 4px 0;border:none;">{{ENCARREGADO_LOCAL_TRABALHO}}</td>
      <td style="color:#64748b;font-weight:600;padding:4px 6px 4px 0;border:none;">Residência</td>
      <td style="padding:4px 0;border:none;">{{ENCARREGADO_RESIDENCIA}}</td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:bold;background:#0f172a;color:#fff;padding:5px 10px;border-radius:4px;margin:12px 0 6px;letter-spacing:0.5px;">{{TITULO_NOTAS}}</div>
  {{TABELA_NOTAS_FICHA}}

  <div style="font-size:11px;font-weight:bold;background:#0f172a;color:#fff;padding:5px 10px;border-radius:4px;margin:12px 0 6px;letter-spacing:0.5px;">{{ASSIDUIDADE_TITULO}}</div>
  <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:6px;">
    <tr>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:25%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Presenças</div>
        <div style="font-size:16px;font-weight:bold;color:#16a34a;">{{ASSIDUIDADE_PRESENCAS}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:25%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Faltas Justif.</div>
        <div style="font-size:16px;font-weight:bold;color:#f59e0b;">{{ASSIDUIDADE_FALTAS_J}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:25%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Faltas Injustif.</div>
        <div style="font-size:16px;font-weight:bold;color:#dc2626;">{{ASSIDUIDADE_FALTAS_I}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:25%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Assiduidade</div>
        <div style="font-size:16px;font-weight:bold;color:#0f172a;">{{ASSIDUIDADE_PERCENT}}</div>
      </td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:bold;background:#0f172a;color:#fff;padding:5px 10px;border-radius:4px;margin:12px 0 6px;letter-spacing:0.5px;">{{FINANCEIRO_TITULO}}</div>
  <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin-top:6px;">
    <tr>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:20%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Pagamentos</div>
        <div style="font-size:16px;font-weight:bold;color:#16a34a;">{{FIN_PAGAMENTOS}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:20%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Pendências</div>
        <div style="font-size:16px;font-weight:bold;color:#dc2626;">{{FIN_PENDENCIAS}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:20%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Total Pago</div>
        <div style="font-size:13px;font-weight:bold;color:#0f172a;">{{FIN_TOTAL_PAGO}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:20%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Saldo Actual</div>
        <div style="font-size:13px;font-weight:bold;color:#0f172a;">{{FIN_SALDO}}</div>
      </td>
      <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center;width:20%;">
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Estado</div>
        <div style="font-size:11px;font-weight:bold;color:#0f172a;">{{FIN_ESTADO}}</div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border:none;border-collapse:collapse;margin-top:14px;border-top:2px dashed #94a3b8;padding-top:8px;">
    <tr>
      <td style="border:none;width:110px;vertical-align:middle;padding:8px 0;">{{QR_VERIFICACAO}}</td>
      <td style="border:none;vertical-align:middle;padding:8px 0 8px 12px;font-size:9px;color:#475569;line-height:1.5;">
        <strong style="color:#0f172a;">Verificação de Autenticidade</strong><br/>
        Este documento pode ser autenticado em <span style="font-family:'Courier New',monospace;font-size:8.5px;color:#0f172a;background:#f1f5f9;padding:3px 6px;border-radius:3px;">{{URL_VERIFICACAO}}</span>
        ou lendo o código QR ao lado. Hash: <strong>{{HASH_VERIFICACAO}}</strong> · Emissão Nº <strong>{{NUMERO_EMISSAO}}</strong>
      </td>
    </tr>
  </table>

  <table style="width:100%;border:none;border-collapse:collapse;margin-top:30px;">
    <tr>
      <td style="width:50%;border:none;text-align:center;padding:0 20px;">
        <div style="border-top:1px solid #0f172a;padding-top:4px;">
          <div style="font-size:10.5px;font-weight:bold;color:#0f172a;">{{DIRECTOR_PEDAGOGICO}}</div>
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">O(A) Subdirector(a) Pedagógico(a)</div>
        </div>
      </td>
      <td style="width:50%;border:none;text-align:center;padding:0 20px;">
        <div style="border-top:1px solid #0f172a;padding-top:4px;">
          <div style="font-size:10.5px;font-weight:bold;color:#0f172a;">{{DIRECTOR_GERAL}}</div>
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">O(A) Director(a) Geral</div>
        </div>
      </td>
    </tr>
  </table>

  <div style="text-align:right;font-size:9px;color:#64748b;margin-top:8px;font-style:italic;">Emitida em {{DATA_EMISSAO}}</div>
</div>`;

const TIPO_DEFAULT_TEMPLATES: Partial<Record<DocTipo, string>> = {
  historico_academico: HISTORICO_ACADEMICO_DEFAULT,
  recibo_salario: RECIBO_SALARIO_DEFAULT,
  titulo_salario: TITULO_SALARIO_DEFAULT,
  ficha_individual: FICHA_INDIVIDUAL_DEFAULT,
};

const TIPO_LABELS: Record<DocTipo, string> = {
  declaracao: 'Declaração',
  certificado: 'Certificado',
  atestado: 'Atestado',
  oficio: 'Ofício',
  pauta: 'Mini-Pauta',
  mini_pauta: 'Mini-Pauta (Professor)',
  pauta_disciplina: 'Mini-Pauta por Disciplina',
  pauta_final: 'Pauta Final',
  ficha_matricula: 'Ficha de Matrícula',
  ficha_individual: 'Ficha Individual do Aluno',
  mapa_aproveitamento: 'Mapa de Aproveitamento',
  mapa_frequencias: 'Mapa de Frequências',
  lista_turma: 'Lista da Turma',
  certificado_primario: 'Certificado Primário',
  ficha_inscricao: 'Boletim de Inscrição',
  boletim_matricula: 'Boletim de Matrícula',
  lista_admitidos: 'Lista de Admitidos',
  lista_inscritos: 'Lista de Inscritos',
  lista_resultados_admissao: 'Lista de Resultados de Admissão',
  recibo_salario: 'Recibo de Vencimento',
  titulo_salario: 'Título de Salário',
  extrato_propina: 'Extracto de Propinas',
  historico_academico: 'Histórico Académico',
  relatorio_biblioteca: 'Relatório da Biblioteca',
  comprovativo_matricula: 'Comprovativo de Matrícula',
  outro: 'Outro',
};
const TIPO_COLORS: Record<DocTipo, string> = {
  declaracao: Colors.info,
  certificado: Colors.gold,
  atestado: Colors.success,
  oficio: Colors.warning,
  pauta: '#8b5cf6',
  mini_pauta: '#1a6b3c',
  pauta_disciplina: '#7c3aed',
  pauta_final: '#dc2626',
  ficha_matricula: '#0891b2',
  ficha_individual: '#b45309',
  mapa_aproveitamento: '#065f46',
  mapa_frequencias: '#1a6b3c',
  lista_turma: '#0369a1',
  certificado_primario: '#7c3aed',
  ficha_inscricao: '#4A90D9',
  boletim_matricula: '#0a5e14',
  lista_admitidos: '#1E3A5F',
  lista_inscritos: '#0e7490',
  lista_resultados_admissao: '#0f3460',
  recibo_salario: '#10b981',
  titulo_salario: '#059669',
  extrato_propina: '#0d9488',
  historico_academico: '#4f46e5',
  relatorio_biblioteca: '#5E6AD2',
  comprovativo_matricula: '#16a34a',
  outro: Colors.textMuted,
};

const TIPO_GRUPOS: { label: string; tipos: DocTipo[] }[] = [
  { label: 'Académicos', tipos: ['declaracao', 'certificado', 'certificado_primario', 'atestado', 'oficio', 'historico_academico'] },
  { label: 'Matrículas / Inscrições', tipos: ['comprovativo_matricula', 'ficha_matricula', 'ficha_individual', 'ficha_inscricao', 'boletim_matricula'] },
  { label: 'Pautas', tipos: ['pauta', 'mini_pauta', 'pauta_disciplina', 'pauta_final'] },
  { label: 'Mapas e Listas', tipos: ['mapa_aproveitamento', 'mapa_frequencias', 'lista_turma', 'lista_admitidos', 'lista_inscritos', 'lista_resultados_admissao'] },
  { label: 'Financeiro / RH', tipos: ['recibo_salario', 'titulo_salario', 'extrato_propina'] },
  { label: 'Outros', tipos: ['relatorio_biblioteca', 'outro'] },
];

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Map of all template variables → example values (for preview without real data)
const VARIABLE_EXAMPLE_MAP: Record<string, string> = buildVariableExampleMap(VARIABLE_GROUPS);

// ─── Rich Text Editor helpers ────────────────────────────────────────────────

function isHtmlContent(s: string): boolean {
  return s.trim().startsWith('<');
}

function plainTextToHtml(text: string): string {
  if (!text) return '';
  if (isHtmlContent(text)) return text;
  return text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
}

function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const DOC_EDITOR_DRAFT_PREFIX = '@siga_doc_editor_draft';

type DocEditorDraft = {
  nome: string;
  tipo: DocTipo;
  conteudo: string;
  insigniaBase64?: string;
  marcaAguaBase64?: string;
  cabecalhoNome?: string;
  cabecalhoExtra?: string;
  cabecalhoAlign?: 'left' | 'center' | 'right';
  atualizadoEm: string;
};

function buildQuillSrcdoc(initialHtml: string): string {
  const safeInitial = JSON.stringify(initialHtml);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden;background:#f0f0f0;font-family:sans-serif}
  body{display:flex;flex-direction:column}
  #toolbar{
    display:flex;flex-wrap:wrap;align-items:center;gap:2px;
    background:#1a2540;border-bottom:1px solid #2d3a5a;
    padding:5px 8px;flex-shrink:0;
  }
  #toolbar button,#toolbar select{
    background:transparent;border:none;color:#94a3b8;cursor:pointer;
    border-radius:4px;padding:3px 6px;font-size:13px;line-height:1;
    transition:background 0.15s,color 0.15s;
    display:inline-flex;align-items:center;justify-content:center;
  }
  #toolbar button:hover,#toolbar select:hover{background:rgba(255,255,255,0.1);color:#fff}
  #toolbar button.active{background:rgba(255,255,255,0.15);color:#fff}
  #toolbar select{color:#94a3b8;padding:3px 4px;font-size:12px;background:#1a2540;outline:none}
  #toolbar select option{background:#1a2540;color:#e2e8f0}
  #toolbar .sep{width:1px;height:18px;background:#2d3a5a;margin:0 3px}
  #editorWrap{flex:1;overflow-y:auto;background:#fff;padding:0;position:relative}
  #editor{
    min-height:100%;padding:28px 36px;
    font-family:'Times New Roman',Times,serif;
    font-size:14px;line-height:1.9;color:#111;
    background:#fff;
    outline:none;white-space:pre-wrap;word-break:break-word;
  }
  #editor:empty::before{
    content:'Escreva o conteúdo do documento aqui...';
    color:#aaa;font-style:italic;pointer-events:none;
  }
  #editor .var-tag{
    background:#dbeafe;color:#1d4ed8;border-radius:3px;
    padding:1px 4px;font-family:monospace;font-size:12px;
    font-style:normal;
  }
  #editor img{
    cursor:pointer;transition:outline 0.15s;
  }
  #editor img.img-selected{
    outline:2px solid #3b82f6;
    outline-offset:2px;
  }
  #imgToolbar{
    display:none;position:fixed;z-index:9999;
    background:#1a2540;border:1px solid #3b82f6;
    border-radius:8px;padding:4px 6px;
    gap:2px;align-items:center;
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
  }
  #imgToolbar.visible{display:flex}
  #imgToolbar button{
    background:transparent;border:none;color:#94a3b8;cursor:pointer;
    border-radius:4px;padding:4px 7px;font-size:13px;line-height:1;
    transition:background 0.15s,color 0.15s;
    display:inline-flex;align-items:center;justify-content:center;
    white-space:nowrap;
  }
  #imgToolbar button:hover{background:rgba(255,255,255,0.12);color:#fff}
  #imgToolbar button.act{background:rgba(59,130,246,0.3);color:#60a5fa}
  #imgToolbar .isep{width:1px;height:16px;background:#2d3a5a;margin:0 2px;flex-shrink:0}
  #imgSizeLabel{color:#64748b;font-size:11px;padding:0 4px;white-space:nowrap}
</style>
</head>
<body>
<input type="file" id="imgInput" accept="image/*" style="display:none">

<!-- Floating image toolbar -->
<div id="imgToolbar">
  <button id="iBtn_sl" title="Alinhar à esquerda" onclick="imgAlign('left')">&#8676;</button>
  <button id="iBtn_sc" title="Centralizar" onclick="imgAlign('center')">&#9636;</button>
  <button id="iBtn_sr" title="Alinhar à direita" onclick="imgAlign('right')">&#8677;</button>
  <div class="isep"></div>
  <button title="Reduzir (−20%)" onclick="imgResize(-0.2)">&#8722;</button>
  <span id="imgSizeLabel">100%</span>
  <button title="Ampliar (+20%)" onclick="imgResize(+0.2)">&#43;</button>
  <button title="Largura total" onclick="imgFull()">&#8614;</button>
  <div class="isep"></div>
  <button title="Eliminar imagem" onclick="imgDelete()" style="color:#f87171">&#128465;</button>
</div>

<div id="toolbar">
  <select id="fontSize" title="Tamanho">
    <option value="1">Pequeno</option>
    <option value="3" selected>Normal</option>
    <option value="4">Grande</option>
    <option value="5">Maior</option>
    <option value="7">Muito grande</option>
  </select>
  <div class="sep"></div>
  <button id="btnBold" title="Negrito" onclick="fmt('bold')"><b>B</b></button>
  <button id="btnItalic" title="Itálico" onclick="fmt('italic')"><i>I</i></button>
  <button id="btnUnderline" title="Sublinhado" onclick="fmt('underline')"><u>U</u></button>
  <button id="btnStrike" title="Rasurado" onclick="fmt('strikeThrough')"><s>S</s></button>
  <div class="sep"></div>
  <button title="Alinhar à esquerda" onclick="fmt('justifyLeft')">&#8676;</button>
  <button title="Centrar" onclick="fmt('justifyCenter')">&#9636;</button>
  <button title="Alinhar à direita" onclick="fmt('justifyRight')">&#8677;</button>
  <button title="Justificar" onclick="fmt('justifyFull')">&#9636;&#9636;</button>
  <div class="sep"></div>
  <button title="Lista com pontos" onclick="fmt('insertUnorderedList')">&#8226;&#8212;</button>
  <button title="Lista numerada" onclick="fmt('insertOrderedList')">1.</button>
  <div class="sep"></div>
  <button title="Inserir imagem (ou cola com Ctrl+V)" onclick="document.getElementById('imgInput').click()" style="font-size:16px">&#128247;</button>
  <div class="sep"></div>
  <button title="Limpar formatação" onclick="fmt('removeFormat')" style="font-size:11px">&#10006; fmt</button>
</div>
<div id="editorWrap">
  <div id="editor" contenteditable="true" spellcheck="true"></div>
</div>
<script>
  var ed = document.getElementById('editor');
  var timer;
  var savedRange = null;
  var selectedImg = null;
  var imgToolbar = document.getElementById('imgToolbar');

  var initial = ${safeInitial};
  if (initial) { ed.innerHTML = initial; }

  // ── Image selection ──────────────────────────────────────────────────────

  function getImgNaturalWidth(img) {
    return img.naturalWidth || img.width || 300;
  }

  function getCurrentWidthPct(img) {
    var w = img.style.width;
    if (!w) return 100;
    if (w.endsWith('%')) return parseFloat(w);
    // px → convert to percentage of editor width
    var edW = ed.clientWidth - 72; // subtract padding
    return Math.round((parseFloat(w) / edW) * 100);
  }

  function positionImgToolbar(img) {
    var rect = img.getBoundingClientRect();
    var tb = imgToolbar;
    var tbH = tb.offsetHeight || 36;
    var tbW = tb.offsetWidth || 280;
    var top = rect.top - tbH - 8;
    if (top < 0) top = rect.bottom + 8;
    var left = rect.left + (rect.width - tbW) / 2;
    if (left < 4) left = 4;
    if (left + tbW > window.innerWidth - 4) left = window.innerWidth - tbW - 4;
    tb.style.top = top + 'px';
    tb.style.left = left + 'px';
    // update size label
    document.getElementById('imgSizeLabel').textContent = getCurrentWidthPct(img) + '%';
    // update alignment buttons
    var al = img.style.marginLeft;
    document.getElementById('iBtn_sl').classList.toggle('act', !img.style.marginLeft || img.style.marginLeft === '0px');
    document.getElementById('iBtn_sc').classList.toggle('act', img.style.marginLeft === 'auto' && img.style.marginRight === 'auto');
    document.getElementById('iBtn_sr').classList.toggle('act', img.style.marginLeft === 'auto' && img.style.marginRight === '0px');
  }

  function selectImg(img) {
    deselectImg();
    selectedImg = img;
    img.classList.add('img-selected');
    imgToolbar.classList.add('visible');
    positionImgToolbar(img);
  }

  function deselectImg() {
    if (selectedImg) {
      selectedImg.classList.remove('img-selected');
      selectedImg = null;
    }
    imgToolbar.classList.remove('visible');
  }

  // Click on image in editor → select it
  ed.addEventListener('click', function(e) {
    if (e.target && e.target.tagName === 'IMG') {
      e.preventDefault();
      selectImg(e.target);
    } else {
      deselectImg();
    }
  });

  // Hide toolbar when clicking outside
  document.addEventListener('click', function(e) {
    if (!imgToolbar.contains(e.target) && e.target !== selectedImg) {
      deselectImg();
    }
  });

  // Reposition toolbar on scroll
  document.getElementById('editorWrap').addEventListener('scroll', function() {
    if (selectedImg) positionImgToolbar(selectedImg);
  });

  // ── Image toolbar actions ────────────────────────────────────────────────

  function imgAlign(dir) {
    if (!selectedImg) return;
    selectedImg.style.display = 'block';
    if (dir === 'center') {
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = 'auto';
      selectedImg.style.float = 'none';
    } else if (dir === 'left') {
      selectedImg.style.marginLeft = '0';
      selectedImg.style.marginRight = 'auto';
      selectedImg.style.float = 'none';
    } else if (dir === 'right') {
      selectedImg.style.marginLeft = 'auto';
      selectedImg.style.marginRight = '0';
      selectedImg.style.float = 'none';
    }
    positionImgToolbar(selectedImg);
    sendChange();
  }

  function imgResize(delta) {
    if (!selectedImg) return;
    var edW = ed.clientWidth - 72;
    var curPct = getCurrentWidthPct(selectedImg);
    var newPct = Math.max(10, Math.min(100, Math.round(curPct + delta * 100)));
    selectedImg.style.width = newPct + '%';
    selectedImg.style.height = 'auto';
    selectedImg.style.maxWidth = '100%';
    setTimeout(function(){ positionImgToolbar(selectedImg); }, 50);
    sendChange();
  }

  function imgFull() {
    if (!selectedImg) return;
    selectedImg.style.width = '100%';
    selectedImg.style.height = 'auto';
    selectedImg.style.maxWidth = '100%';
    selectedImg.style.marginLeft = '0';
    selectedImg.style.marginRight = '0';
    selectedImg.style.display = 'block';
    positionImgToolbar(selectedImg);
    sendChange();
  }

  function imgDelete() {
    if (!selectedImg) return;
    selectedImg.parentNode && selectedImg.parentNode.removeChild(selectedImg);
    deselectImg();
    sendChange();
  }

  // ── Editor core ──────────────────────────────────────────────────────────

  function fmt(cmd, val) {
    ed.focus();
    document.execCommand(cmd, false, val || null);
    sendChange();
    updateToolbar();
  }

  document.getElementById('fontSize').addEventListener('change', function() {
    fmt('fontSize', this.value);
  });

  function sendChange() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      window.parent.postMessage({ type: 'ck_change', html: ed.innerHTML }, '*');
    }, 300);
  }

  ed.addEventListener('input', sendChange);
  ed.addEventListener('keyup', updateToolbar);
  ed.addEventListener('mouseup', function(e) {
    if (!e.target || e.target.tagName !== 'IMG') updateToolbar();
  });

  ed.addEventListener('blur', function() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
  });

  function insertImageDataUrl(dataUrl) {
    ed.focus();
    var sel = window.getSelection();
    var range;
    if (savedRange) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
      range = savedRange;
      savedRange = null;
    } else if (sel && sel.rangeCount > 0) {
      range = sel.getRangeAt(0);
    }
    var img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = '120px';
    img.style.height = 'auto';
    img.style.maxWidth = '100%';
    img.style.display = 'block';
    img.style.marginLeft = 'auto';
    img.style.marginRight = 'auto';
    img.style.margin = '8px auto';
    if (range) {
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      ed.appendChild(img);
    }
    setTimeout(function(){ selectImg(img); }, 50);
    sendChange();
  }

  function readFileAsDataUrl(file, cb) {
    var reader = new FileReader();
    reader.onload = function(e) { cb(e.target.result); };
    reader.readAsDataURL(file);
  }

  document.getElementById('imgInput').addEventListener('change', function() {
    var file = this.files[0];
    if (!file) return;
    readFileAsDataUrl(file, insertImageDataUrl);
    this.value = '';
  });

  ed.addEventListener('paste', function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (file) readFileAsDataUrl(file, insertImageDataUrl);
        return;
      }
    }
  });

  function updateToolbar() {
    document.getElementById('btnBold').classList.toggle('active', document.queryCommandState('bold'));
    document.getElementById('btnItalic').classList.toggle('active', document.queryCommandState('italic'));
    document.getElementById('btnUnderline').classList.toggle('active', document.queryCommandState('underline'));
    document.getElementById('btnStrike').classList.toggle('active', document.queryCommandState('strikeThrough'));
  }

  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'ck_insert') {
      ed.focus();
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var span = document.createElement('span');
        span.className = 'var-tag';
        span.textContent = e.data.text;
        range.insertNode(span);
        range.setStartAfter(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        var span2 = document.createElement('span');
        span2.className = 'var-tag';
        span2.textContent = e.data.text;
        ed.appendChild(span2);
      }
      sendChange();
    }
  });
</script>
</body>
</html>`;
}

function genId() { return 'tpl_' + Date.now() + Math.random().toString(36).slice(2, 7); }
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Default / Seed Templates ────────────────────────────────────────────────

const SEED_GUIA_TRANSFERENCIA_ID = 'tpl_seed_guia_transferencia_v1';

const SEED_GUIA_TRANSFERENCIA: DocTemplate = {
  id: SEED_GUIA_TRANSFERENCIA_ID,
  nome: 'Guia de Transferência',
  tipo: 'outro',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `GUIA DE TRANSFERÊNCIA Nº ____/________

A pedido do seu encarregado de educação, eu {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}}, venho por meio desta transferir o (a) aluno (a) {{NOME_COMPLETO}}, nascido(a) aos {{DATA_NASCIMENTO}}, filho(a) de {{PAI}} e de {{MAE}},

{{MUNICIPIO}}, Natural de {{MUNICIPIO}}, província de {{PROVINCIA}}, matriculado(a) na {{CLASSE}}.

É transferido(a) para ________________________________________________, município de __________________, província de __________________, com os seguintes documentos:

  › ___ Cópia (s) do bilhete, Cédula ou Certidão de nascimento.
  › ___ Fotografia (s).
  › ___ Certificado da 6ª Classe ou ficha de encaminhamento.
  › ___ Atestado Médico.
  › ___ Cartão de Vacina.
  › ___ Pauta / Declaração da 7ª Classe.
  › ___ Pauta / Declaração da 8ª Classe.

Por me ter solicitado, passou-se a presente guia de transferência que por mim vai assinado e autenticado com carimbo a óleo em uso nesta instituição Escolar.

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

const SEED_DECLARACAO_HABILITACOES_ID = 'tpl_seed_declaracao_habilitacoes_v1';

const SEED_DECLARACAO_HABILITACOES: DocTemplate = {
  id: SEED_DECLARACAO_HABILITACOES_ID,
  nome: 'Declaração de Habilitações',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
ENSINO GERAL

DECLARAÇÃO DE HABILITAÇÕES

{{NOME_DIRECTOR}}, Director(a) da {{NOME_ESCOLA}}, com Decreto de conjunto nº _________ Certifico que: {{NOME_COMPLETO}}, Filho (a) de {{PAI}} e de {{MAE}}, nascido (a) aos {{DATA_NASCIMENTO}}, natural de {{MUNICIPIO}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador (a) do B.I. nº _________________, passado pelo arquivo de identificação de _________________ aos _________.

Frequentou nesta Escola no Ano Lectivo de {{ANO_LECTIVO}} a ({{CLASSE}}) {{NOME_ESCOLA}}, {{NIVEL}}, na Área de _________________________________, com o resultado final de _________________ Sob a pauta nº _________ arquivado nesta Escola, com as seguintes classificações:

DISCIPLINA                                    | NOTA
----------------------------------------------|-------------------
Língua Portuguesa                             | _____ valores
Língua Estrangeira                            | _____ valores
Matemática                                    | _____ valores
Informática                                   | _____ valores
Educação Física                               | _____ valores
___________________________________           | _____ valores
___________________________________           | _____ valores
___________________________________           | _____ valores
___________________________________           | _____ valores

Por ser verdade, passou-se a presente DECLARAÇÃO que vai por mim assinado e autenticado com o carimbo a óleo em uso nesta Instituição de Ensino.

{{NOME_ESCOLA}} — {{MUNICIPIO}}, {{DATA_ACTUAL}}.`,
};

const SEED_CERTIFICADO_I_CICLO_ID = 'tpl_seed_certificado_i_ciclo_v1';

const SEED_CERTIFICADO_I_CICLO: DocTemplate = {
  id: SEED_CERTIFICADO_I_CICLO_ID,
  nome: 'Certificado — Iº Ciclo do Ensino Secundário',
  tipo: 'certificado',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
Iº CÍCLO DO ENSINO SECUNDÁRIO

CERTIFICADO

a) {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}}, criado(a) sob Decreto Executivo nº _______ de _________________
Certifico que: {{NOME_COMPLETO}}, filho (a) de {{PAI}} e de {{MAE}}, Nascido (a) aos {{DATA_NASCIMENTO}}, natural de {{MUNICIPIO}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador (a) do B.I nº _________________, emitido aos _________________ pelo Arquivo de Identificação de _________________.

Concluiu no ano lectivo de {{ANO_LECTIVO}} o Iº CÍCLO DO ENSINO SECUNDÁRIO GERAL, {{NOME_ESCOLA}} sob o processo nº _______, Pauta nº _______, conforme o disposto na alínea (c) do artigo 109º da LBSEE 17/16, de 7 de Outubro, com a Média Final de _______ valores obtido nas seguintes classificações:

DISCIPLINA               | 7ª Cl. | 8ª Cl. | 9ª Cl. | Média | Por Extenso
-------------------------|--------|--------|--------|-------|------------------
Língua Portuguesa        |        |        |        |       |
Língua Inglesa           |        |        |        |       |
Língua Francesa          |        |        |        |       |
Matemática               |        |        |        |       |
Biologia                 |        |        |        |       |
Física                   |        |        |        |       |
Química                  |        |        |        |       |
Geografia                |        |        |        |       |
História                 |        |        |        |       |
Educação Física          |        |        |        |       |
Educação Moral e Cívica  |        |        |        |       |
Educação Visual e Plást. |        |        |        |       |
Educação Laboral         |        |        |        |       |
Emprendedorismo          |        |        |        |       |

Para efeitos legais lhe é passado o presente CERTIFICADO, que consta no livro de registo nº _______ Folha _______, assinado por mim e autenticado com o carimbo a óleo/selo branco em uso neste estabelecimento de ensino.

{{NOME_ESCOLA}} em {{MUNICIPIO}} aos, {{DATA_ACTUAL}}.`,
};

// ─── Certificado de Habilitações — I Ciclo do Ensino Secundário Geral ────────

const SEED_CERT_HAB_I_CICLO_ID = 'tpl_seed_cert_hab_i_ciclo_geral_v1';
const CERT_HAB_7A9A_HTML = `<p style="text-align: center; font-size: 11pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">ENSINO GERAL</p>
<p style="text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-bottom: 24px;">CERTIFICADO DE HABILITAÇÕES</p>

<p style="text-align: justify; font-size: 11pt; line-height: 1.8; margin-bottom: 16px;"><strong>{{NOME_DIRECTOR}}</strong>, Director do Colégio nº 13 do Dundo, criado sob Decreto Executivo nº <strong>{{DECRETO}}</strong> de {{DECRETO_DATA}}, Declara que: <strong><span style="color: #c0392b;">{{NOME_ALUNO}}</span></strong>, Filho(a) de {{NOME_PAI}} e de {{NOME_MAE}}, nascido(a) aos {{DIA_NASCIMENTO}} de {{MES_NASCIMENTO}} de {{ANO_NASCIMENTO}}, natural de {{NATURALIDADE}}, município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador(a) do B. I. Nº <strong><span style="color: #c0392b;">{{NUMERO_BI}}</span></strong>, emitido pelo sector de identificação de {{LOCAL_BI}}, aos {{DATA_BI}}, <strong>Concluiu no ano lectivo <span style="color: #c0392b;">{{ANO_LECTIVO}}</span></strong>, o Iº CICLO DO ENSINO SECUNDÁRIO GERAL, na Turma: <strong><span style="color: #c0392b;">{{TURMA}}</span></strong> sob o n.º <strong><span style="color: #c0392b;">{{NUMERO_TURMA}}</span></strong>, conforme o disposto na alínea c) do artigo 109º da Lei de Base da Educação nº 17/16 de 7 de Outubro, com a <strong>Média Final</strong> de <strong><span style="color: #c0392b;">{{MEDIA_FINAL}}</span></strong> valores obtido nas seguintes classificações por Ciclo de aprendizagem.</p>

<table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 20px;">
  <thead>
    <tr>
      <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">Disciplinas</th>
      <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">7ª Classe</th>
      <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">8ª Classe</th>
      <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">9ª Classe</th>
      <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">Média Final</th>
      <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold;">Media Por Extenso</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Língua Portuguesa</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_LP_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_LP_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_LP_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_LP}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_LP_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Língua Estrangeira</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_LE_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_LE_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_LE_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_LE}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_LE_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Matemática</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_MAT_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_MAT_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_MAT_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_MAT}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_MAT_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Biologia</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_BIO_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_BIO_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_BIO_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_BIO}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_BIO_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Física</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_FIS_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_FIS_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_FIS_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_FIS}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_FIS_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Química</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_QUI_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_QUI_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_QUI_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_QUI}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_QUI_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Empreendedorismo</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EMP_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EMP_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EMP_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EMP}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EMP_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Geografia</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_GEO_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_GEO_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_GEO_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_GEO}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_GEO_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">História</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_HIS_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_HIS_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_HIS_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_HIS}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_HIS_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Educação Física</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EF_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EF_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EF_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EF}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EF_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Educação Moral e Cívica</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EMC_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EMC_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EMC_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EMC}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EMC_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Educação Visual Plástica</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EVP_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EVP_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EVP_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EVP}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EVP_EXTENSO}}</td></tr>
    <tr><td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold;">Educação Laboral</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EL_7}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EL_8}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{NOTA_EL_9}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EL}}</td><td style="border: 1px solid #000; padding: 4px 6px; text-align: center;">{{MEDIA_EL_EXTENSO}}</td></tr>
  </tbody>
</table>

<p style="text-align: justify; font-size: 10pt; line-height: 1.8; margin-bottom: 30px;">Para efeito legais lhe é passado o presente <strong>CERTIFICADO,</strong> que consta no livro de registo n.º_____/{{ANO_REG}}, folha________assinado por mim e autenticado com carimbo à óleo em uso neste Estabelecimento do Ensino.</p>

<p style="font-size: 10pt; margin-bottom: 60px;">{{LOCALIDADE}}, {{DATA_EMISSAO}}</p>

<table style="width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 20px;">
  <tr>
    <td style="width: 48%; text-align: center; padding-top: 40px; border-top: 1px solid #000;"><strong>CONFERIDO POR:</strong></td>
    <td style="width: 4%;"></td>
    <td style="width: 48%; text-align: center; padding-top: 40px; border-top: 1px solid #000;"><strong>O DIRECTOR</strong><br><br>{{NOME_DIRECTOR}}</td>
  </tr>
</table>`;

const SEED_CERT_HAB_I_CICLO: DocTemplate = {
  id: SEED_CERT_HAB_I_CICLO_ID,
  nome: 'Certificado de Habilitações — Iº Ciclo Ensino Secundário Geral (7ª, 8ª, 9ª)',
  tipo: 'certificado',
  classeAlvo: 'I-CICLO-GERAL',
  bloqueado: false,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: CERT_HAB_7A9A_HTML,
};

const SEED_CERT_HAB_7A9A_DUNDO_ID = 'tpl_seed_cert_hab_7a9a_col13_dundo_v1';
const SEED_CERT_HAB_7A9A_DUNDO: DocTemplate = {
  id: SEED_CERT_HAB_7A9A_DUNDO_ID,
  nome: 'Certificado de Habilitações 7ª a 9ª Classe — Colégio nº 13 do Dundo',
  tipo: 'certificado',
  classeAlvo: 'I-CICLO-13-DUNDO',
  bloqueado: false,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: CERT_HAB_7A9A_HTML,
};

const SEED_MINI_PAUTA_ID = 'tpl_seed_mini_pauta_v1';

const SEED_MINI_PAUTA: DocTemplate = {
  id: SEED_MINI_PAUTA_ID,
  nome: 'Mini-Pauta (Modelo Manual)',
  tipo: 'pauta',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="position:relative;min-height:130px;padding-top:6px;">
  <div style="position:absolute;top:0;left:0;border:1.2px solid #111;padding:6px 10px;font-size:9px;line-height:1.4;min-width:130px;text-align:center;font-family:'Times New Roman',serif;">
    <div style="font-weight:bold;letter-spacing:0.5px;margin-bottom:2px;">VISTO</div>
    <div style="text-align:left;margin-bottom:6px;">Data ___/___/______</div>
    <div style="border-top:1px solid #111;padding-top:3px;font-size:8.5px;font-style:italic;">A Chefe de Repartição<br/>e Ensino</div>
  </div>
  <div style="text-align:center;margin:0 auto 4px auto;">
    <img src="{{LOGO_URL}}" alt="Brasão" style="width:78px;height:78px;object-fit:contain;display:inline-block;" />
  </div>
  <div style="text-align:center;font-family:'Times New Roman',serif;font-size:11pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:2px 0;">{{CABECALHO_LINHA1}}</div>
  <div style="text-align:center;font-family:'Times New Roman',serif;font-size:11pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">{{CABECALHO_LINHA2}}</div>
</div>
<div style="border:1px solid #444;padding:5px 8px;margin-top:8px;font-family:'Times New Roman',serif;font-size:10pt;">
  <strong>ESCOLA:</strong> {{NOME_ESCOLA}} &nbsp;&nbsp; <strong>MUNICÍPIO:</strong> {{MUNICIPIO}} &nbsp;&nbsp; <strong>PROVÍNCIA:</strong> {{PROVINCIA}} &nbsp;&nbsp; <strong>PAUTA Nº:</strong> {{PAUTA_NUMERO}} &nbsp;&nbsp; <strong>ANO LECTIVO:</strong> {{ANO_LECTIVO}} &nbsp;&nbsp; <strong>{{CLASSE}}ª CLASSE</strong> &nbsp;&nbsp; <strong>TURMA:</strong> {{TURMA}}
</div>
<p style="text-align:center;font-family:'Times New Roman',serif;font-size:13pt;font-weight:bold;margin:10px 0 6px 0;">MINI-PAUTA — {{DISCIPLINA}} — {{CLASSE}}ª CLASSE — Ano Lectivo: {{ANO_LECTIVO}}</p>
<div data-var="TABELA_MINI_PAUTA" style="background:#e8f5e9;border:2px dashed #1a6b3c;border-radius:6px;padding:18px;text-align:center;font-family:'Times New Roman',serif;margin:12px 0;">
  <div style="font-size:12pt;font-weight:bold;color:#1a6b3c;margin-bottom:6px;">&#128203; TABELA DE NOTAS DOS ALUNOS</div>
  <div style="font-size:10pt;color:#1a6b3c;">{{TABELA_MINI_PAUTA}}</div>
  <div style="font-size:9pt;color:#555;font-style:italic;margin-top:6px;">[Gerada automaticamente ao emitir — colunas: MAC · NPP · NPT · MT1 · MT2 · MT3 · MFD · Observação]</div>
</div>
<p style="font-family:'Times New Roman',serif;font-size:9pt;margin:8px 0 4px 0;"><em>Legenda: MAC = Média Avaliações Contínuas | NPP = Nota Prova Parcial | NPT = Nota Prova Trimestral | MT = Média Trimestral | MFD = Média Final do Ano</em></p>
<p style="font-family:'Times New Roman',serif;font-size:10pt;margin:14px 0 4px 0;text-align:right;">{{NOME_ESCOLA}}, {{MUNICIPIO}}, {{DATA_ACTUAL}}.</p>
<table style="width:100%;border:none;border-collapse:collapse;margin-top:28px;"><tbody><tr>
  <td style="width:50%;border:none;text-align:center;vertical-align:top;padding:4px;">
    <p style="font-weight:bold;margin:0 0 28px 0;">O(A) Director(a)</p>
    <span style="display:inline-block;border-bottom:1.5px solid #222;min-width:220px;height:20px;">&nbsp;</span>
    <p style="margin:4px 0 0 0;">{{NOME_DIRECTOR}}</p>
  </td>
  <td style="width:50%;border:none;text-align:center;vertical-align:top;padding:4px;">
    <p style="font-weight:bold;margin:0 0 28px 0;">O(A) Professor(a)</p>
    <span style="display:inline-block;border-bottom:1.5px solid #222;min-width:220px;height:20px;">&nbsp;</span>
    <p style="margin:4px 0 0 0;">{{NOME_PROFESSOR}}</p>
  </td>
</tr></tbody></table>`,
};

const SEED_MINI_PAUTA_DISCIPLINA_ID = 'tpl_seed_mini_pauta_disciplina_v1';
const SEED_MINI_PAUTA_DISCIPLINA: DocTemplate = {
  id: SEED_MINI_PAUTA_DISCIPLINA_ID,
  nome: 'Mini-Pauta por Disciplina',
  tipo: 'pauta_disciplina',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `[MINI-PAUTA POR DISCIPLINA GERADA AUTOMATICAMENTE]

Ao emitir, seleccione a turma e depois a disciplina pretendida.
O sistema irá gerar a Mini-Pauta completa para essa disciplina com:
• Lista de todos os alunos da turma
• Colunas MAC, NPP, NPT para cada trimestre
• Médias Trimestrais (MT1, MT2, MT3)
• Média Final do Ano (MFD)
• Observação (Aprovado / Reprovado)
• Assinaturas do Director e do Professor

Formato: A4 Paisagem — Padrão Angola (MAC = Média das Avaliações Contínuas,
NPP = Nota da Prova Parcial, NPT = Nota da Prova Trimestral)`,
};

const SEED_PAUTA_FINAL_ID = 'tpl_seed_pauta_final_v1';
const SEED_PAUTA_FINAL: DocTemplate = {
  id: SEED_PAUTA_FINAL_ID,
  nome: 'Pauta Final (por Turma)',
  tipo: 'pauta_final',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `[PAUTA FINAL — GERADA AUTOMATICAMENTE — Decreto Exec. nº 04/2026]

Ao emitir, seleccione o trimestre e a turma. O sistema gera o documento oficial com todos os alunos e notas reais da base de dados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA DO DOCUMENTO (A4 / A3 Paisagem)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CABEÇALHO
  República de Angola — Ministério da Educação
  {{NOME_ESCOLA}}
  PAUTA FINAL DE AVALIAÇÃO — {{TRIMESTRE}}º TRIMESTRE
  Turma: {{TURMA}}  |  Ano Lectivo: {{ANO_LECTIVO}}
  ✅ Validada pela Secretaria Académica em {{DATA}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABELA DE NOTAS — CLASSES DE TRANSIÇÃO (7ª, 8ª, 10ª, 11ª)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nº | Nº ALUNO | NOME COMPLETO | [Disc.1 MT] | [Disc.2 MT] | ... | MFD | OBSERVAÇÃO

  • MT = Média Trimestral (lançada pelo professor)
  • MFD = Média Final do Ano (calculada pelo sistema)
  • Cores: Verde = Aprovado (≥10) | Laranja = Negativa (7–9) | Vermelho = Reprovado (<7)

OBSERVAÇÃO (Decreto Art. 23 §10):
  TRANSITA                — aprovado em todas
  TRANSITA C/ CONDIÇÃO    — ≤ 2 negativas (I Ciclo) ou ≤ 3 negativas (II Ciclo), todas ≥ 7
  NÃO TRANSITA [Art.23§2] — negativas em LP + Matemática (I Ciclo) em simultâneo
  NÃO TRANSITA [LP+ÁREA]  — LP negativa + 2 disciplinas nucleares da área (II Ciclo)
  NÃO TRANSITA            — qualquer nota < 7 ou excede máx. de negativos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABELA DE NOTAS — CLASSES DE EXAME NACIONAL (6ª, 9ª, 12ª)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nº | Nº ALUNO | NOME COMPLETO | [Disc.1 MFD*] | [Disc.2 MFD*] | ... | OBSERVAÇÃO

  * MFD calculada com EN (Exame Nacional) — Decreto Anexo III:
      6ª/9ª nuclear:  MFD = 0,6 × MT₃  +  0,4 × EN₁
      12ª nuclear:    NEN = (EX1 + EX2) / 2
                      MFD = 0,5 × MT₃  +  0,5 × NEN

  Nota: EN lançado pela Secretaria via módulo "Exame Nacional".
        A coluna mostra o MFD final guardado na base de dados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RODAPÉ E ASSINATURAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [Director(a) Pedagógico(a)]   [Secretaria Académica]   [Director(a) Geral]
  {{NOME_DIR_PEDAGÓGICO}}       {{NOME_SECRETÁRIA}}      {{NOME_DIR_GERAL}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO EMITIR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Clique em "Emitir"
2. Seleccione o Trimestre (1º, 2º ou 3º)
3. Seleccione a Turma
4. Clique em "Imprimir" (A4 ou A3) ou "PDF" ou "Excel"
   → Todas as mini-pautas devem estar submetidas antes de gerar a Pauta Final`,
};

const SEED_LISTA_TURMA_ID = 'tpl_seed_lista_turma_v1';
const SEED_LISTA_TURMA: DocTemplate = {
  id: SEED_LISTA_TURMA_ID,
  nome: 'Lista da Turma',
  tipo: 'lista_turma',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `[LISTA DA TURMA — GERADA AUTOMATICAMENTE]

Este modelo gera automaticamente a Lista da Turma completa com todos os alunos da turma seleccionada.

Ao emitir, seleccione a turma e o sistema irá:
• Listar todos os alunos por ordem alfabética
• Mostrar: Nº, Nome do Aluno, Idade, Sexo, Data de Nascimento, Contactos
• Gerar o Mapa Estatístico (género e distribuição de idades)
• Calcular totais e percentagens automaticamente

Escola: {{NOME_ESCOLA}}
Classe: {{CLASSE}} | Turma: {{TURMA}} | Período: {{TURNO}} | Ano Lectivo: {{ANO_LECTIVO}}
Professor(a): Director(a) de Turma`,
};

const SEED_CERT_PRIMARIO_ID = 'tpl_seed_cert_primario_v1';
const SEED_CERT_PRIMARIO: DocTemplate = {
  id: SEED_CERT_PRIMARIO_ID,
  nome: 'Certificado do Ensino Primário',
  tipo: 'certificado_primario',
  bloqueado: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `[CERTIFICADO DO ENSINO PRIMÁRIO — GERADO AUTOMATICAMENTE]

Este modelo gera o Certificado oficial de conclusão do Ensino Primário conforme a LBSEE 17/16.

Ao emitir, seleccione o aluno e o sistema irá preencher automaticamente:
• Nome completo do aluno, data e local de nascimento
• Género (filho/filha)
• Município e Província
• Tabela de classificações por ciclo (2ª, 4ª e 6ª Classe)
• Médias finais por disciplina e por extenso
• Média Geral Final

Campos a preencher manualmente:
• Nome do pai e da mãe
• Número e data do Bilhete de Identidade / Passaporte
• Nº e data do Decreto Executivo de criação da escola
• Livro de registo e folha

Escola: {{NOME_ESCOLA}}
Director(a): {{NOME_DIRECTOR}}`,
};

const SEED_DECLARACAO_COM_NOTA_ID = 'tpl_seed_declaracao_com_nota_v1';

const SEED_DECLARACAO_COM_NOTA: DocTemplate = {
  id: SEED_DECLARACAO_COM_NOTA_ID,
  nome: 'Declaração com Nota (Ensino Primário)',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
ENSINO GERAL

{{NOME_ESCOLA}}

DECLARAÇÃO

{{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}} em {{MUNICIPIO}}, {{PROVINCIA}}. Declara que {{NOME_COMPLETO}}, filho (a) de {{PAI}} e de {{MAE}}, natural de {{MUNICIPIO}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, nascido (a) aos {{DATA_NASCIMENTO}}, portador (a) do B.I nº _________________, passado pelo arquivo de Identificação de _________________ aos _________.

Frequentou a {{CLASSE}} durante o ano lectivo de {{ANO_LECTIVO}} no Ensino Primário com o resultado final _________________ sob o processo nº _______ pauta nº _______ obtendo as seguintes notas descriminadas:

Disciplinas                   | Notas | Valores
------------------------------|-------|-------------------
Língua Portuguesa             |       | (          ) Valores
Matemática                    |       | (          ) Valores
Ciências da Natureza          |       | (          ) Valores
Educação Manual e Plástica    |       | (          ) Valores
Educação Músical              |       | (          ) Valores
Educação Moral e Cívica       |       | (          ) Valores
História                      |       | (          ) Valores
Geografia                     |       | (          ) Valores

OBS: Por ser verdade e assim constar, passou-se a presente Declaração, que vai por mim assinado e autenticado com o carimbo a óleo em uso nesta Instituição.

{{NOME_ESCOLA}} em {{MUNICIPIO}}, {{DATA_ACTUAL}}.`,
};

const SEED_DECLARACAO_HABILITACOES_PRIMARIO_ID = 'tpl_seed_declaracao_habilitacoes_primario_v1';

const SEED_DECLARACAO_HABILITACOES_PRIMARIO: DocTemplate = {
  id: SEED_DECLARACAO_HABILITACOES_PRIMARIO_ID,
  nome: 'Declaração de Habilitações (Ensino Primário)',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `República de Angola
Ministério da Educação
{{NOME_ESCOLA}}

Declaração de Habilitações

Eu, {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}} Declaro que: {{NOME_COMPLETO}},
Filho (a) de {{PAI}} e de {{MAE}},
Natural de {{MUNICIPIO}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}},
Nascido (a) aos {{DATA_NASCIMENTO}},
portador (a) do bilhete de identificação ou cédula nº ________________________________ passado pelos arquivos de identificação de _________________ aos ___/___/_____

Frequentou o ano lectivo de {{ANO_LECTIVO}} E concluiu a {{CLASSE}} classe do Ensino Primário de Educação nesta Escola, conforme consta na Pauta _________________ livro nº _____________,
Sala _____________ Turma {{TURMA}} com a média final de _________________ obtidas nas seguintes classificações:

Língua Portuguesa ..............................................................................
Matemática .........................................................................................
Estudo do Meio ....................................................................................
Educação Manual e Plástica ..................................................................
Educação Musical .................................................................................
Educação Física ....................................................................................

Esta declaração é para efeito de matrícula.

Pela veracidade e autenticidade, passamos a presente declaração que vai por mim assinado e autenticado com carimbos a óleo em uso neste estabelecimento de ensino {{NOME_ESCOLA}}.

{{MUNICIPIO}}, {{DATA_ACTUAL}}.`,
};

// ─── Declaração com Nota — II Ciclo (10ª, 11ª, 12ª, 13ª) ───────────────────

const SEED_DECL_NOTA_10_ID = 'tpl_seed_decl_nota_10_v1';
const SEED_DECL_NOTA_10: DocTemplate = {
  id: SEED_DECL_NOTA_10_ID,
  nome: 'Declaração com Nota — 10ª Classe (IIº Ciclo)',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
ENSINO GERAL

DECLARAÇÃO

a) {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}}.

Declaro que {{NOME_COMPLETO}}, Filho (a) de {{PAI}} e de {{MAE}}, nascido (a) aos {{DATA_NASCIMENTO}}, natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador do B.I ou Cédula Pessoal nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, passado pelo arquivo de Identificação de {{BI_LOCAL_EMISSAO}}.

Concluiu nesta Escola no Ano Lectivo de {{ANO_LECTIVO}} o {{CICLO}} do Ensino Secundário, 10ª Classe, na área de {{AREA}} com o resultado final de {{RESULTADO}} ({{RESULTADO_LETRA}}) no termo c, Pauta, nº {{PAUTA_NUMERO}}, A processa nº {{PROCESSO_NUMERO}} arquivada nesta Escola, com as seguintes classificações:

Disciplinas                          | 10ª Classe
-------------------------------------|-------------------
Língua Portuguesa                    | {{NOTA_LP}} Valores
Língua Estrangeira                   | {{NOTA_LE}} Valores
Matemática                           | {{NOTA_MAT}} Valores
Informática                          | {{NOTA_INF}} Valores
Educação Física                      | {{NOTA_EF}} Valores
História                             | {{NOTA_HIS}} Valores
Geografia                            | {{NOTA_GEO}} Valores
Introdução ao Direito                | {{NOTA_INTRO_DIR}} Valores
Introdução à Economia                | {{NOTA_INTRO_ECO}} Valores

Por ser verdade, passou-se o presente Declaração que vai assinado e autenticado com o carimbo a Óleo ou Branco, em uso nesta Escola.

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

const SEED_DECL_NOTA_11_ID = 'tpl_seed_decl_nota_11_v1';
const SEED_DECL_NOTA_11: DocTemplate = {
  id: SEED_DECL_NOTA_11_ID,
  nome: 'Declaração com Nota — 11ª Classe (IIº Ciclo)',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
ENSINO GERAL

DECLARAÇÃO

a) {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}}.

Declaro que {{NOME_COMPLETO}}, Filho (a) de {{PAI}} e de {{MAE}}, nascido (a) aos {{DATA_NASCIMENTO}}, natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador do B.I ou Cédula Pessoal nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, passado pelo arquivo de Identificação de {{BI_LOCAL_EMISSAO}}.

Concluiu nesta Escola no Ano Lectivo de {{ANO_LECTIVO}} o {{CICLO}} do Ensino Secundário, 11ª Classe, na área de {{AREA}} com o resultado final de {{RESULTADO}} ({{RESULTADO_LETRA}}) no termo c, Pauta, nº {{PAUTA_NUMERO}}, A processa nº {{PROCESSO_NUMERO}} arquivada nesta Escola, com as seguintes classificações:

Disciplinas                          | 11ª Classe
-------------------------------------|-------------------
Língua Portuguesa                    | {{NOTA_LP}} Valores
Língua Estrangeira                   | {{NOTA_LE}} Valores
Matemática                           | {{NOTA_MAT}} Valores
Informática                          | {{NOTA_INF}} Valores
Educação Física                      | {{NOTA_EF}} Valores
Direito                              | {{NOTA_DIR}} Valores
Economia                             | {{NOTA_ECO}} Valores
Gestão de Empresas                   | {{NOTA_GEST}} Valores
Contabilidade                        | {{NOTA_CONT}} Valores

Por ser verdade, passou-se o presente Declaração que vai assinado e autenticado com o carimbo a Óleo ou Branco, em uso nesta Escola.

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

const SEED_DECL_NOTA_12_ID = 'tpl_seed_decl_nota_12_v1';
const SEED_DECL_NOTA_12: DocTemplate = {
  id: SEED_DECL_NOTA_12_ID,
  nome: 'Declaração com Nota — 12ª Classe (IIº Ciclo)',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
ENSINO GERAL

DECLARAÇÃO

a) {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}}.

Declaro que {{NOME_COMPLETO}}, Filho (a) de {{PAI}} e de {{MAE}}, nascido (a) aos {{DATA_NASCIMENTO}}, natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador do B.I ou Cédula Pessoal nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, passado pelo arquivo de Identificação de {{BI_LOCAL_EMISSAO}}.

Concluiu nesta Escola no Ano Lectivo de {{ANO_LECTIVO}} o {{CICLO}} do Ensino Secundário, 12ª Classe, na área de {{AREA}} com o resultado final de {{RESULTADO}} ({{RESULTADO_LETRA}}) no termo c, Pauta, nº {{PAUTA_NUMERO}}, A processa nº {{PROCESSO_NUMERO}} arquivada nesta Escola, com as seguintes classificações:

Disciplinas                          | 12ª Classe
-------------------------------------|-------------------
Língua Portuguesa                    | {{NOTA_LP}} Valores
Língua Estrangeira                   | {{NOTA_LE}} Valores
Matemática                           | {{NOTA_MAT}} Valores
Filosofia                            | {{NOTA_FIL}} Valores
Educação Física                      | {{NOTA_EF}} Valores
Direito Comercial                    | {{NOTA_DIR_COM}} Valores
Economia Política                    | {{NOTA_ECO_POL}} Valores
Contabilidade e Gestão               | {{NOTA_CONT_GEST}} Valores
Empreendedorismo                     | {{NOTA_EMPREEND}} Valores

Por ser verdade, passou-se o presente Declaração que vai assinado e autenticado com o carimbo a Óleo ou Branco, em uso nesta Escola.

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

const SEED_DECL_NOTA_13_ID = 'tpl_seed_decl_nota_13_v1';
const SEED_DECL_NOTA_13: DocTemplate = {
  id: SEED_DECL_NOTA_13_ID,
  nome: 'Declaração com Nota — 13ª Classe (Pré-Universitário)',
  tipo: 'declaracao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `REPÚBLICA DE ANGOLA
MINISTÉRIO DA EDUCAÇÃO
ENSINO GERAL

DECLARAÇÃO

a) {{NOME_DIRECTOR}}, Director(a) do {{NOME_ESCOLA}}.

Declaro que {{NOME_COMPLETO}}, Filho (a) de {{PAI}} e de {{MAE}}, nascido (a) aos {{DATA_NASCIMENTO}}, natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}, portador do B.I ou Cédula Pessoal nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, passado pelo arquivo de Identificação de {{BI_LOCAL_EMISSAO}}.

Concluiu nesta Escola no Ano Lectivo de {{ANO_LECTIVO}} o {{CICLO}} do Ensino Secundário, 13ª Classe, na área de {{AREA}} com o resultado final de {{RESULTADO}} ({{RESULTADO_LETRA}}) no termo c, Pauta, nº {{PAUTA_NUMERO}}, A processa nº {{PROCESSO_NUMERO}} arquivada nesta Escola, com as seguintes classificações:

Disciplinas                          | 13ª Classe
-------------------------------------|-------------------
Língua Portuguesa                    | {{NOTA_LP}} Valores
Língua Estrangeira                   | {{NOTA_LE}} Valores
Matemática                           | {{NOTA_MAT}} Valores
Filosofia                            | {{NOTA_FIL}} Valores
Educação Física                      | {{NOTA_EF}} Valores
Direito Empresarial                  | {{NOTA_DIR_EMP}} Valores
Economia Avançada                    | {{NOTA_ECO_AV}} Valores
Gestão Financeira                    | {{NOTA_GEST_FIN}} Valores
Contabilidade Avançada               | {{NOTA_CONT_AV}} Valores

Por ser verdade, passou-se o presente Declaração que vai assinado e autenticado com o carimbo a Óleo ou Branco, em uso nesta Escola.

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

// ─── Disciplina → Note variable mapping ────────────────────────────────────

const DISCIPLINA_NOTA_MAP: Record<string, string[]> = {
  '{{NOTA_LP}}': ['língua portuguesa', 'lingua portuguesa', 'português', 'portugues'],
  '{{NOTA_LE}}': ['língua estrangeira', 'lingua estrangeira', 'inglês', 'ingles', 'francês', 'frances', 'língua inglesa', 'língua francesa'],
  '{{NOTA_MAT}}': ['matemática', 'matematica'],
  '{{NOTA_INF}}': ['informática', 'informatica'],
  '{{NOTA_EF}}': ['educação física', 'educacao fisica', 'ed. física', 'ed. fisica'],
  '{{NOTA_HIS}}': ['história', 'historia'],
  '{{NOTA_GEO}}': ['geografia'],
  '{{NOTA_INTRO_DIR}}': ['introdução ao direito', 'introducao ao direito', 'intro. ao direito'],
  '{{NOTA_INTRO_ECO}}': ['introdução à economia', 'introducao a economia', 'intro. à economia', 'intro. a economia'],
  '{{NOTA_DIR}}': ['direito'],
  '{{NOTA_ECO}}': ['economia'],
  '{{NOTA_GEST}}': ['gestão de empresas', 'gestao de empresas'],
  '{{NOTA_CONT}}': ['contabilidade'],
  '{{NOTA_FIL}}': ['filosofia'],
  '{{NOTA_DIR_COM}}': ['direito comercial'],
  '{{NOTA_ECO_POL}}': ['economia política', 'economia politica'],
  '{{NOTA_CONT_GEST}}': ['contabilidade e gestão', 'contabilidade e gestao'],
  '{{NOTA_EMPREEND}}': ['empreendedorismo'],
  '{{NOTA_DIR_EMP}}': ['direito empresarial'],
  '{{NOTA_ECO_AV}}': ['economia avançada', 'economia avancada'],
  '{{NOTA_GEST_FIN}}': ['gestão financeira', 'gestao financeira'],
  '{{NOTA_CONT_AV}}': ['contabilidade avançada', 'contabilidade avancada'],
};

// ─── Mapa de Aproveitamento ──────────────────────────────────────────────────

// ─── Mapa de Aproveitamento — Detalhado por Turma (IIIº Trimestre style) ──────

// ─── Mapa de Frequências — Por Curso e Classe (10ª–13ª) ──────────────────────

const SEED_MAPA_FREQUENCIAS_ID = 'tpl_seed_mapa_frequencias_v2';
const SEED_MAPA_FREQUENCIAS: DocTemplate = {
  id: SEED_MAPA_FREQUENCIAS_ID,
  nome: 'Mapa de Frequências — Por Curso e Classe (10ª–13ª)',
  tipo: 'mapa_frequencias',
  classeAlvo: 'FREQUENCIAS',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:'Arial',sans-serif;font-size:11px;line-height:1.7;color:#000;">

<div style="text-align:center;margin-bottom:6px;">
  <p style="font-weight:bold;font-size:12px;margin:2px 0;">REPÚBLICA DE ANGOLA</p>
  <p style="font-weight:bold;margin:2px 0;">MINISTÉRIO DA EDUCAÇÃO</p>
  <p style="font-weight:bold;margin:2px 0;">{{NOME_ESCOLA}}</p>
</div>

<br/>
<p style="font-weight:bold;text-align:center;font-size:13px;">MAPA DE FREQUÊNCIAS — ANO LECTIVO {{ANO_LECTIVO}}</p>
<p style="margin:4px 0;"><strong>Escola:</strong> {{NOME_ESCOLA}} &nbsp;&nbsp;&nbsp; <strong>Regime:</strong> {{REGIME}}</p>

<br/>
{{TABELA_MAPA_FREQUENCIAS}}

<br/>
<p style="margin-top:8px;">{{MUNICIPIO}}, {{DATA_ACTUAL}}.</p>
<br/><br/>
<table style="width:100%;border:none;border-collapse:collapse;">
  <tr>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O(A) Director(a) da Escola</p>
      <p style="margin-top:28px;">_________________________________</p>
      <p>{{NOME_DIRECTOR}}</p>
    </td>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O(A) Subdirector(a) Pedagógico(a)</p>
      <p style="margin-top:28px;">_________________________________</p>
      <p>{{NOME_SUBDIRECTOR_PEDAGOGICO}}</p>
    </td>
  </tr>
</table>

</div>`,
};

// ─── Mapa de Aproveitamento — Por Curso e Classe (10ª–13ª) ───────────────────

const SEED_MAPA_POR_CURSO_CLASSE_ID = 'tpl_seed_mapa_por_curso_classe_v2';
const SEED_MAPA_POR_CURSO_CLASSE: DocTemplate = {
  id: SEED_MAPA_POR_CURSO_CLASSE_ID,
  nome: 'Mapa de Aproveitamento — Por Curso e Classe (10ª–13ª)',
  tipo: 'mapa_aproveitamento',
  classeAlvo: 'CURSO_CLASSE',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:'Arial',sans-serif;font-size:11px;line-height:1.7;color:#000;">

<div style="text-align:center;margin-bottom:6px;">
  <p style="font-weight:bold;font-size:12px;margin:2px 0;">REPÚBLICA DE ANGOLA</p>
  <p style="font-weight:bold;margin:2px 0;">MINISTÉRIO DA EDUCAÇÃO</p>
  <p style="font-weight:bold;margin:2px 0;">{{NOME_ESCOLA}}</p>
</div>

<br/>
<p style="font-weight:bold;text-align:center;font-size:13px;">MAPA DE APROVEITAMENTO ESCOLAR DOS ALUNOS</p>
<p style="text-align:center;">Referente ao {{TRIMESTRE}}º Trimestre do Ano Lectivo de {{ANO_LECTIVO}} — Regime {{REGIME}}</p>
<p style="margin:4px 0;"><strong>Nome da Escola:</strong> {{NOME_ESCOLA}}</p>
<p style="font-size:9px;color:#555;margin:2px 0;">D: Desistente; AM: Anulação de Matrícula; T: Transferido; E: Excluído</p>

<br/>
{{TABELA_MAPA_APROVEITAMENTO}}

<br/>
<p style="margin-top:8px;">{{MUNICIPIO}}, {{DATA_ACTUAL}}.</p>
<br/><br/>
<table style="width:100%;border:none;border-collapse:collapse;">
  <tr>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O(A) Director(a) da Escola</p>
      <p style="margin-top:28px;">_________________________________</p>
      <p>{{NOME_DIRECTOR}}</p>
    </td>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O(A) Subdirector(a) Pedagógico(a)</p>
      <p style="margin-top:28px;">_________________________________</p>
      <p>{{NOME_SUBDIRECTOR_PEDAGOGICO}}</p>
    </td>
  </tr>
</table>

</div>`,
};


// ─── Mapa de Aproveitamento — Por Curso Individual (Oficial MED) ─────────────

const SEED_MAPA_APROVEITAMENTO_POR_CURSO_ID = 'tpl_seed_mapa_aproveitamento_por_curso_v1';
const SEED_MAPA_APROVEITAMENTO_POR_CURSO: DocTemplate = {
  id: SEED_MAPA_APROVEITAMENTO_POR_CURSO_ID,
  nome: 'Mapa de Aproveitamento — Por Curso (Oficial MED)',
  tipo: 'mapa_aproveitamento',
  classeAlvo: 'MAPA_POR_CURSO_INDIVIDUAL',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:'Times New Roman',serif;font-size:13px;line-height:1.8;color:#000;">

<p style="text-align:center;font-weight:bold;font-size:14px;">REPÚBLICA DE ANGOLA<br/>MINISTÉRIO DA EDUCAÇÃO</p>
<p style="text-align:center;font-weight:bold;font-size:13px;">{{NOME_ESCOLA}}</p>

<br/>
<p style="font-weight:bold;">Mapa de Aproveitamento dos alunos {{TRIMESTRE}}º Trimestre — Regime {{REGIME}} — Ano Lectivo de {{ANO_LECTIVO}}</p>
<p><strong>Nome da Escola:</strong> {{NOME_ESCOLA}} &nbsp;&nbsp;&nbsp; <strong>Curso:</strong> {{NOME_CURSO}}</p>

<br/>
<p>{{TABELA_MAPA_APROVEITAMENTO_CURSO}}</p>

<br/>
<p>{{MUNICIPIO}}, {{DATA_ACTUAL}}.</p>
<br/><br/>
<table style="width:100%;border:none;">
  <tr>
    <td style="width:50%;border:none;"></td>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O Subdirector Pedagógico</p>
      <p>_________________________________</p>
      <p>{{NOME_SUBDIRECTOR_PEDAGOGICO}}</p>
    </td>
  </tr>
</table>

</div>`,
};


// ─── Mapa de Aproveitamento — Ensino Primário (Tabela Oficial MED) ───────────

const SEED_MAPA_PRIM_TABELA_ID = 'tpl_seed_mapa_prim_tabela_v1';
const SEED_MAPA_PRIM_TABELA: DocTemplate = {
  id: SEED_MAPA_PRIM_TABELA_ID,
  nome: 'Mapa de Aproveitamento — Ensino Primário (Oficial MED)',
  tipo: 'mapa_aproveitamento',
  classeAlvo: 'MAPA_PRIMARIO_TABELA',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:'Arial',sans-serif;font-size:11px;line-height:1.7;color:#000;">

<div style="text-align:center;">
  <p style="font-weight:bold;margin:2px 0;">REPÚBLICA DE ANGOLA</p>
  <p style="font-weight:bold;margin:2px 0;">MINISTÉRIO DA EDUCAÇÃO</p>
  <p style="font-weight:bold;margin:2px 0;">GOVERNO DA PROVÍNCIA DE ___________________________</p>
  <p style="font-weight:bold;margin:2px 0;">DIRECÇÃO MUNICIPAL DE EDUCAÇÃO DE {{MUNICIPIO}}</p>
  <p style="font-weight:bold;margin:2px 0;">{{NOME_ESCOLA}}</p>
</div>

<br/>
<p style="font-weight:bold;text-align:center;">MAPA DE APROVEITAMENTO DO {{TRIMESTRE}}º TRIMESTRE DO ANO LECTIVO {{ANO_LECTIVO}} — ENSINO PRIMÁRIO</p>
<p style="text-align:left;"><strong>ESCOLA:</strong> {{NOME_ESCOLA}}&nbsp;&nbsp;&nbsp;<strong>REGIME:</strong> {{REGIME}}</p>

<br/>
{{TABELA_MAPA_APROV_PRIMARIO}}

<br/>
<p style="text-align:left;">{{MUNICIPIO}}, {{DATA_ACTUAL}}.</p>
<br/><br/>
<table style="width:100%;border:none;border-collapse:collapse;">
  <tr>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O Director(a) da Escola</p>
      <p style="margin-top:24px;">_________________________________</p>
      <p>{{NOME_DIRECTOR}}</p>
    </td>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O(A) Subdirector(a) Pedagógico(a)</p>
      <p style="margin-top:24px;">_________________________________</p>
      <p>{{NOME_SUBDIRECTOR_PEDAGOGICO}}</p>
    </td>
  </tr>
</table>

</div>`,
};

// ─── Mapa de Aproveitamento — I Ciclo (Tabela Oficial MED) ───────────────────

const SEED_MAPA_I_CICLO_TABELA_ID = 'tpl_seed_mapa_i_ciclo_tabela_v1';
const SEED_MAPA_I_CICLO_TABELA: DocTemplate = {
  id: SEED_MAPA_I_CICLO_TABELA_ID,
  nome: 'Mapa de Aproveitamento — I Ciclo (Oficial MED)',
  tipo: 'mapa_aproveitamento',
  classeAlvo: 'MAPA_I_CICLO_TABELA',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:'Arial',sans-serif;font-size:11px;line-height:1.7;color:#000;">

<div style="text-align:center;">
  <p style="font-weight:bold;margin:2px 0;">REPÚBLICA DE ANGOLA</p>
  <p style="font-weight:bold;margin:2px 0;">MINISTÉRIO DA EDUCAÇÃO</p>
  <p style="font-weight:bold;margin:2px 0;">GOVERNO DA PROVÍNCIA DE ___________________________</p>
  <p style="font-weight:bold;margin:2px 0;">DIRECÇÃO MUNICIPAL DE EDUCAÇÃO DE {{MUNICIPIO}}</p>
  <p style="font-weight:bold;margin:2px 0;">{{NOME_ESCOLA}}</p>
</div>

<br/>
<p style="font-weight:bold;text-align:center;">MAPA DE APROVEITAMENTO DO {{TRIMESTRE}}º TRIMESTRE DO ANO LECTIVO {{ANO_LECTIVO}} — I CICLO DO ENSINO SECUNDÁRIO</p>
<p style="text-align:left;"><strong>ESCOLA:</strong> {{NOME_ESCOLA}}&nbsp;&nbsp;&nbsp;<strong>REGIME:</strong> {{REGIME}}</p>

<br/>
{{TABELA_MAPA_APROV_I_CICLO}}

<br/>
<p style="text-align:left;">{{MUNICIPIO}}, {{DATA_ACTUAL}}.</p>
<br/><br/>
<table style="width:100%;border:none;border-collapse:collapse;">
  <tr>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O Director(a) da Escola</p>
      <p style="margin-top:24px;">_________________________________</p>
      <p>{{NOME_DIRECTOR}}</p>
    </td>
    <td style="width:50%;border:none;text-align:center;">
      <p style="font-weight:bold;">O(A) Subdirector(a) Pedagógico(a)</p>
      <p style="margin-top:24px;">_________________________________</p>
      <p>{{NOME_SUBDIRECTOR_PEDAGOGICO}}</p>
    </td>
  </tr>
</table>

</div>`,
};

// ─── Certificado II Ciclo (10ª, 11ª, 12ª) — Ensino Secundário Geral ─────────

const SEED_CERT_II_CICLO_ID = 'tpl_seed_cert_ii_ciclo_v1';
const SEED_CERT_II_CICLO: DocTemplate = {
  id: SEED_CERT_II_CICLO_ID,
  nome: 'Certificado — II Ciclo (10ª, 11ª, 12ª) Ensino Secundário Geral',
  tipo: 'certificado',
  classeAlvo: '12ª-II-CICLO',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `CERTIFICADO — IIº CICLO ENSINO SECUNDÁRIO GERAL (10ª, 11ª, 12ª)

Director(a): {{NOME_DIRECTOR}} — {{NOME_ESCOLA}}
Aluno: {{NOME_COMPLETO}}
Filho(a) de {{PAI}} e de {{MAE}}
Nascido(a) aos {{DIA_NASC}}/{{MES_NASC}}/{{ANO_NASC}}
Natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}
BI nº {{BI_NUMERO}}, passado pelo Arquivo de {{BI_LOCAL_EMISSAO}}, aos {{BI_DATA_EMISSAO}}
Processo nº {{PROCESSO_NUMERO}}

Concluiu no Ano Lectivo {{ANO_LECTIVO}} o IIº Ciclo do Ensino Secundário Geral
Área: {{AREA}} | Média Final: {{RESULTADO}} ({{RESULTADO_LETRA}})

Tabela de notas: 10ª Classe | 11ª Classe | 12ª Classe | Média Final | Extenso
(gerada automaticamente a partir das notas lançadas por classe)

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.

{{CODIGO_BARRAS}}`,
};

// ─── Certificado ITAQ — 13ª Classe (Técnico-Profissional) ───────────────────

const SEED_CERT_ITAQ_13_ID = 'tpl_seed_cert_itaq_13_v1';
const SEED_CERT_ITAQ_13: DocTemplate = {
  id: SEED_CERT_ITAQ_13_ID,
  nome: 'Certificado de Habilitações — ITAQ 13ª (Técnico-Profissional)',
  tipo: 'certificado',
  classeAlvo: '13ª-ITAQ',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `CERTIFICADO — IIº CICLO ENSINO SECUNDÁRIO TÉCNICO (ITAQ)

Director(a): {{NOME_DIRECTOR}} — {{NOME_ESCOLA}}
Aluno: {{NOME_COMPLETO}}
Filho(a) de {{PAI}} e de {{MAE}}
Nascido(a) aos {{DIA_NASC}} de {{MES_NASC}} de {{ANO_NASC}}
Natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}
BI nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, Arquivo de {{BI_LOCAL_EMISSAO}}

Concluiu no Ano Lectivo {{ANO_LECTIVO}} o IIº Ciclo Ensino Secundário Técnico
Especialidade: {{AREA}} | Média Final: {{RESULTADO}} ({{RESULTADO_LETRA}})
Pauta nº {{PAUTA_NUMERO}} | Processo nº {{PROCESSO_NUMERO}}

{{TABELA_NOTAS}}

PROVA DE APTIDÃO PROFISSIONAL (PAP)
Nota de Estágio: {{NOTA_ESTAGIO}} | Nota de Defesa: {{NOTA_DEFESA}}
Nota PAP Final: {{NOTA_PAP}} — {{NOTA_PAP_EXTENSO}}

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

// ─── Certificados de Habilitações — II Ciclo (11ª, 12ª, 13ª) ────────────────

const SEED_CERT_HAB_11_ID = 'tpl_seed_cert_hab_11_v1';
const SEED_CERT_HAB_11: DocTemplate = {
  id: SEED_CERT_HAB_11_ID,
  nome: 'Certificado de Habilitações — 11ª Classe',
  tipo: 'certificado',
  classeAlvo: '11ª',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `CERTIFICADO DE HABILITAÇÕES — 11ª Classe (IIº Ciclo)

Director(a): {{NOME_DIRECTOR}} — {{NOME_ESCOLA}}
Aluno: {{NOME_COMPLETO}}
Filho(a) de {{PAI}} e de {{MAE}}
Nascido(a) aos {{DIA_NASC}} de {{MES_NASC}} de {{ANO_NASC}}
Natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}
BI nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, Arquivo de {{BI_LOCAL_EMISSAO}}

Concluiu no Ano Lectivo de {{ANO_LECTIVO}} o IIº Ciclo — 11ª Classe
Área: {{AREA}} | Média Final: {{RESULTADO}} ({{RESULTADO_LETRA}})
Pauta nº {{PAUTA_NUMERO}} | Processo nº {{PROCESSO_NUMERO}}

Disciplinas: LP, LE, MAT, INF, EF, Direito, Economia, Gestão, Contabilidade

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

const SEED_CERT_HAB_12_ID = 'tpl_seed_cert_hab_12_v1';
const SEED_CERT_HAB_12: DocTemplate = {
  id: SEED_CERT_HAB_12_ID,
  nome: 'Certificado de Habilitações — 12ª Classe',
  tipo: 'certificado',
  classeAlvo: '12ª',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `CERTIFICADO DE HABILITAÇÕES — 12ª Classe (IIº Ciclo)

Director(a): {{NOME_DIRECTOR}} — {{NOME_ESCOLA}}
Aluno: {{NOME_COMPLETO}}
Filho(a) de {{PAI}} e de {{MAE}}
Nascido(a) aos {{DIA_NASC}} de {{MES_NASC}} de {{ANO_NASC}}
Natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}
BI nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, Arquivo de {{BI_LOCAL_EMISSAO}}

Concluiu no Ano Lectivo de {{ANO_LECTIVO}} o IIº Ciclo — 12ª Classe
Área: {{AREA}} | Média Final: {{RESULTADO}} ({{RESULTADO_LETRA}})
Pauta nº {{PAUTA_NUMERO}} | Processo nº {{PROCESSO_NUMERO}}

Disciplinas: LP, LE, MAT, FIL, EF, Dir. Comercial, Eco. Política, Cont. e Gestão, Empreendedorismo

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

const SEED_CERT_HAB_13_ID = 'tpl_seed_cert_hab_13_v1';
const SEED_CERT_HAB_13: DocTemplate = {
  id: SEED_CERT_HAB_13_ID,
  nome: 'Certificado de Habilitações — 13ª Classe (Pré-Universitário)',
  tipo: 'certificado',
  classeAlvo: '13ª',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `CERTIFICADO DE HABILITAÇÕES — 13ª Classe

Director(a): {{NOME_DIRECTOR}} — {{NOME_ESCOLA}}
Aluno: {{NOME_COMPLETO}}
Filho(a) de {{PAI}} e de {{MAE}}
Nascido(a) aos {{DIA_NASC}} de {{MES_NASC}} de {{ANO_NASC}}
Natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}, Província de {{PROVINCIA}}
BI nº {{BI_NUMERO}}, emitido aos {{BI_DATA_EMISSAO}}, Arquivo de {{BI_LOCAL_EMISSAO}}

Concluiu no Ano Lectivo de {{ANO_LECTIVO}} o IIº Ciclo — 13ª Classe
Área: {{AREA}} | Média Final: {{RESULTADO}} ({{RESULTADO_LETRA}})
Pauta nº {{PAUTA_NUMERO}} | Processo nº {{PROCESSO_NUMERO}}

{{TABELA_NOTAS}}

PROVA DE APTIDÃO PROFISSIONAL (PAP) — Ensino Técnico-Profissional
Nota de Estágio: {{NOTA_ESTAGIO}} | Nota de Defesa: {{NOTA_DEFESA}}
Nota PAP Final: {{NOTA_PAP}} — {{NOTA_PAP_EXTENSO}}

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}.`,
};

// ─── Certificado de Habilitações Literárias (II Ciclo Pedagógico) Seed ──────

const SEED_CERT_HAB_LIT_ID = 'tpl_seed_cert_hab_lit_pedagogico_v1';
const SEED_CERT_HAB_LIT: DocTemplate = {
  id: SEED_CERT_HAB_LIT_ID,
  nome: 'Certificado de Habilitações Literárias — IIº Ciclo Pedagógico (10ª a 13ª)',
  tipo: 'certificado',
  classeAlvo: 'PEDAGOGICO-II-CICLO',
  bloqueado: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `[CERTIFICADO DE HABILITAÇÕES LITERÁRIAS — GERADO AUTOMATICAMENTE]

Este modelo gera o Certificado oficial de conclusão do II Ciclo do Ensino Secundário Pedagógico (10ª a 13ª Classe).

Ao emitir, seleccione o aluno e o sistema irá preencher automaticamente:
• Nome completo, filiação e dados pessoais do aluno
• Turma e ano lectivo de cada classe (10ª, 11ª, 12ª, 13ª)
• Tabela de classificações por disciplina e por classe
• Médias gerais por classe e média curricular final
• Cabeçalho institucional e rodapé para assinatura

Campos a preencher manualmente:
• Número e data do Bilhete de Identidade
• Nº e data do Decreto Executivo de criação da escola
• Especialidade / área de formação
• Livro de registo e folha

Director(a): {{NOME_DIRECTOR}}
Escola: {{NOME_ESCOLA}}`,
};

// ─── Certificado Ensino Secundário Técnico-Profissional Seed ─────────────────

const SEED_CERT_TECNICO_PROF_ID = 'tpl_seed_cert_tecnico_profissional_v1';
const SEED_CERT_TECNICO_PROF: DocTemplate = {
  id: SEED_CERT_TECNICO_PROF_ID,
  nome: 'Certificado — Ensino Secundário Técnico-Profissional (IIº Ciclo)',
  tipo: 'certificado',
  classeAlvo: 'TECNICO-PROFISSIONAL',
  bloqueado: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `[CERTIFICADO TÉCNICO-PROFISSIONAL — GERADO AUTOMATICAMENTE]

Este modelo gera o Certificado oficial de conclusão do II Ciclo do Ensino Secundário Técnico-Profissional.

Dados preenchidos automaticamente (da base de dados):
• Nome completo, pai/encarregado, data de nascimento, município e província do aluno
• Ano lectivo (da turma actual do aluno)
• Nome da escola e Director(a) (das configurações)
• Tabela de classificações organizadas por componente:
  — Componente Sócio-cultural (L. Portuguesa, L. Estrangeira, F. Atitudes Integradoras, Ed. Física)
  — Componente Científica (Matemática, Biologia, Física, Química, Informática, Psicologia, etc.)
  — Componente Técnica, Tecnológica e Prática (todas as disciplinas restantes lançadas no sistema)
• Média por Plano Curricular (PC) = média de todas as disciplinas
• Prova de Aptidão Profissional (PAP) = se existir nota com nome "PAP" ou "Aptidão Profissional"
• Classificação Final por Curso = (2×PC + PAP) / 3 (se PAP disponível)

Campos a preencher manualmente:
• Número, data e arquivo do Bilhete de Identidade
• Nome da mãe do aluno
• Número e data do Decreto Executivo de criação da escola
• Especialidade / Área de formação técnica
• Livro de registo e folha (para efeitos legais)
• Assinatura do Director Provincial ("Visto")

Director(a): {{NOME_DIRECTOR}}
Escola: {{NOME_ESCOLA}}`,
};

// ─── Ficha de Matrícula Seed ─────────────────────────────────────────────────

const SEED_FICHA_MATRICULA_ID = 'tpl_seed_ficha_reconfirmacao_matricula_v1';

const SEED_FICHA_MATRICULA: DocTemplate = {
  id: SEED_FICHA_MATRICULA_ID,
  nome: 'Ficha de Reconfirmação de Matrícula',
  tipo: 'ficha_matricula',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `FICHA DE RECONFIRMAÇÃO DE MATRÍCULA

Nome do Aluno: {{NOME_COMPLETO}}
Filho(a) de {{PAI}} e de {{MAE}}
Nascido(a) aos {{DIA_NASC}} de {{MES_NASC}} de {{ANO_NASC}} Natural de {{NATURALIDADE}}, Município de {{MUNICIPIO}}
Província de {{PROVINCIA}} portador(a) do B.I ou Cédula pessoal nº {{BI_NUMERO}}
emitido aos {{BI_DATA_EMISSAO}} pela direcção nacional de identificação
ou conservatória de registo civil de {{BI_LOCAL_EMISSAO}}.

Nome do encarregado: {{NOME_ENCARREGADO}}
Profissão: {{ENCARREGADO_PROFISSAO}}    Local de trabalho: {{ENCARREGADO_LOCAL_TRABALHO}}
Residência: {{ENCARREGADO_RESIDENCIA}}
Contactos: {{TELEFONE_ENCARREGADO}} ou {{ENCARREGADO_CONTACTO2}}

Classe actual: {{CLASSE}}   Turma: {{TURMA}}   Ano Lectivo: {{ANO_LECTIVO}}

──────────────────────────────────────────────
FREQUÊNCIA ESCOLAR DO ALUNO
──────────────────────────────────────────────

{{NOME_ESCOLA}}, {{DATA_ACTUAL}}`,
};

// ─── Comprovativo de Matrícula Seed ──────────────────────────────────────────

const SEED_COMPROVATIVO_MATRICULA_ID = 'tpl_seed_comprovativo_matricula_v1';

const SEED_COMPROVATIVO_MATRICULA: DocTemplate = {
  id: SEED_COMPROVATIVO_MATRICULA_ID,
  nome: 'Comprovativo de Matrícula',
  tipo: 'comprovativo_matricula',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:Arial,sans-serif;font-size:10pt;color:#000;max-width:700px;margin:0 auto;">

<!-- CABEÇALHO INSTITUCIONAL -->
<table style="width:100%;border-collapse:collapse;">
  <tr>
    <td style="width:72px;text-align:center;vertical-align:middle;padding:0 8px 0 0;">
      <div style="width:68px;height:68px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#666;">[Brasão]</div>
    </td>
    <td style="text-align:center;vertical-align:middle;">
      <div style="font-size:7.5pt;text-transform:uppercase;color:#555;letter-spacing:1.2px;font-weight:600;">República de Angola &bull; Ministério da Educação &bull; Ensino Geral</div>
      <div style="font-size:15pt;font-weight:900;text-transform:uppercase;margin:4px 0;">{{NOME_ESCOLA}}</div>
      <div style="font-size:8pt;color:#555;">{{MUNICIPIO}}</div>
    </td>
    <td style="width:96px;text-align:center;vertical-align:middle;padding:0 0 0 8px;">
      <div style="border:1.5px solid #1E3A5F;padding:3px;display:inline-block;">
        <div style="width:86px;height:86px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#666;">[QR Code]</div>
      </div>
      <div style="font-size:6pt;color:#444;margin-top:2px;font-weight:bold;">{{NUMERO_MATRICULA}}</div>
    </td>
  </tr>
</table>
<div style="border-bottom:3px double #1E3A5F;margin:6px 0 10px;"></div>

<!-- TÍTULO DO DOCUMENTO -->
<div style="text-align:center;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;margin-bottom:8px;">
  <div style="font-size:12pt;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;">COMPROVATIVO DE MATRÍCULA</div>
  <div style="font-size:8.5pt;color:#444;margin-top:2px;">Ano Lectivo {{ANO_LECTIVO}} &nbsp;&bull;&nbsp; Emitido em: {{DATA_ACTUAL}}</div>
</div>

<!-- A — IDENTIFICAÇÃO DO ALUNO -->
<div style="font-weight:800;font-size:9.5pt;padding:4px 10px;background:#f0f4f8;border-left:4px solid #1E3A5F;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">A — Identificação do Aluno</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #ccc;margin-bottom:10px;">
  <tr>
    <td style="padding:8px 14px;width:40%;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Nome Completo</td>
    <td style="padding:8px 14px;font-size:13pt;font-weight:900;">{{NOME_COMPLETO}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Nº Matrícula</td>
    <td style="padding:6px 14px;font-weight:700;">{{NUMERO_MATRICULA}}</td>
  </tr>
  <tr>
    <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">BI / Cédula</td>
    <td style="padding:6px 14px;">{{BI_NUMERO}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Data de Nascimento</td>
    <td style="padding:6px 14px;">{{DATA_NASCIMENTO}}</td>
  </tr>
  <tr>
    <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Género</td>
    <td style="padding:6px 14px;">{{GENERO}}</td>
  </tr>
</table>

<!-- B — DADOS ACADÉMICOS -->
<div style="font-weight:800;font-size:9.5pt;padding:4px 10px;background:#f0f4f8;border-left:4px solid #1E3A5F;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">B — Dados Académicos</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #ccc;margin-bottom:10px;">
  <tr>
    <td style="padding:8px 12px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="font-size:7.5pt;color:#555;text-transform:uppercase;">Classe</div>
      <div style="font-size:11pt;font-weight:800;margin-top:2px;">{{CLASSE}}</div>
    </td>
    <td style="padding:8px 12px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="font-size:7.5pt;color:#555;text-transform:uppercase;">Turma</div>
      <div style="font-size:11pt;font-weight:800;margin-top:2px;">{{TURMA}}</div>
    </td>
    <td style="padding:8px 12px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="font-size:7.5pt;color:#555;text-transform:uppercase;">Nível</div>
      <div style="font-size:11pt;font-weight:800;margin-top:2px;">{{NIVEL}}</div>
    </td>
    <td style="padding:8px 12px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="font-size:7.5pt;color:#555;text-transform:uppercase;">Turno</div>
      <div style="font-size:11pt;font-weight:800;margin-top:2px;">{{TURNO}}</div>
    </td>
    <td style="padding:8px 12px;text-align:center;">
      <div style="font-size:7.5pt;color:#555;text-transform:uppercase;">Ano Lectivo</div>
      <div style="font-size:11pt;font-weight:800;margin-top:2px;">{{ANO_LECTIVO}}</div>
    </td>
  </tr>
</table>

<!-- C — PLANO CURRICULAR (gerado automaticamente ao emitir) -->
<div style="font-weight:800;font-size:9.5pt;padding:4px 10px;background:#f0f4f8;border-left:4px solid #1E3A5F;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">C — Plano Curricular — {{CLASSE}} Classe</div>
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:8px 12px;margin-bottom:10px;font-size:8.5pt;color:#0369a1;">
  <strong>{{TABELA_PLANO_CURRICULAR}}</strong> — Tabela de disciplinas e carga horária gerada automaticamente ao emitir a partir do plano curricular da classe/curso do aluno.
</div>

<!-- D — DISCIPLINAS COM DEFICIÊNCIA (gerado automaticamente ao emitir, apenas se existirem) -->
<div style="font-weight:800;font-size:9.5pt;padding:4px 10px;background:#fff7ed;border-left:4px solid #d97706;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">D — Disciplinas com Deficiência (Art. 23º §10 — Decreto 04/2026)</div>
<div style="background:#fff7ed;border:1px solid #fbbf24;border-radius:4px;padding:8px 12px;margin-bottom:14px;font-size:8.5pt;color:#92400e;">
  <strong>{{TABELA_DEFICIENCIAS}}</strong> — Tabela de disciplinas com deficiência (média 7–9 val.) gerada automaticamente ao emitir. Só aparece se o aluno tiver disciplinas em deficiência.
</div>

<!-- DECLARAÇÃO E ASSINATURAS -->
<div style="border-top:2px solid #000;padding-top:10px;margin-top:6px;">
  <div style="font-weight:bold;text-align:center;font-size:11pt;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Declaração</div>
  <p style="font-size:9.5pt;line-height:1.7;text-align:justify;">
    O(A) aluno(a) <strong>{{NOME_COMPLETO}}</strong>, portador(a) do BI/Cédula Nº <strong>{{BI_NUMERO}}</strong>, fica ciente do plano curricular da <strong>{{CLASSE}} Classe</strong> — Turma <strong>{{TURMA}}</strong>, relativo ao Ano Lectivo <strong>{{ANO_LECTIVO}}</strong>, comprometendo-se a cumprir todas as obrigações académicas e o Regulamento Interno da Instituição.
  </p>
  <p style="text-align:center;margin:16px 0 8px;font-size:9.5pt;">{{MUNICIPIO}}, _____ de _________________ de <strong>{{ANO_LECTIVO}}</strong></p>
  <table style="width:100%;margin-top:22px;border-collapse:collapse;">
    <tr>
      <td style="text-align:center;font-size:9pt;padding:0 6px;">
        <div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div>
        <div>Assinatura do(a) Aluno(a) / Encarregado</div>
      </td>
      <td style="text-align:center;font-size:9pt;padding:0 6px;">
        <div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div>
        <div>O Funcionário da Secretaria</div>
      </td>
      <td style="text-align:center;font-size:9pt;padding:0 6px;">
        <div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div>
        <div>O Director(a) da Escola<br/><strong>{{NOME_DIRECTOR}}</strong></div>
      </td>
    </tr>
  </table>
</div>

<!-- RODAPÉ -->
<table style="width:100%;margin-top:14px;border-top:1px solid #ccc;border-collapse:collapse;">
  <tr>
    <td style="font-size:7.5pt;color:#555;padding-top:5px;">{{NOME_ESCOLA}}</td>
    <td style="font-size:7.5pt;color:#555;padding-top:5px;text-align:center;">Nº Matrícula: {{NUMERO_MATRICULA}}</td>
    <td style="font-size:7.5pt;color:#555;padding-top:5px;text-align:right;">Emitido em: {{DATA_ACTUAL}}</td>
  </tr>
</table>

</div>`,
};

// ─── Recibo de Vencimento Seed ───────────────────────────────────────────────

const SEED_RECIBO_SALARIO_ID = 'tpl_seed_recibo_salario_v1';

const SEED_RECIBO_SALARIO: DocTemplate = {
  id: SEED_RECIBO_SALARIO_ID,
  nome: 'Recibo de Vencimento',
  tipo: 'recibo_salario',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<div style="font-family:'Times New Roman',Times,serif;max-width:700px;margin:0 auto;padding:32px;border:2px solid #1a2540;border-radius:8px;">

<div style="text-align:center;margin-bottom:20px;">
  <p style="font-size:13pt;font-weight:bold;letter-spacing:1px;margin:0;">{{NOME_ESCOLA}}</p>
  <h2 style="font-size:16pt;font-weight:bold;text-transform:uppercase;margin:6px 0 2px;">RECIBO DE VENCIMENTO</h2>
  <p style="font-size:12pt;margin:0;color:#444;">{{MES_ANO_FOLHA}}</p>
</div>

<hr style="border:1px solid #1a2540;margin:16px 0;">

<p style="font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Funcionário</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
  <tr>
    <td style="padding:4px 8px;font-weight:bold;width:35%;">Nome</td>
    <td style="padding:4px 8px;">{{FUNC_NOME}}</td>
  </tr>
  <tr style="background:#f5f7ff;">
    <td style="padding:4px 8px;font-weight:bold;">Cargo</td>
    <td style="padding:4px 8px;">{{FUNC_CARGO}}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;font-weight:bold;">Categoria</td>
    <td style="padding:4px 8px;">{{FUNC_CATEGORIA}}</td>
  </tr>
</table>

<hr style="border:1px solid #ddd;margin:12px 0;">

<p style="font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Vencimentos</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
  <tr>
    <td style="padding:4px 8px;width:65%;">Salário Base</td>
    <td style="padding:4px 8px;text-align:right;">{{SALARIO_BASE}}</td>
  </tr>
  <tr style="background:#f5f7ff;">
    <td style="padding:4px 8px;">Subsídio de Alimentação</td>
    <td style="padding:4px 8px;text-align:right;">{{SUB_ALIMENTACAO}}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;">Subsídio de Transporte</td>
    <td style="padding:4px 8px;text-align:right;">{{SUB_TRANSPORTE}}</td>
  </tr>
  <tr style="background:#f5f7ff;">
    <td style="padding:4px 8px;">Subsídio de Habitação</td>
    <td style="padding:4px 8px;text-align:right;">{{SUB_HABITACAO}}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;">Outros Subsídios</td>
    <td style="padding:4px 8px;text-align:right;">{{OUTROS_SUBSIDIOS}}</td>
  </tr>
  <tr style="background:#e8f5e9;">
    <td style="padding:6px 8px;font-weight:bold;">Total Bruto</td>
    <td style="padding:6px 8px;text-align:right;font-weight:bold;">{{SALARIO_BRUTO}}</td>
  </tr>
</table>

<hr style="border:1px solid #ddd;margin:12px 0;">

<p style="font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Descontos</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
  <tr>
    <td style="padding:4px 8px;width:65%;">INSS Empregado (3%)</td>
    <td style="padding:4px 8px;text-align:right;color:#c0392b;">{{INSS_EMPREGADO}}</td>
  </tr>
  <tr style="background:#fff5f5;">
    <td style="padding:4px 8px;">IRT (tabela progressiva)</td>
    <td style="padding:4px 8px;text-align:right;color:#c0392b;">{{IRT}}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;">Outros Descontos</td>
    <td style="padding:4px 8px;text-align:right;color:#c0392b;">{{OUTROS_DESCONTOS}}</td>
  </tr>
  <tr style="background:#fce8e8;">
    <td style="padding:6px 8px;font-weight:bold;">Total Descontos</td>
    <td style="padding:6px 8px;text-align:right;font-weight:bold;color:#c0392b;">{{TOTAL_DESCONTOS}}</td>
  </tr>
</table>

<hr style="border:2px solid #1a2540;margin:12px 0;">

<div style="background:#e8f5e9;border-radius:6px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
  <span style="font-size:13pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Salário Líquido a Receber</span>
  <span style="font-size:16pt;font-weight:bold;color:#1a7a40;">{{SALARIO_LIQUIDO}}</span>
</div>

<div style="background:#f0f4ff;border-radius:4px;padding:8px 12px;margin-bottom:20px;font-size:10pt;color:#555;">
  Encargo patronal INSS (8%) — não desconta no funcionário: <strong>{{INSS_PATRONAL}}</strong>
</div>

<hr style="border:1px solid #ddd;margin:16px 0;">

<div style="display:flex;justify-content:space-between;align-items:center;">
  <p style="font-size:9pt;color:#888;margin:0;">Documento gerado pelo QUETA · {{DATA_ACTUAL}}</p>
  <span style="font-size:10pt;color:#555;">Estado: <strong>{{STATUS_FOLHA}}</strong></span>
</div>

<div style="margin-top:40px;text-align:center;">
  <p style="margin:0;font-size:10pt;">O Director(a)</p>
  <p style="margin:4px 0 0;font-size:9pt;color:#888;">_________________________________</p>
  <p style="margin:4px 0 0;font-size:10pt;font-weight:bold;">{{NOME_DIRECTOR}}</p>
</div>

</div>`,
};

// ─── Boletim de Inscrição Seed ──────────────────────────────────────────────

const SEED_BOLETIM_INSCRICAO_ID = 'tpl_seed_boletim_inscricao_v1';

const SEED_BOLETIM_INSCRICAO: DocTemplate = {
  id: SEED_BOLETIM_INSCRICAO_ID,
  nome: 'Boletim de Inscrição',
  tipo: 'ficha_inscricao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `BOLETIM DE INSCRIÇÃO — Processo de Admissão

Este modelo gera o Boletim de Inscrição oficial para candidatos ao processo de admissão.

Ao clicar em "Emitir", poderá pesquisar e seleccionar um candidato pelo nome ou código para gerar o seu boletim individual com QR Code e exportar em PDF.

Dados preenchidos automaticamente:
• Nome completo do candidato
• Data de nascimento e género
• Província e município
• Contacto e email
• Nível e classe pretendida
• Nome do encarregado de educação
• Estado do processo (pendente, aprovado, admitido, matriculado)
• Referência RUPE de inscrição (se gerada)
• Data do exame de admissão (se definida)
• Nota do exame de admissão (se lançada)
• Código único de inscrição e QR Code de verificação

O documento é emitido em formato A4 pronto para impressão e inclui declaração sob compromisso de honra com campos de assinatura.`,
};

// ─── Ficha Individual do Aluno Seed ──────────────────────────────────────────

const SEED_FICHA_INDIVIDUAL_ID = 'tpl_seed_ficha_individual_v4';

const SEED_FICHA_INDIVIDUAL: DocTemplate = {
  id: SEED_FICHA_INDIVIDUAL_ID,
  nome: 'Ficha Individual do Aluno',
  tipo: 'ficha_individual',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: FICHA_INDIVIDUAL_DEFAULT,
};

// ─── Boletim de Matrícula Seed ───────────────────────────────────────────────

const SEED_BOLETIM_MATRICULA_ID = 'tpl_seed_boletim_matricula_v1';

const SEED_BOLETIM_MATRICULA: DocTemplate = {
  id: SEED_BOLETIM_MATRICULA_ID,
  nome: 'Boletim de Matrícula',
  tipo: 'boletim_matricula',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `BOLETIM DE MATRÍCULA — Processo de Admissão

Este modelo gera o Boletim de Matrícula oficial para candidatos admitidos ou já matriculados.

Ao clicar em "Emitir", poderá pesquisar e seleccionar um candidato pelo nome ou código para gerar o seu boletim individual com QR Code e exportar em PDF.

Dados preenchidos automaticamente:
• Nome completo do candidato
• Data de nascimento e género
• Província e município
• Contacto e email
• Nível e classe atribuída
• Curso / área de formação (para a 10ª classe)
• Nome do encarregado de educação
• Estado da matrícula (admitido ou matriculado)
• Nota do exame de admissão (se lançada)
• Código único de matrícula e QR Code de verificação

O documento é emitido em formato A4 pronto para impressão e inclui declaração sob compromisso de honra com campos de assinatura para o aluno, secretaria e direcção.`,
};

// ─── Lista de Estudantes Admitidos Seed ──────────────────────────────────────

const SEED_LISTA_ADMITIDOS_ID = 'tpl_seed_lista_admitidos_v1';

const SEED_LISTA_ADMITIDOS: DocTemplate = {
  id: SEED_LISTA_ADMITIDOS_ID,
  nome: 'Lista de Resultados de Admissão',
  tipo: 'lista_admitidos',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `LISTA DE RESULTADOS DE ADMISSÃO — Com Estado e Nota por Estudante

Escola: {{NOME_ESCOLA}}
Ano Lectivo: {{ANO_LECTIVO}}

Este modelo gera a lista oficial de resultados do processo de admissão, emitida após o lançamento das notas.

Ao clicar em "Emitir", poderá filtrar por:
• Estado: Admitidos (incl. Matriculados) | Não Admitidos | Todos os Resultados
• Classe: Todas as classes ou uma classe específica

Organização automática:
• Ensino Primário (1ª–6ª Classe): separado por classe
• I Ciclo (7ª–9ª Classe): separado por classe
• II Ciclo (10ª–13ª Classe): separado por classe e, dentro de cada classe, por curso / área de formação

Dados incluídos em cada linha:
• Nome completo do estudante
• Sexo e idade
• Nota do exame de admissão ({{NOTA_ADMISSAO}}/20)
• Estado: ADMITIDO (verde) | MATRICULADO (dourado) | NÃO ADMITIDO (vermelho)
• Telefone de contacto

A lista inclui totais por grupo (M/F, admitidos, não admitidos) e espaço para assinaturas do Secretário(a) e Director(a).`,
};

// ─── Seed: Lista de Estudantes Inscritos ──────────────────────────────────────

const SEED_LISTA_INSCRITOS_ID = 'tpl_seed_lista_inscritos_v2';

const SEED_LISTA_INSCRITOS: DocTemplate = {
  id: SEED_LISTA_INSCRITOS_ID,
  nome: 'Lista de Candidatos por Sala de Exame',
  tipo: 'lista_inscritos',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `LISTA DE CANDIDATOS POR SALA DE EXAME — Agrupada por Curso

Escola: {{NOME_ESCOLA}}
Ano: {{ANO_LECTIVO}}

Este modelo gera a lista oficial de candidatos inscritos no processo de admissão, organizada por curso/área de formação, com o formato oficial de sala de exame.

Formato do documento (idêntico ao modelo oficial):
  • Cabeçalho com insígnia da escola, nome da instituição
  • Título: EXAMES DE ADMISSÃO — [ANO]
  • Subtítulo: LISTA DE CANDIDATOS POR SALAS DE EXAME
  • Linha com disciplinas e datas dos exames
  • LOCAL · Campus / Instituto · SALA · HORA

Organização automática por curso:
  • Uma secção completa por cada curso / área de formação
  • Cada secção tem o cabeçalho completo (escola, sala, hora, disciplinas)
  • Dentro de cada curso: candidatos ordenados ALFABETICAMENTE

Dados de cada candidato:
  • Nº de Ordem (sequencial, reinicia em cada curso)
  • Nome completo (em maiúsculas)
  • NºCand — número de inscrição gerado automaticamente pelo sistema
  • Curso / Área de Formação

Configuração antes de gerar:
  • Ano do exame
  • Local, Campus/Instituto, Sala de exame, Hora
  • Disciplinas com dia da semana e data (ex: Língua Portuguesa — 3ª-Feira, 07 Mar 2026)

Ao clicar em "Emitir", será aberto o módulo de geração da lista onde poderá configurar todos os detalhes e gerar o PDF.`,
};

// ─── Seed: Lista de Resultados de Admissão (vitrine) ─────────────────────────

const SEED_LISTA_RESULTADOS_ADMISSAO_ID = 'tpl_seed_lista_resultados_admissao_v1';

const SEED_LISTA_RESULTADOS_ADMISSAO: DocTemplate = {
  id: SEED_LISTA_RESULTADOS_ADMISSAO_ID,
  nome: 'Lista de Resultados de Admissão (Vitrine)',
  tipo: 'lista_resultados_admissao',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `LISTA DE RESULTADOS DE ADMISSÃO — Para Publicação em Vitrine

Este modelo gera a lista oficial de resultados do processo de admissão, dividida em duas secções:

  ✓ ADMITIDOS — Estudantes aprovados e admitidos por classe/curso
  ✗ NÃO ADMITIDOS — Estudantes que não foram admitidos por classe/curso

Para o II Ciclo (10ª–13ª Classe) com cursos / áreas de formação definidos, cada secção é organizada automaticamente por classe e curso.

Conteúdo de cada linha:
  • Posição (1.º, 2.º, 3.º …)
  • Nome completo do estudante
  • Sexo
  • Nota do exame de admissão
  • Telefone de contacto

A lista inclui totais de masculinos/femininos por grupo e espaço para assinaturas do Secretário(a) e Director(a).

Ao clicar em "Emitir", irá para o módulo de Admissão → separador "Resultado" onde pode gerar e imprimir a lista em PDF.`,
};

// ─── Seed: Extracto de Propinas do Estudante ─────────────────────────────────

const SEED_EXTRATO_PROPINA_ID = 'tpl_seed_extrato_propina_v1';
const SEED_EXTRATO_PROPINA: DocTemplate = {
  id: SEED_EXTRATO_PROPINA_ID,
  nome: 'Extracto de Propinas do Estudante',
  tipo: 'extrato_propina',
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
  conteudo: `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff}
.page{max-width:210mm;margin:0 auto;padding:18mm 18mm 14mm;min-height:297mm;position:relative}
.print-btn{display:block;margin:10px auto 16px;padding:10px 40px;background:#1a2540;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold}
.doc-header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1a2540;padding-bottom:12px;margin-bottom:14px}
.doc-header-logo{width:56px;height:56px;object-fit:contain}
.doc-header-text{flex:1}
.rep{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#555;font-weight:600}
.escola-nome{font-size:14px;font-weight:800;color:#1a2540;text-transform:uppercase;letter-spacing:.5px}
.doc-header-title{text-align:right}
.titulo{font-size:13px;font-weight:800;color:#1a2540;text-transform:uppercase;letter-spacing:1px}
.docnum{font-size:9.5px;color:#888;margin-top:4px;font-family:monospace}
.periodo-badge{display:inline-block;margin-top:4px;background:#1a2540;color:#fff;padding:2px 8px;border-radius:10px;font-size:9px;letter-spacing:.5px}
.aluno-box{background:#f0f4ff;border:1px solid #c5d0ee;border-radius:8px;padding:10px 14px;margin-bottom:14px}
.aluno-name{font-size:15px;font-weight:800;color:#1a2540}
.aluno-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;margin-top:8px}
.field label{font-size:8.5px;text-transform:uppercase;color:#888;font-weight:600;letter-spacing:.5px;display:block}
.field span{font-size:10.5px;font-weight:600;color:#1a2540}
.resumo-row{display:grid;grid-template-columns:repeat(3,1fr) 1fr;gap:8px;margin-bottom:14px}
.resumo-card{border-radius:8px;padding:8px 10px;text-align:center}
.val{font-size:13px;font-weight:800;display:block}
.lbl{font-size:8.5px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-top:2px}
.card-pago{background:#d4edda;color:#155724}
.card-pend{background:#fff3cd;color:#856404}
.card-canc{background:#e2e3e5;color:#495057}
.card-total{background:#1a2540;color:#fff}
.section-title{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;color:#1a2540;margin-bottom:6px;padding-bottom:4px;border-bottom:1.5px solid #1a2540}
table{width:100%;border-collapse:collapse}
thead th{background:#1a2540;color:#fff;padding:7px 8px;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left}
.qr-bar-row{display:flex;gap:24px;align-items:center;margin:14px 0 10px;padding:12px;border:1px solid #dde0ef;border-radius:8px;background:#f9faff}
.qr-box{text-align:center}
.qr-box img{width:110px;height:110px;border:1px solid #dde;border-radius:4px}
.qr-lbl{font-size:8px;text-transform:uppercase;color:#888;margin-top:4px;letter-spacing:.5px}
.bar-box{flex:1;text-align:center}
.bar-box svg{max-width:100%;height:60px}
.bar-lbl{font-size:8px;text-transform:uppercase;color:#888;margin-top:2px;letter-spacing:.5px}
.doc-info{flex:1.2;font-size:9.5px;line-height:1.7;color:#555}
.doc-info strong{color:#1a2540}
.sig-section{display:flex;gap:20px;margin-top:20px;justify-content:space-between}
.sig-block{text-align:center;flex:1}
.sig-label{font-size:9px;font-weight:700;color:#333;text-transform:uppercase;margin-bottom:24px}
.sig-line{border-top:1px solid #333;margin:0 auto 4px;width:150px}
.sig-name{font-size:9px;font-weight:700;color:#1a2540}
.footer-note{margin-top:18px;border-top:1px dashed #ccc;padding-top:8px;font-size:8.5px;color:#aaa;text-align:center;line-height:1.7}
@media print{
  @page{size:A4 portrait;margin: 0}
  body{margin:0}
  .page{padding:0;max-width:100%}
  .print-btn{display:none!important}
}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar como PDF</button>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="doc-header">
    <img class="doc-header-logo" src="${window.location.origin}/angola-brasao.png" alt="Insígnia de Angola" onerror="this.style.display='none'"/>
    <div class="doc-header-text">
      <div class="rep">República de Angola</div>
      <div class="escola-nome">{{NOME_ESCOLA}}</div>
    </div>
    <div class="doc-header-title">
      <div class="titulo">Extracto de Propinas</div>
      <div class="docnum">{{DOC_REF}}</div>
      <div class="periodo-badge">Período: {{PERIODO_INICIO}} a {{PERIODO_FIM}}</div>
    </div>
  </div>

  <!-- DADOS DO ALUNO -->
  <div class="aluno-box">
    <div class="aluno-name">{{NOME_COMPLETO}}</div>
    <div class="aluno-grid">
      <div class="field"><label>Nº de Matrícula</label><span>{{NUMERO_MATRICULA}}</span></div>
      <div class="field"><label>Turma</label><span>{{TURMA}}</span></div>
      <div class="field"><label>Encarregado</label><span>{{NOME_ENCARREGADO}}</span></div>
      <div class="field"><label>Data de Emissão</label><span>{{DATA_ACTUAL}}</span></div>
    </div>
  </div>

  <!-- RESUMO FINANCEIRO -->
  <div class="resumo-row">
    <div class="resumo-card card-pago">
      <span class="val">{{TOTAL_PAGO}}</span>
      <span class="lbl">✓ Total Pago</span>
    </div>
    <div class="resumo-card card-pend">
      <span class="val">{{TOTAL_PENDENTE}}</span>
      <span class="lbl">⏳ Pendente</span>
    </div>
    <div class="resumo-card card-canc">
      <span class="val">{{TOTAL_CANCELADO}}</span>
      <span class="lbl">✗ Cancelado</span>
    </div>
    <div class="resumo-card card-total">
      <span class="val">{{TOTAL_TRANSACCOES}}</span>
      <span class="lbl">Transacções</span>
    </div>
  </div>

  <!-- TABELA DE MOVIMENTOS (gerada automaticamente ao emitir) -->
  <div class="section-title">Movimentos no Período</div>
  <table>
    <thead>
      <tr>
        <th style="width:80px;">Data</th>
        <th>Descrição</th>
        <th style="width:100px;">Método</th>
        <th style="width:110px;text-align:right;">Valor</th>
        <th style="width:70px;text-align:center;">Estado</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#fff;">
        <td style="padding:6px 8px;font-size:10px;color:#555;">01/01/2025</td>
        <td style="padding:6px 8px;font-size:10px;"><span style="font-weight:600;color:#1a2540;">Propina · Jan · 2025</span></td>
        <td style="padding:6px 8px;font-size:10px;color:#555;">Dinheiro</td>
        <td style="padding:6px 8px;text-align:right;"><strong style="color:#1a6b2a;">15.000,00 Kz</strong></td>
        <td style="padding:4px 8px;text-align:center;"><span style="font-size:9px;font-weight:bold;padding:2px 6px;border-radius:4px;color:#1a6b2a;background:#d4edda;">Pago</span></td>
      </tr>
      <tr style="background:#f9f9ff;">
        <td style="padding:6px 8px;font-size:10px;color:#555;font-style:italic;" colspan="5">[ As restantes linhas são geradas automaticamente a partir dos dados do sistema ]</td>
      </tr>
    </tbody>
  </table>

  <!-- QR CODE + CÓDIGO DE BARRAS -->
  <div class="qr-bar-row">
    <div class="qr-box">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=DOC%3A{{DOC_REF}}%0AALUNO%3A{{NOME_COMPLETO}}%0AMATRICULA%3A{{NUMERO_MATRICULA}}%0ATOTAL%3A{{TOTAL_PAGO}}&bgcolor=ffffff&color=000000&margin=6" alt="QR Code"/>
      <div class="qr-lbl">QR Verificação</div>
    </div>
    <div class="bar-box">
      <svg id="barcode-extrato"></svg>
      <div class="bar-lbl">Código de Barras — Nº Matrícula</div>
    </div>
    <div class="doc-info">
      <strong>Documento:</strong> {{DOC_REF}}<br>
      <strong>Aluno:</strong> {{NOME_COMPLETO}}<br>
      <strong>Matrícula:</strong> {{NUMERO_MATRICULA}}<br>
      <strong>Data:</strong> {{DATA_ACTUAL}}<br>
      <strong>Total Pago:</strong> {{TOTAL_PAGO}}<br>
      <strong>Transacções:</strong> {{TOTAL_TRANSACCOES}}
    </div>
  </div>

  <!-- ASSINATURAS -->
  <div class="sig-section">
    <div class="sig-block">
      <div class="sig-label">O Director Geral</div>
      <div class="sig-line"></div>
      <div class="sig-name">{{NOME_DIRECTOR}}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">O Chefe de Secretaria</div>
      <div class="sig-line"></div>
      <div class="sig-name">{{CHEFE_SECRETARIA}}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">O(A) Encarregado(a)</div>
      <div class="sig-line"></div>
      <div class="sig-name">____________________________</div>
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="footer-note">
    Documento emitido em {{DATA_ACTUAL}} por {{NOME_ESCOLA}}<br>
    Este extracto é meramente informativo e não substitui recibo oficial de pagamento.
    Os dados apresentados reflectem o estado dos registos no sistema à data de emissão.<br>
    Ref. {{DOC_REF}}
  </div>
</div>

<script>
window.addEventListener('load', function() {
  try {
    JsBarcode('#barcode-extrato', '{{NUMERO_MATRICULA}}', {
      format: 'CODE128', width: 2, height: 50, displayValue: true,
      fontSize: 11, margin: 4, background: 'transparent',
      lineColor: '#1a2540', fontOptions: 'bold',
    });
  } catch(e) {
    var el = document.getElementById('barcode-extrato');
    if (el) el.style.display = 'none';
  }
});
</script>
</body>
</html>`,
};

// ─── Vars Search Panel (standalone so its state doesn't trigger parent re-renders) ───

type SchoolValueEntry = { value: string; isEmpty: boolean; source: string };

function VarsSearchPanel({
  insertVariable,
  isWide,
  variableGroups,
  schoolValueMap,
  onOpenAdmin,
}: {
  insertVariable: (tag: string) => void;
  isWide: boolean;
  variableGroups: VariableGroup[];
  schoolValueMap: Record<string, SchoolValueEntry>;
  onOpenAdmin: () => void;
}) {
  const [varPanelSearch, setVarPanelSearch] = React.useState('');
  const [onlyMissing, setOnlyMissing] = React.useState(false);

  const allSchoolEntries = Object.entries(schoolValueMap);
  const missingCount = allSchoolEntries.filter(([, e]) => e.isEmpty).length;
  const filledCount = allSchoolEntries.length - missingCount;

  return (
    <View style={[styles.varsPanel, isWide && { width: 290 }]}>
      <View style={styles.varsPanelHeader}>
        <Ionicons name="code-slash" size={15} color={Colors.gold} />
        <Text style={styles.varsPanelTitle}>Variáveis disponíveis</Text>
      </View>

      {/* Resumo da configuração da Escola */}
      <View style={{
        marginHorizontal: 10, marginTop: 6, marginBottom: 6,
        paddingVertical: 8, paddingHorizontal: 10,
        backgroundColor: Colors.gold + '10',
        borderRadius: 8, borderWidth: 1, borderColor: Colors.gold + '40',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Ionicons name="school" size={12} color={Colors.gold} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>
            Configuração da Escola
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
            <Text style={{ fontSize: 10, color: Colors.text, fontFamily: 'Inter_500Medium' }}>{filledCount} preenchidas</Text>
          </View>
          {missingCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="alert-circle" size={11} color="#F59E0B" />
              <Text style={{ fontSize: 10, color: '#F59E0B', fontFamily: 'Inter_500Medium' }}>{missingCount} por preencher</Text>
            </View>
          )}
        </View>
        {missingCount > 0 && (
          <TouchableOpacity
            onPress={onOpenAdmin}
            style={{
              marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: '#F59E0B22', borderWidth: 1, borderColor: '#F59E0B',
              paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, alignSelf: 'flex-start',
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="settings-outline" size={11} color="#F59E0B" />
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }}>
              Abrir Admin → Escola
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.varSearchWrap}>
        <StableSearchInput
          value={varPanelSearch}
          onChangeText={setVarPanelSearch}
          inputStyle={styles.varSearchInput}
          placeholder="Pesquisar variável..."
          iconColor={Colors.textMuted}
          autoCapitalize="none"
        />
      </View>

      {/* Filtro: só por preencher */}
      {missingCount > 0 && (
        <TouchableOpacity
          onPress={() => setOnlyMissing(v => !v)}
          style={{
            marginHorizontal: 10, marginBottom: 4, marginTop: 2,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingVertical: 5, paddingHorizontal: 8,
            backgroundColor: onlyMissing ? '#F59E0B22' : Colors.surface,
            borderWidth: 1, borderColor: onlyMissing ? '#F59E0B' : Colors.border,
            borderRadius: 6,
          }}
          activeOpacity={0.75}
        >
          <Ionicons
            name={onlyMissing ? 'checkbox' : 'square-outline'}
            size={13}
            color={onlyMissing ? '#F59E0B' : Colors.textMuted}
          />
          <Text style={{
            fontSize: 11, color: onlyMissing ? '#F59E0B' : Colors.textSecondary,
            fontFamily: onlyMissing ? 'Inter_600SemiBold' : 'Inter_400Regular',
          }}>
            Mostrar só variáveis por preencher
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.varsList} showsVerticalScrollIndicator={false}>
        {(() => {
          const q = varPanelSearch.trim().toLowerCase();
          const filtered = variableGroups
            .map(g => ({
              ...g,
              vars: g.vars.filter(v => {
                const matchesSearch = !q || v.tag.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q);
                if (!matchesSearch) return false;
                if (onlyMissing) {
                  const sv = schoolValueMap[v.tag];
                  return !!sv && sv.isEmpty;
                }
                return true;
              }),
            }))
            .filter(g => g.vars.length > 0);
          if (filtered.length === 0) {
            return (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <Ionicons name={onlyMissing ? 'checkmark-circle-outline' : 'search-outline'} size={24} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 8, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 16 }}>
                  {onlyMissing
                    ? 'Todas as variáveis da escola estão preenchidas. Bom trabalho!'
                    : 'Nenhuma variável encontrada'}
                </Text>
              </View>
            );
          }
          return filtered.map((g, gi) => (
            <View key={gi}>
              <View style={[styles.varGroupHeader, { borderLeftColor: g.cor }]}>
                <Ionicons name={g.icon as any} size={13} color={g.cor} />
                <Text style={[styles.varGroupHeaderText, { color: g.cor }]}>{g.grupo}</Text>
                <View style={[styles.varGroupHeaderLine, { backgroundColor: g.cor + '33' }]} />
                <Text style={{ fontSize: 9, color: g.cor + 'cc', fontFamily: 'Inter_400Regular' }}>{g.vars.length}</Text>
              </View>
              {g.vars.map((v, vi) => {
                const schoolEntry = schoolValueMap[v.tag];
                const hasSchoolValue = !!schoolEntry;
                const isMissing = hasSchoolValue && schoolEntry.isEmpty;
                return (
                  <TouchableOpacity key={vi} style={styles.varItem} onPress={() => insertVariable(v.tag)} activeOpacity={0.75}>
                    <View style={styles.varItemInner}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <View style={[styles.varTagBadge, { backgroundColor: g.cor + '18', borderColor: g.cor + '50' }]}>
                          <Text style={[styles.varTag, { color: g.cor }]}>{v.tag}</Text>
                        </View>
                        {hasSchoolValue && (
                          <View style={{
                            backgroundColor: Colors.gold + '20', borderWidth: 1, borderColor: Colors.gold + '60',
                            paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                          }}>
                            <Text style={{ fontSize: 8, fontWeight: '700', color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>
                              ESCOLA
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.varDesc}>{v.desc}</Text>
                      {hasSchoolValue ? (
                        isMissing ? (
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
                            backgroundColor: '#F59E0B15', borderWidth: 1, borderColor: '#F59E0B40',
                            paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, alignSelf: 'flex-start',
                          }}>
                            <Ionicons name="alert-circle" size={10} color="#F59E0B" />
                            <Text style={{ fontSize: 9, color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }}>
                              Por preencher em {schoolEntry.source}
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.varExemplo, { color: Colors.success, fontFamily: 'Inter_500Medium' }]}>
                            Actual: {schoolEntry.value}
                          </Text>
                        )
                      ) : (
                        <Text style={styles.varExemplo}>Ex: {v.exemplo}</Text>
                      )}
                    </View>
                    <View style={[styles.varInsertBtn, { backgroundColor: g.cor + '22' }]}>
                      <Ionicons name="add" size={14} color={g.cor} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ));
        })()}
        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

// ─── Emit Search Panels (standalone so typing doesn't trigger parent re-renders) ───

function AlunoSearchPanel({
  alunos, turmas, selectedAlunoId, onSelect, selectedAluno, selectedTurmaForAluno, emitAlunoHistorico, showAll,
}: {
  alunos: any[]; turmas: any[]; selectedAlunoId: string;
  onSelect: (id: string) => void; selectedAluno: any | null;
  selectedTurmaForAluno: any | null; emitAlunoHistorico: any[]; showAll?: boolean;
}) {
  const [alunoSearch, setAlunoSearch] = React.useState('');
  const alunosAtivos = showAll ? alunos : alunos.filter((a: any) => a.ativo);
  const filtered = alunoSearch.trim()
    ? alunosAtivos.filter((a: any) =>
        `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(alunoSearch.toLowerCase()))
    : alunosAtivos;
  return (
    <>
      <Text style={styles.emitSectionTitle}>1. Seleccionar Aluno</Text>
      <View style={styles.searchBox}>
        <StableSearchInput
          value={alunoSearch}
          onChangeText={setAlunoSearch}
          inputStyle={styles.searchInput}
          placeholder="Pesquisar aluno..."
          iconColor={Colors.textMuted}
        />
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {filtered.slice(0, 50).map((aluno: any) => {
          const t = turmas.find((tr: any) => tr.id === aluno.turmaId);
          const sel = selectedAlunoId === aluno.id;
          return (
            <TouchableOpacity
              key={aluno.id}
              style={[styles.alunoItem, sel && styles.alunoItemSel]}
              onPress={() => { onSelect(aluno.id); setAlunoSearch(''); }}
              activeOpacity={0.75}
            >
              <View style={[styles.alunoAvatar, sel && { backgroundColor: Colors.info }]}>
                <Text style={styles.alunoAvatarText}>{aluno.nome.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alunoNome, sel && { color: Colors.info }]}>{aluno.nome} {aluno.apelido}</Text>
                <Text style={styles.alunoMeta}>{t ? `${t.classe} · ${t.nome}` : 'Sem turma'} · Nº {aluno.numeroMatricula}</Text>
              </View>
              {sel && <Ionicons name="checkmark-circle" size={18} color={Colors.info} />}
            </TouchableOpacity>
          );
        })}
        {filtered.length === 0 && <Text style={styles.noAlunos}>Nenhum aluno encontrado</Text>}
      </ScrollView>
      {selectedAluno && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedInfoTitle}>Aluno seleccionado:</Text>
          <Text style={styles.selectedInfoName}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
          <Text style={styles.selectedInfoMeta}>{selectedTurmaForAluno?.classe} · {selectedTurmaForAluno?.nome} · {selectedAluno.provincia}</Text>
        </View>
      )}
      {emitAlunoHistorico.length > 0 && (
        <View style={{ marginTop: 10, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="time" size={13} color={Colors.gold} />
            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Histórico de documentos ({emitAlunoHistorico.length})
            </Text>
          </View>
          {emitAlunoHistorico.slice(0, 5).map((doc: any) => (
            <View key={doc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Ionicons name="document-text-outline" size={14} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }} numberOfLines={1}>{doc.tipo}</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                  {new Date(doc.emitidoEm).toLocaleDateString('pt-PT')}
                </Text>
              </View>
              <View style={{ backgroundColor: Colors.success + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>EMITIDO</Text>
              </View>
            </View>
          ))}
          {emitAlunoHistorico.length > 5 && (
            <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 6 }}>
              +{emitAlunoHistorico.length - 5} documentos anteriores
            </Text>
          )}
        </View>
      )}
    </>
  );
}

function TurmaSearchPanel({
  turmas, alunos, selectedTurmaId, onSelect, selectedTurmaObj, isListaTurma, isLoading, showAll,
}: {
  turmas: any[]; alunos: any[]; selectedTurmaId: string;
  onSelect: (id: string) => void; selectedTurmaObj: any | null; isListaTurma: boolean;
  isLoading?: boolean; showAll?: boolean;
}) {
  const [turmaSearch, setTurmaSearch] = React.useState('');
  const turmasAtivas = showAll ? turmas : turmas.filter((t: any) => t.ativo);
  const filtered = turmaSearch.trim()
    ? turmasAtivas.filter((t: any) =>
        `${t.classe} ${t.nome} ${t.anoLetivo}`.toLowerCase().includes(turmaSearch.toLowerCase()))
    : turmasAtivas;
  const accentColor = isListaTurma ? '#0369a1' : '#dc2626';
  return (
    <>
      <Text style={styles.emitSectionTitle}>1. Seleccionar Turma</Text>
      <View style={styles.searchBox}>
        <StableSearchInput
          value={turmaSearch}
          onChangeText={setTurmaSearch}
          inputStyle={styles.searchInput}
          placeholder="Pesquisar turma..."
          iconColor={Colors.textMuted}
        />
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {isLoading && turmasAtivas.length === 0 ? (
          <View style={{ padding: 16, alignItems: 'center', gap: 8 }}>
            <AppLoader size="small" color={Colors.gold} />
            <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>A carregar turmas…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Text style={styles.noAlunos}>
            {turmaSearch.trim() ? 'Nenhuma turma corresponde à pesquisa' : 'Nenhuma turma activa encontrada'}
          </Text>
        ) : filtered.map((turma: any) => {
          const sel = selectedTurmaId === turma.id;
          const count = alunos.filter((a: any) => (showAll ? true : a.ativo) && a.turmaId === turma.id).length;
          return (
            <TouchableOpacity
              key={turma.id}
              style={[styles.alunoItem, sel && { borderColor: accentColor, borderWidth: 1.5, backgroundColor: accentColor + '15' }]}
              onPress={() => { onSelect(turma.id); setTurmaSearch(''); }}
              activeOpacity={0.75}
            >
              <View style={[styles.alunoAvatar, sel && { backgroundColor: accentColor }]}>
                <Text style={styles.alunoAvatarText}>{turma.classe.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alunoNome, sel && { color: accentColor }]}>{turma.classe} — {turma.nome}</Text>
                <Text style={styles.alunoMeta}>{turma.anoLetivo} · {turma.turno} · {count} alunos</Text>
              </View>
              {sel && <Ionicons name="checkmark-circle" size={18} color={accentColor} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {selectedTurmaObj && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedInfoTitle}>Turma seleccionada:</Text>
          <Text style={styles.selectedInfoName}>{selectedTurmaObj.classe} — {selectedTurmaObj.nome}</Text>
          <Text style={styles.selectedInfoMeta}>{selectedTurmaObj.nivel} · {selectedTurmaObj.anoLetivo} · {selectedTurmaObj.turno}</Text>
          {isListaTurma && (
            <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 6 }}>
              {alunos.filter((a: any) => (showAll ? true : a.ativo) && a.turmaId === selectedTurmaObj.id).length} alunos · Lista com Mapa Estatístico
            </Text>
          )}
        </View>
      )}
    </>
  );
}

// ─── TemplateCard (module-level para referência estável — evita desmontagem) ─

interface MiniPautaAtribuicao {
  id: string;
  templateId: string;
  professorId: string;
  professorNome: string;
  professorApelido: string;
  disciplinaId: string;
  disciplinaNome: string;
  status: string;
  atribuidoEm?: string;
}

interface TemplateCardProps {
  template: DocTemplate;
  canManageLocks: boolean;
  canDelete: boolean;
  onToggleBloqueio: (id: string) => void;
  onToggleDisponivelAluno: (id: string) => void;
  onPreview: (t: DocTemplate) => void;
  onEmitir: (t: DocTemplate) => void;
  onEdit: (t: DocTemplate) => void;
  onDelete: (id: string) => void;
  atribuicoesDeste?: MiniPautaAtribuicao[];
  onAtribuir?: (t: DocTemplate) => void;
  onDesatribuir?: (atribuicaoId: string) => void;
}

function TemplateCard({
  template,
  canManageLocks,
  canDelete,
  onToggleBloqueio,
  onToggleDisponivelAluno,
  onPreview,
  onEmitir,
  onEdit,
  onDelete,
  atribuicoesDeste = [],
  onAtribuir,
  onDesatribuir,
}: TemplateCardProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const REVEAL_WIDTH = canManageLocks ? 136 : 72;
  const slideX = useRef(new Animated.Value(0)).current;
  const swipeOpenRef = useRef(false);
  const isWeb = Platform.OS === 'web';

  function closeSwipe() {
    Animated.spring(slideX, { toValue: 0, useNativeDriver: false, tension: 60, friction: 8 }).start();
    swipeOpenRef.current = false;
  }

  const panResponder = useRef(isWeb ? { panHandlers: {} } : PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 6 && Math.abs(gs.dy) < Math.abs(gs.dx),
    onPanResponderMove: (_, gs) => {
      const base = swipeOpenRef.current ? -REVEAL_WIDTH : 0;
      slideX.setValue(Math.max(-REVEAL_WIDTH, Math.min(0, base + gs.dx)));
    },
    onPanResponderRelease: (_, gs) => {
      const shouldOpen = swipeOpenRef.current ? gs.dx < 20 : gs.dx < -40;
      Animated.spring(slideX, { toValue: shouldOpen ? -REVEAL_WIDTH : 0, useNativeDriver: false, tension: 60, friction: 8 }).start();
      swipeOpenRef.current = shouldOpen;
    },
  })).current;

  const tipoColor = TIPO_COLORS[template.tipo];
  const preview = stripHtmlTags(template.conteudo).slice(0, 120).replace(/\n/g, ' ');
  const bloqueado = !!template.bloqueado;
  const disponivelAluno = !!template.disponivelAluno;
  const isBoletimInscricao = template.id === SEED_BOLETIM_INSCRICAO_ID;
  const isBoletimMatricula = template.tipo === 'boletim_matricula';
  const isFichaIndividual = template.tipo === 'ficha_individual';
  const isListaAdmitidos = template.tipo === 'lista_admitidos';
  const isListaInscritos = template.tipo === 'lista_inscritos';
  const isListaResultadosAdmissao = template.tipo === 'lista_resultados_admissao';
  const isExtratoPropina = template.tipo === 'extrato_propina';
  const isMiniPautaProf = template.tipo === 'mini_pauta';

  function handleEmitir() {
    if (bloqueado) return;
    if (isBoletimInscricao) {
      router.push('/boletim-inscricao' as any);
    } else if (isBoletimMatricula) {
      router.push('/boletim-matricula' as any);
    } else if (isListaAdmitidos) {
      router.push('/lista-admitidos' as any);
    } else if (isListaInscritos) {
      router.push('/lista-inscritos' as any);
    } else if (isListaResultadosAdmissao) {
      router.push('/(main)/admissao' as any);
    } else if (isFichaIndividual) {
      router.push('/(main)/alunos' as any);
    } else {
      onEmitir(template);
    }
  }

  return (
    <View style={[styles.cardWrapper, bloqueado && { borderColor: Colors.danger + '60' }]}>
      {!isWeb && (
        <View style={styles.swipeReveal}>
          {canManageLocks && (
            <TouchableOpacity
              style={[styles.swipeBtn, { backgroundColor: bloqueado ? Colors.success : Colors.danger }]}
              onPress={() => { onToggleBloqueio(template.id); closeSwipe(); }}
            >
              <Ionicons name={bloqueado ? 'lock-open' : 'lock-closed'} size={20} color="#fff" />
              <Text style={styles.swipeBtnText}>{bloqueado ? 'Activar' : 'Bloquear'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.swipeBtn, { backgroundColor: Colors.success, opacity: bloqueado ? 0.35 : 1 }]}
            disabled={bloqueado}
            onPress={() => { handleEmitir(); closeSwipe(); }}
          >
            <Ionicons name="document-text" size={20} color="#fff" />
            <Text style={styles.swipeBtnText}>Emitir</Text>
          </TouchableOpacity>
        </View>
      )}
      <Animated.View
        style={[styles.card, bloqueado && { backgroundColor: Colors.danger + '08' }, isWeb ? {} : { transform: [{ translateX: slideX }], borderWidth: 0, borderRadius: 0 }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <View style={[styles.tipoBadge, { backgroundColor: tipoColor + '22' }]}>
              <Text style={[styles.tipoText, { color: tipoColor }]}>{TIPO_LABELS[template.tipo]}</Text>
            </View>
            {bloqueado ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.danger + '25', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.danger + '50' }}>
                <Ionicons name="lock-closed" size={11} color={Colors.danger} />
                <Text style={{ fontSize: 10, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>BLOQUEADO</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '40' }}>
                <Ionicons name="lock-open" size={11} color={Colors.success} />
                <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Inter_700Bold' }}>ACTIVO</Text>
              </View>
            )}
            {disponivelAluno && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.info + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.info + '50' }}>
                <Ionicons name="person-outline" size={11} color={Colors.info} />
                <Text style={{ fontSize: 10, color: Colors.info, fontFamily: 'Inter_700Bold' }}>ALUNO</Text>
              </View>
            )}
            {isMiniPautaProf && atribuicoesDeste.map(a => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: a.status === 'atribuido' ? '#1a6b3c20' : Colors.warning + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: a.status === 'atribuido' ? '#1a6b3c60' : Colors.warning + '50' }}>
                <Ionicons name={a.status === 'atribuido' ? 'checkmark-circle-outline' : 'time-outline'} size={11} color={a.status === 'atribuido' ? '#1a6b3c' : Colors.warning} />
                <Text style={{ fontSize: 10, color: a.status === 'atribuido' ? '#1a6b3c' : Colors.warning, fontFamily: 'Inter_700Bold' }}>
                  {a.status === 'atribuido' ? 'ATRIBUÍDO' : 'PENDENTE'} · {a.professorNome}{a.disciplinaNome ? ` · ${a.disciplinaNome}` : ''}
                </Text>
                {canManageLocks && onDesatribuir && (
                  <TouchableOpacity onPress={() => onDesatribuir(a.id)} style={{ marginLeft: 2 }}>
                    <Ionicons name="close-circle" size={12} color={a.status === 'atribuido' ? '#1a6b3c' : Colors.warning} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setShowMenu(v => !v)}>
            <Ionicons name="ellipsis-vertical" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.cardNome, bloqueado && { color: Colors.textMuted }]}>{template.nome}</Text>
        <Text style={styles.cardPreview} numberOfLines={2}>{preview || 'Sem conteúdo'}</Text>

        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>Actualizado: {fmtDate(template.atualizadoEm)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardActionsScroll} contentContainerStyle={styles.cardActions}>
            {canManageLocks && (
              <TouchableOpacity
                style={[styles.cardActionBtn, { backgroundColor: bloqueado ? Colors.success + '18' : Colors.danger + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }]}
                onPress={() => onToggleBloqueio(template.id)}
              >
                <Ionicons name={bloqueado ? 'lock-open-outline' : 'lock-closed-outline'} size={14} color={bloqueado ? Colors.success : Colors.danger} />
                <Text style={[styles.cardActionText, { color: bloqueado ? Colors.success : Colors.danger }]}>
                  {bloqueado ? 'Desbloquear' : 'Bloquear'}
                </Text>
              </TouchableOpacity>
            )}
            {canManageLocks && (
              <TouchableOpacity
                style={[styles.cardActionBtn, { backgroundColor: disponivelAluno ? Colors.info + '20' : Colors.textMuted + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }]}
                onPress={() => onToggleDisponivelAluno(template.id)}
              >
                <Ionicons name={disponivelAluno ? 'person' : 'person-outline'} size={14} color={disponivelAluno ? Colors.info : Colors.textMuted} />
                <Text style={[styles.cardActionText, { color: disponivelAluno ? Colors.info : Colors.textMuted }]}>
                  {disponivelAluno ? 'Disponível ao aluno' : 'Permitir aos alunos'}
                </Text>
              </TouchableOpacity>
            )}
            {canManageLocks && isMiniPautaProf && onAtribuir && (
              <TouchableOpacity
                style={[styles.cardActionBtn, { backgroundColor: '#1a6b3c18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }]}
                onPress={() => onAtribuir(template)}
              >
                <Ionicons name="person-add-outline" size={14} color="#1a6b3c" />
                <Text style={[styles.cardActionText, { color: '#1a6b3c' }]}>Atribuir ao Professor</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cardActionBtn} onPress={() => onPreview(template)}>
              <Ionicons name="eye-outline" size={14} color={'#8b5cf6'} />
              <Text style={[styles.cardActionText, { color: '#8b5cf6' }]}>Visualizar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardActionBtn, bloqueado && { opacity: 0.35 }]}
              onPress={handleEmitir}
              disabled={bloqueado}
            >
              <Ionicons name="document-text" size={14} color={bloqueado ? Colors.textMuted : Colors.success} />
              <Text style={[styles.cardActionText, { color: bloqueado ? Colors.textMuted : Colors.success }]}>Emitir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardActionBtn} onPress={() => onEdit(template)}>
              <Ionicons name="pencil" size={14} color={Colors.info} />
              <Text style={[styles.cardActionText, { color: Colors.info }]}>Editar</Text>
            </TouchableOpacity>
            {canDelete && (
              <TouchableOpacity
                style={[styles.cardActionBtn, { backgroundColor: Colors.danger + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }]}
                onPress={() => onDelete(template.id)}
              >
                <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                <Text style={[styles.cardActionText, { color: Colors.danger }]}>Eliminar</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {showMenu && (
          <View style={styles.dropMenu}>
            <TouchableOpacity style={styles.dropItem} onPress={() => { setShowMenu(false); onPreview(template); }}>
              <Ionicons name="eye-outline" size={16} color={'#8b5cf6'} />
              <Text style={[styles.dropItemText, { color: '#8b5cf6' }]}>Pré-visualizar PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dropItem} onPress={() => { setShowMenu(false); onEdit(template); }}>
              <Ionicons name="pencil-outline" size={16} color={Colors.text} />
              <Text style={styles.dropItemText}>Editar</Text>
            </TouchableOpacity>
            {!bloqueado && (
              <TouchableOpacity style={styles.dropItem} onPress={() => { setShowMenu(false); handleEmitir(); }}>
                <Ionicons name="document-text-outline" size={16} color={Colors.success} />
                <Text style={[styles.dropItemText, { color: Colors.success }]}>Emitir documento</Text>
              </TouchableOpacity>
            )}
            {canManageLocks && (
              <>
                <View style={styles.dropDivider} />
                <TouchableOpacity
                  style={styles.dropItem}
                  onPress={() => { setShowMenu(false); onToggleBloqueio(template.id); }}
                >
                  <Ionicons
                    name={bloqueado ? 'lock-open-outline' : 'lock-closed-outline'}
                    size={16}
                    color={bloqueado ? Colors.success : Colors.danger}
                  />
                  <Text style={[styles.dropItemText, { color: bloqueado ? Colors.success : Colors.danger }]}>
                    {bloqueado ? 'Desbloquear modelo' : 'Bloquear modelo'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dropItem}
                  onPress={() => { setShowMenu(false); onToggleDisponivelAluno(template.id); }}
                >
                  <Ionicons
                    name={disponivelAluno ? 'person-remove-outline' : 'person-add-outline'}
                    size={16}
                    color={Colors.info}
                  />
                  <Text style={[styles.dropItemText, { color: Colors.info }]}>
                    {disponivelAluno ? 'Retirar do perfil do aluno' : 'Disponibilizar ao aluno'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {canDelete && (
              <>
                <View style={styles.dropDivider} />
                <TouchableOpacity style={styles.dropItem} onPress={() => { setShowMenu(false); onDelete(template.id); }}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={[styles.dropItemText, { color: Colors.danger }]}>Eliminar modelo</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function EditorDocumentos() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { alunos, turmas, notas, professores, isLoading: dataLoading } = useData();
  const { config } = useConfig();
  const { anoSelecionado, anoAtivo } = useAnoAcademico();

  // Quando o utilizador navega para um ano histórico, filtra turmas/alunos/notas desse ano
  const isAnoHistorico = !!(anoSelecionado && anoAtivo && anoSelecionado.id !== anoAtivo.id);
  const anoContexto = anoSelecionado?.ano || '';
  // Normaliza formato do ano letivo: aceita "2025-2026" e "2025/2026" como iguais
  const normAno = (a: string) => a.replace(/-/g, '/');
  const turmasDoAnoSel = useMemo(() => {
    if (!anoContexto) return turmas.filter(t => t.ativo);
    const normCtx = normAno(anoContexto);
    return turmas.filter(t => normAno(t.anoLetivo || '') === normCtx);
  }, [turmas, anoContexto]);
  const idsturmasDoAnoSel = useMemo(() => new Set(turmasDoAnoSel.map(t => t.id)), [turmasDoAnoSel]);
  const alunosDoAnoSel = useMemo(() => {
    if (!anoContexto) return alunos.filter(a => a.ativo);
    return alunos.filter(a => idsturmasDoAnoSel.has(a.turmaId));
  }, [alunos, anoContexto, idsturmasDoAnoSel]);

  // Apenas CEO pode bloquear/desbloquear e eliminar modelos
  const canManageLocks = user?.role === 'ceo';
  const canDelete = user?.role === 'ceo';

  // Disciplinary occurrences — used to derive comportamento per student
  const [ocorrencias, setOcorrencias] = useState<{ alunoId: string; gravidade: string }[]>([]);
  useEffect(() => {
    api.get<{ alunoId: string; gravidade: string }[]>('/api/ocorrencias')
      .then(d => setOcorrencias(Array.isArray(d) ? d : []))
      .catch(() => setOcorrencias([]));
  }, []);

  // Cursos — usados para mostrar o nome do curso na Pauta Final do II Ciclo
  const [cursos, setCursos] = useState<{ id: string; nome: string; codigo?: string }[]>([]);
  useEffect(() => {
    api.get<{ id: string; nome: string; codigo?: string }[]>('/api/cursos')
      .then(d => setCursos(Array.isArray(d) ? d : []))
      .catch(() => setCursos([]));
  }, []);

  // Pautas — usadas para obter o número sequencial de pauta nos documentos
  const [pautas, setPautas] = useState<any[]>([]);
  useEffect(() => {
    api.get<any[]>('/api/pautas')
      .then(d => setPautas(Array.isArray(d) ? d : []))
      .catch(() => setPautas([]));
  }, []);

  // Mini-Pauta atribuições ────────────────────────────────────────────────────
  const [atribuicoesMiniPauta, setAtribuicoesMiniPauta] = useState<MiniPautaAtribuicao[]>([]);
  const [showAtribuirModal, setShowAtribuirModal] = useState(false);
  const [atribuirTemplateAlvo, setAtribuirTemplateAlvo] = useState<DocTemplate | null>(null);
  const [atribuirPesquisa, setAtribuirPesquisa] = useState('');

  useEffect(() => {
    if (!canManageLocks) return;
    api.get<MiniPautaAtribuicao[]>('/api/mini-pauta-atribuicoes')
      .then(d => setAtribuicoesMiniPauta(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [canManageLocks]);

  async function handleAtribuirTemplate(templateId: string, professorId: string, disciplinaId: string, disciplinaNome: string) {
    try {
      await api.post('/api/mini-pauta-atribuicoes', { templateId, professorId, disciplinaId, disciplinaNome });
      const d = await api.get<MiniPautaAtribuicao[]>('/api/mini-pauta-atribuicoes');
      setAtribuicoesMiniPauta(Array.isArray(d) ? d : []);
      showToast(`Modelo atribuído — ${disciplinaNome || 'Professor'}`, 'success');
    } catch {
      showToast('Erro ao atribuir o modelo ao professor.', 'error');
    }
  }

  async function handleDesatribuirTemplate(atribuicaoId: string) {
    try {
      await api.delete(`/api/mini-pauta-atribuicoes/by-id/${atribuicaoId}`);
      setAtribuicoesMiniPauta(prev => prev.filter(a => a.id !== atribuicaoId));
      showToast('Atribuição removida.', 'info');
    } catch {
      showToast('Erro ao remover a atribuição.', 'error');
    }
  }

  // Sem fallback de "____________" — se o nome não estiver configurado em
  // Admin → Escola → Direcção, a variável fica vazia. A linha de assinatura
  // é da responsabilidade do utilizador (adiciona-a manualmente no editor
  // se quiser).
  const directorGeral = config.directorGeral || user?.nome || '';
  const directorPedagogico = config.directorPedagogico || '';
  const directorProvincialEducacao = config.directorProvincialEducacao || '';

  function generateCode39Svg(text: string, width = 100, height = 22): string {
    const C39: Record<string, string> = {
      '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn',
      '4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw',
      '8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw',
      'C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn',
      'G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
      'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww',
      'O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn',
      'S':'nnwnnnwwn','T':'nnnnwnwwn','U':'wwnnnnnnw','V':'nwwnnnnnw',
      'W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn',
      '-':'nwnnnnwnw','.':'wwnnnnwnn','*':'nwnnwnwnn',
    };
    const N = 1, W = 3, GAP = 1;
    const raw = text.toUpperCase().replace(/[^0-9A-Z\-\.]/g, '').slice(0, 20);
    const chars = ('*' + raw + '*').split('');
    const totalUnits = chars.reduce((sum, c, ci) => {
      const p = C39[c]; if (!p) return sum;
      const charUnits = p.split('').reduce((s, ch) => s + (ch === 'n' ? N : W), 0);
      return sum + charUnits + (ci < chars.length - 1 ? GAP : 0);
    }, 0);
    if (totalUnits === 0) return '';
    const scale = width / totalUnits;
    let x = 0; let rects = '';
    chars.forEach((c, ci) => {
      const p = C39[c]; if (!p) return;
      p.split('').forEach((ch, pi) => {
        const w = (ch === 'n' ? N : W) * scale;
        if (pi % 2 === 0) rects += `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(w, 0.5).toFixed(1)}" height="${height}" fill="#000"/>`;
        x += w;
      });
      if (ci < chars.length - 1) x += GAP * scale;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
  }

  function buildSigRow(dirG: string, dirP: string, dirProv: string): string {
    const block = (label: string, name: string) =>
      `<div style="text-align:center;min-width:140px;flex:1;">` +
        `<div style="font-size:11px;font-weight:bold;margin-bottom:28px;">${label}</div>` +
        `<div class="sig-line" style="width:170px;border-top:1px solid #000;margin:0 auto 5px;"></div>` +
        `<div style="font-size:11px;font-weight:bold;">${name}</div>` +
      `</div>`;
    return (
      `<div style="display:flex;justify-content:space-around;margin-top:40px;flex-wrap:wrap;gap:16px;">` +
        block('O Director Geral', dirG) +
        block('O Director Pedagógico', dirP) +
        (dirProv ? block('Director Provincial da Educação', dirProv) : '') +
      `</div>`
    );
  }
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [mode, setMode] = useState<Mode>('list');
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disciplinasCatalogo, setDisciplinasCatalogo] = useState<any[]>([]);
  const variableGroups = useMemo(() => buildVariableGroups(disciplinasCatalogo), [disciplinasCatalogo]);
  const variableExampleMap = useMemo(() => buildVariableExampleMap(variableGroups), [variableGroups]);

  // Mapa de variáveis cujo valor vem da configuração da Escola (Admin → Escola)
  // Mostrado no painel de variáveis para que o utilizador veja exactamente o que vai sair impresso.
  const schoolValueMap = useMemo<Record<string, SchoolValueEntry>>(() => {
    const cfg: any = config || {};
    const make = (raw: any, source: string): SchoolValueEntry => {
      const v = (raw === null || raw === undefined) ? '' : String(raw).trim();
      return { value: v, isEmpty: !v, source };
    };
    return {
      '{{NOME_ESCOLA}}': make(cfg.nomeEscola, 'Admin → Escola'),
      '{{NOME_DIRECTOR}}': make(cfg.directorGeral, 'Admin → Escola → Direcção'),
      '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': make(cfg.directorPedagogico, 'Admin → Escola → Direcção'),
      '{{NOME_DIRECTOR_PEDAGOGICO}}': make(cfg.directorPedagogico, 'Admin → Escola → Direcção'),
      '{{NOME_DIRECTOR_PROVINCIAL}}': make(cfg.directorProvincialEducacao, 'Admin → Escola → Direcção'),
      '{{CHEFE_SECRETARIA}}': make(cfg.chefeSecretaria, 'Admin → Escola'),
      '{{TELEFONE_ESCOLA}}': make(cfg.telefoneEscola, 'Admin → Escola → Contactos'),
      '{{EMAIL_ESCOLA}}': make(cfg.emailEscola, 'Admin → Escola → Contactos'),
      '{{MORADA_ESCOLA}}': make(cfg.morada, 'Admin → Escola'),
      '{{MUNICIPIO_ESCOLA}}': make(cfg.municipioEscola, 'Admin → Escola'),
      '{{PROVINCIA_ESCOLA}}': make(cfg.provinciaEscola, 'Admin → Escola'),
      '{{LOGO_URL}}': make(cfg.logoUrl || '/angola-brasao.png', 'Admin → Escola → Identidade Visual'),
      '{{CABECALHO_LINHA_1}}': make(cfg.cabecalhoLinha1 || 'REPÚBLICA DE ANGOLA', 'Admin → Escola → Cabeçalho Oficial'),
      '{{CABECALHO_LINHA_2}}': make(cfg.cabecalhoLinha2 || 'MINISTÉRIO DA EDUCAÇÃO', 'Admin → Escola → Cabeçalho Oficial'),
    };
  }, [config]);

  // ─── Planos de Aula state ────────────────────────────────────────────────
  const [planosAulaDoc, setPlanosAulaDoc] = useState<any[]>([]);
  const [planosAulaLoading, setPlanosAulaLoading] = useState(false);
  const [previewPlanoDoc, setPreviewPlanoDoc] = useState<any | null>(null);

  // ─── Lista de Aprovados state ─────────────────────────────────────────────
  const [listaAprovadosLoading, setListaAprovadosLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setPlanosAulaLoading(true);
      try {
        const r = await fetch('/api/planos-aula', { credentials: 'include' });
        if (r.ok) { const d = await r.json(); setPlanosAulaDoc(Array.isArray(d) ? d : []); }
      } catch { setPlanosAulaDoc([]); }
      finally { setPlanosAulaLoading(false); }
    })();
  }, []);

  useEffect(() => {
    fetch('/api/disciplinas', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setDisciplinasCatalogo(Array.isArray(data) ? data : []))
      .catch(() => setDisciplinasCatalogo([]));
  }, []);

  function buildPlanoHTMLDoc(plano: any): string {
    const rows = (plano.fases || []).map((f: any) => `
      <tr>
        <td style="font-size:10pt;text-align:center;font-weight:bold;">${f.tempo||''}</td>
        <td style="font-size:10pt;font-weight:bold;">${f.fase||''}</td>
        <td style="font-size:9pt;">${(f.conteudo||'').replace(/\n/g,'<br>')}</td>
        <td style="font-size:9pt;">${(f.metodos||'').replace(/\n/g,'<br>')}</td>
        <td style="font-size:9pt;">${(f.actividades||'').replace(/\n/g,'<br>')}</td>
        <td style="font-size:9pt;">${(f.estrategiaEnsino||'').replace(/\n/g,'<br>')}</td>
        <td style="font-size:9pt;">${(f.meiosEnsino||'').replace(/\n/g,'<br>')}</td>
        <td style="font-size:9pt;text-align:center;">${f.avaliacao||''}</td>
        <td style="font-size:9pt;">${f.obs||''}</td>
      </tr>`).join('');
    return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',serif;font-size:11pt;color:#111;background:#fff}
    .page{width:297mm;min-height:210mm;margin:0 auto;padding:15mm 18mm}
    h1{text-align:center;font-size:14pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;text-decoration:underline}
    .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #111;border-collapse:collapse;margin-bottom:10px}
    .info-cell{padding:4px 7px;border:1px solid #111;font-size:10pt;line-height:1.5}
    .info-cell .lbl{font-weight:bold}
    .obj-box{border:1px solid #111;padding:5px 8px;margin-bottom:10px;font-size:10pt;line-height:1.7}
    .obj-box .lbl{font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{background:#ddd;font-size:10pt;padding:5px 4px;border:1px solid #111;text-align:center;font-weight:bold}
    td{border:1px solid #111;padding:4px;vertical-align:top}
    .print-btn{display:block;margin:16px auto;padding:10px 32px;background:#1a2540;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold}
    @media print{.print-btn{display:none}}</style></head>
    <body>
    <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
    <div class="page"><h1>Plano de Aula</h1>
    <div class="info-grid">
      <div class="info-cell"><span class="lbl">Nome:</span> ${plano.professorNome||''}</div>
      <div class="info-cell" style="grid-row:span 2;"><span class="lbl">Geral:</span> ${plano.objectivoGeral||''}</div>
      <div class="info-cell" style="grid-row:span 6;"><span class="lbl">Objectivos:</span><br><br><span class="lbl">Específicos:</span><br>${(plano.objectivosEspecificos||'').replace(/\n/g,'<br>')}</div>
      <div class="info-cell"><span class="lbl">Escola:</span> ${plano.escola||''}</div>
      <div class="info-cell"><span class="lbl">Data:</span> ${plano.data||''}</div>
      <div class="info-cell"></div>
      <div class="info-cell"><span class="lbl">Classe:</span> ${plano.classe||''} &nbsp;&nbsp; <span class="lbl">Turma:</span> ${plano.turmaNome||''}</div>
      <div class="info-cell"><span class="lbl">Período:</span> ${plano.periodo||''}</div>
      <div class="info-cell"><span class="lbl">Disciplina:</span> ${plano.disciplina||''}</div>
      <div class="info-cell"><span class="lbl">Tempo:</span> ${plano.tempo||''}</div>
      <div class="info-cell"><span class="lbl">Unidade:</span> ${plano.unidade||''}</div>
      <div class="info-cell"><span class="lbl">Duração:</span> ${plano.duracao||''}</div>
      <div class="info-cell"><span class="lbl">Sumário:</span> ${plano.sumario||''}</div>
      <div class="info-cell"><span class="lbl">Ano lectivo:</span> ${plano.anoLetivo||''}</div>
    </div>
    <div class="obj-box"><span class="lbl">Perfil de entrada:</span> ${plano.perfilEntrada||''}</div>
    <div class="obj-box"><span class="lbl">Perfil de saída:</span> ${plano.perfilSaida||''}</div>
    <table><thead><tr>
      <th style="width:55px">Tempo</th><th style="width:80px">Fases<br>didácticas</th>
      <th>Conteúdo</th><th style="width:80px">Métodos</th><th>Actividades</th>
      <th style="width:90px">Estratégia de<br>Ensino</th><th style="width:90px">Meios de<br>Ensino</th>
      <th style="width:70px">Avaliação</th><th style="width:50px">Obs</th>
    </tr></thead><tbody>${rows}</tbody></table></div></body></html>`;
  }

  // Editor state
  const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null>(null);
  const [editorNome, setEditorNome] = useState('');
  const [editorTipo, setEditorTipo] = useState<DocTipo>('declaracao');
  const [editorContent, setEditorContent] = useState('');
  const [editorInsignia, setEditorInsignia] = useState<string | undefined>(undefined);
  const [editorMarcaAgua, setEditorMarcaAgua] = useState<string | undefined>(undefined);
  const [editorCabecalhoNome, setEditorCabecalhoNome] = useState<string>('');
  const [editorCabecalhoExtra, setEditorCabecalhoExtra] = useState<string>('');
  const [editorCabecalhoAlign, setEditorCabecalhoAlign] = useState<'left' | 'center' | 'right'>('center');
  const [showVarsPanel, setShowVarsPanel] = useState(true);
  const [showAppearPanel, setShowAppearPanel] = useState(false);
  const [activeVarGroup, setActiveVarGroup] = useState(0);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const previewDebounceRef = useRef<any>(null);

  // Variáveis referenciadas no template em edição que estão por preencher em
  // Admin → Escola. Usado pelo aviso amarelo no topo do editor.
  const referencedMissingVars = useMemo<Array<{ tag: string; source: string }>>(() => {
    const html = previewHtml || editorContent || '';
    if (!html) return [];
    const found = new Set<string>();
    const re = /\{\{[A-Z0-9_]+\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) found.add(m[0]);
    const out: Array<{ tag: string; source: string }> = [];
    found.forEach(tag => {
      const sv = schoolValueMap[tag];
      if (sv && sv.isEmpty) out.push({ tag, source: sv.source });
    });
    return out.sort((a, b) => a.tag.localeCompare(b.tag));
  }, [previewHtml, editorContent, schoolValueMap]);

  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [tipoSelectOpen, setTipoSelectOpen] = useState(false);
  const [tipoSearch, setTipoSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [listFiltro, setListFiltro] = useState<'todos' | 'ativos' | 'bloqueados' | 'eliminados'>('todos');
  const [listPesquisa, setListPesquisa] = useState('');
  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [listFiltro, listPesquisa]);
  const LIST_PAGE_SIZE = 8;
  const [deletedTemplates, setDeletedTemplates] = useState<DocTemplate[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  useEnterToSave(saveTemplate, !!editingTemplate);

  // Emit state
  const [emitTemplate, setEmitTemplate] = useState<DocTemplate | null>(null);
  const [emitAlunoId, setEmitAlunoId] = useState('');
  const [emitPreview, setEmitPreview] = useState('');
  const [previewCertHtml, setPreviewCertHtml] = useState<string>('');
  // Pauta Final emit state (turma-level)
  const [emitTurmaId, setEmitTurmaId] = useState('');
  // Mapa de Aproveitamento emit state (trimestre-level)
  const [emitTrimestre, setEmitTrimestre] = useState<1 | 2 | 3>(1);
  // Document history for selected student in emit mode
  const [emitAlunoHistorico, setEmitAlunoHistorico] = useState<any[]>([]);
  // Faltas por disciplina/trimestre (para Termos de Frequência)
  const [emitFaltasData, setEmitFaltasData] = useState<{disciplina:string; turmaId:string; trimestre:number; faltasInj:number; faltasJust:number; totalFaltas:number}[]>([]);
  // Extracto de Propinas — date filter
  const [emitExtratoDataInicio, setEmitExtratoDataInicio] = useState('');
  const [emitExtratoDataFim, setEmitExtratoDataFim] = useState('');
  const [emitDisciplina, setEmitDisciplina] = useState('');
  const [emitAnoLetivo, setEmitAnoLetivo] = useState('');
  const [emitMiniPautaTrimestre, setEmitMiniPautaTrimestre] = useState<0 | 1 | 2 | 3>(0);
  const [emitMiniPautaTrimestreOK, setEmitMiniPautaTrimestreOK] = useState(false);
  const [emitMiniPautaAnoLetivo, setEmitMiniPautaAnoLetivo] = useState('');
  // Tamanho do papel para Pauta Final e Mapa de Aproveitamento Final ('A4' compacto, 'A3' alargado)
  const [emitPaperSize, setEmitPaperSize] = useState<'A3' | 'A4'>('A4');
  // Período/Regime para Mapa de Aproveitamento ('AUTO' = derivado das turmas, ou valor manual)
  const [emitPeriodo, setEmitPeriodo] = useState<'AUTO' | 'Manhã' | 'Tarde' | 'Noite' | 'Manhã / Tarde'>('AUTO');
  // Ciclo para Mapa de Aproveitamento
  const [emitCiclo, setEmitCiclo] = useState<'PRIMARIO' | 'I_CICLO' | 'II_CICLO'>('II_CICLO');
  // Curso para Mapa de Aproveitamento por Curso Individual
  const [emitCursoId, setEmitCursoId] = useState('');
  // Disciplinas da turma via turma_disciplinas (fonte primária, mais precisa que derivar das notas)
  const [disciplinasDaTurmaAPI, setDisciplinasDaTurmaAPI] = useState<string[]>([]);
  const [disciplinasDaTurmaAPILoading, setDisciplinasDaTurmaAPILoading] = useState(false);

  // PAP data for 13ª Classe certificate
  const [papAlunoData, setPapAlunoData] = useState<{ notaEstagio: number | null; notaDefesa: number | null; notaPAP: number | null } | null>(null);

  const inputRef = useRef<TextInput>(null);

  // ─── Toast notification ───────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(message);
    setToastType(type);
    Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start();
    }, 3000);
  }

  // ─── Confirm modal (replaces Alert.alert — bloqueado por iframes) ──────────
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => void;
  } | null>(null);

  function showConfirm(opts: {
    title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void;
  }) {
    setConfirmModal({ ...opts, danger: opts.danger ?? false });
  }
  const quillIframeRef = useRef<any>(null);
  const quillSrcdocRef = useRef<string>('');
  // Tracks latest iframe HTML without triggering re-renders (web only).
  // Re-rendering the parent unmounts EditorScreen and reloads the iframe, losing edits.
  const webEditorContentRef = useRef<string>('');
  const tinyEditorRef = useRef<any>(null);
  const [tinyInitContent, setTinyInitContent] = useState<string>('');
  const [editorKey, setEditorKey] = useState<number>(0);
  const editorNomeRef = useRef('');
  const editorTipoRef = useRef<DocTipo>('declaracao');
  const editorContentRef = useRef('');
  const editorInsigniaRef = useRef<string | undefined>(undefined);
  const editorMarcaAguaRef = useRef<string | undefined>(undefined);
  const editorCabecalhoNomeRef = useRef<string>('');
  const editorCabecalhoExtraRef = useRef<string>('');
  const editorCabecalhoAlignRef = useRef<'left' | 'center' | 'right'>('center');
  const cabecalhoInputRef = useRef<any>(null);
  const editingTemplateIdRef = useRef<string | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { editorNomeRef.current = editorNome; }, [editorNome]);
  useEffect(() => { editorTipoRef.current = editorTipo; }, [editorTipo]);
  useEffect(() => { editorContentRef.current = editorContent; }, [editorContent]);
  useEffect(() => { editorInsigniaRef.current = editorInsignia; }, [editorInsignia]);
  useEffect(() => { editorMarcaAguaRef.current = editorMarcaAgua; }, [editorMarcaAgua]);
  useEffect(() => { editorCabecalhoNomeRef.current = editorCabecalhoNome; }, [editorCabecalhoNome]);
  useEffect(() => { editorCabecalhoExtraRef.current = editorCabecalhoExtra; }, [editorCabecalhoExtra]);
  useEffect(() => { editorCabecalhoAlignRef.current = editorCabecalhoAlign; }, [editorCabecalhoAlign]);
  useEffect(() => { editingTemplateIdRef.current = editingTemplate?.id ?? null; }, [editingTemplate]);

  function getDraftKey(templateId?: string | null) {
    return `${DOC_EDITOR_DRAFT_PREFIX}:${user?.id || 'anon'}:${templateId || 'novo'}`;
  }

  async function readEditorDraft(templateId?: string | null): Promise<DocEditorDraft | null> {
    try {
      const raw = await AsyncStorage.getItem(getDraftKey(templateId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function clearEditorDraft(templateId?: string | null) {
    try {
      await AsyncStorage.removeItem(getDraftKey(templateId));
    } catch {}
  }

  function getCurrentEditorHtml() {
    if (Platform.OS === 'web') {
      const liveContent = tinyEditorRef.current?.getContent?.();
      return typeof liveContent === 'string' ? liveContent : webEditorContentRef.current;
    }
    return editorContentRef.current;
  }

  function preserveLiveEditorHtml() {
    const current = getCurrentEditorHtml();
    webEditorContentRef.current = current;
    editorContentRef.current = current;
    setTinyInitContent(current);
    setEditorContent(current);
    return current;
  }

  function scheduleEditorDraftSave(nextContent?: string) {
    if (mode !== 'editor') return;
    const content = nextContent ?? getCurrentEditorHtml();
    webEditorContentRef.current = content;
    editorContentRef.current = content;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(async () => {
      const draft: DocEditorDraft = {
        nome: editorNomeRef.current,
        tipo: editorTipoRef.current,
        conteudo: content,
        insigniaBase64: editorInsigniaRef.current,
        marcaAguaBase64: editorMarcaAguaRef.current,
        cabecalhoNome: editorCabecalhoNomeRef.current,
        cabecalhoExtra: editorCabecalhoExtraRef.current,
        cabecalhoAlign: editorCabecalhoAlignRef.current,
        atualizadoEm: new Date().toISOString(),
      };
      try {
        await AsyncStorage.setItem(getDraftKey(editingTemplateIdRef.current), JSON.stringify(draft));
      } catch {}
    }, 700);
  }

  function updateEditorNome(text: string) {
    setEditorNome(text);
    editorNomeRef.current = text;
    scheduleEditorDraftSave();
  }

  function updateEditorTipoState(tipo: DocTipo) {
    setEditorTipo(tipo);
    editorTipoRef.current = tipo;
    scheduleEditorDraftSave();
  }

  function updateEditorContent(text: string) {
    setEditorContent(text);
    editorContentRef.current = text;
    scheduleEditorDraftSave(text);
  }

  function updateEditorInsignia(value: string | undefined) {
    preserveLiveEditorHtml();
    setEditorInsignia(value);
    editorInsigniaRef.current = value;
    scheduleEditorDraftSave();
  }

  async function pasteInsigniaFromClipboard() {
    if (Platform.OS !== 'web') return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          const reader = new FileReader();
          reader.onload = () => updateEditorInsignia(reader.result as string);
          reader.readAsDataURL(blob);
          return;
        }
      }
      showToast('Sem imagem na área de transferência. Copie uma imagem primeiro (Ctrl+C).', 'info');
    } catch {
      showToast('Prima Ctrl+C numa imagem e depois Ctrl+V aqui para colar.', 'info');
    }
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function handleGlobalPaste(e: ClipboardEvent) {
      if (!showAppearPanel) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = () => updateEditorInsignia(reader.result as string);
          reader.readAsDataURL(blob);
          e.preventDefault();
          return;
        }
      }
    }
    document.addEventListener('paste', handleGlobalPaste as EventListener);
    return () => document.removeEventListener('paste', handleGlobalPaste as EventListener);
  }, [showAppearPanel]);

  function updateEditorMarcaAgua(value: string | undefined) {
    preserveLiveEditorHtml();
    setEditorMarcaAgua(value);
    editorMarcaAguaRef.current = value;
    scheduleEditorDraftSave();
  }

  function updateEditorCabecalhoNome(text: string) {
    setEditorCabecalhoNome(text);
    editorCabecalhoNomeRef.current = text;
    scheduleEditorDraftSave();
  }

  function updateEditorCabecalhoExtra(text: string) {
    setEditorCabecalhoExtra(text);
    editorCabecalhoExtraRef.current = text;
    scheduleEditorDraftSave();
  }

  function updateEditorCabecalhoAlign(align: 'left' | 'center' | 'right') {
    setEditorCabecalhoAlign(align);
    editorCabecalhoAlignRef.current = align;
    scheduleEditorDraftSave();
  }

  function wrapCabecalhoText(tag: string) {
    if (Platform.OS !== 'web') return;
    const node = cabecalhoInputRef.current;
    const textarea: HTMLTextAreaElement | null =
      (node as any)?._inputRef?.current ?? (node as any)?._nativeRef ?? (node as any);
    if (!textarea || typeof textarea.selectionStart !== 'number') return;
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end);
    const wrapped = selected.length > 0
      ? `<${tag}>${selected}</${tag}>`
      : `<${tag}></${tag}>`;
    const newText = value.slice(0, start) + wrapped + value.slice(end);
    updateEditorCabecalhoExtra(newText);
    setTimeout(() => {
      textarea.focus();
      const cursor = start + wrapped.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  }

  // Stable callback — never recreated on re-renders so TinyMCE never re-initialises.
  const tinyOnEditorChange = useCallback((content: string) => {
    webEditorContentRef.current = content;
    editorContentRef.current = content;
    scheduleEditorDraftSave(content);
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => setPreviewHtml(content), 250);
  }, [mode]);

  // Stable init config — object identity preserved across re-renders.
  const tinyInitConfig = useMemo(() => ({
    license_key: 'gpl',
    height: 720,
    min_height: 400,
    menubar: true,
    branding: false,
    promotion: false,
    convert_urls: false,
    relative_urls: false,
    toolbar_mode: 'wrap' as const,
    toolbar_sticky: true,
    toolbar_sticky_offset: 0,
    resize: 'both' as const,
    plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
      'preview', 'anchor', 'searchreplace', 'visualblocks', 'visualchars', 'code',
      'fullscreen', 'insertdatetime', 'media', 'table', 'wordcount',
      'pagebreak', 'nonbreaking', 'quickbars', 'directionality', 'help',
      'emoticons', 'codesample', 'accordion',
    ],
    toolbar:
      'undo redo | fontfamily fontsize blocks styles | bold italic underline strikethrough subscript superscript | forecolor backcolor | removeformat | ' +
      'alignleft aligncenter alignright alignjustify | ltr rtl | lineheight paragraphspacing | ' +
      'bullist numlist outdent indent | hr pagebreak nonbreaking | ' +
      'link image media table charmap emoticons codesample insertdatetime | ' +
      'cabecalhooficial resetsignature insertvariavel insertdivider inserircampo | ' +
      'accordion | visualblocks visualchars | fullscreen preview code help',
    style_formats: [
      { title: 'Estilos Angola', items: [
        { title: 'Título Principal', block: 'p', styles: { 'font-family': "'Times New Roman',serif", 'font-size': '16pt', 'font-weight': 'bold', 'text-align': 'center', 'text-transform': 'uppercase', 'letter-spacing': '1px', 'margin': '12px 0' } },
        { title: 'Subtítulo de Secção', block: 'p', styles: { 'font-family': "'Times New Roman',serif", 'font-size': '13pt', 'font-weight': 'bold', 'text-align': 'center', 'margin': '8px 0' } },
        { title: 'Texto de Corpo', block: 'p', styles: { 'font-family': "'Times New Roman',serif", 'font-size': '12pt', 'line-height': '2', 'text-align': 'justify', 'margin': '6px 0' } },
        { title: 'Texto Centrado', block: 'p', styles: { 'font-family': "'Times New Roman',serif", 'font-size': '12pt', 'line-height': '1.8', 'text-align': 'center' } },
        { title: 'Cabeçalho Ministério', block: 'p', styles: { 'font-family': "'Times New Roman',serif", 'font-size': '11pt', 'font-weight': 'bold', 'text-align': 'center', 'text-transform': 'uppercase', 'letter-spacing': '1px' } },
        { title: 'Declaração (justificado)', block: 'p', styles: { 'font-family': "'Times New Roman',serif", 'font-size': '12pt', 'line-height': '2.2', 'text-align': 'justify', 'text-indent': '40px', 'margin': '10px 0' } },
        { title: 'Nota de Rodapé', block: 'p', styles: { 'font-size': '9pt', 'color': '#444', 'border-top': '1px solid #ccc', 'margin-top': '20px', 'padding-top': '8px' } },
      ]},
      { title: 'Cabeçalhos', items: [
        { title: 'Cabeçalho 1', format: 'h1' },
        { title: 'Cabeçalho 2', format: 'h2' },
        { title: 'Cabeçalho 3', format: 'h3' },
        { title: 'Cabeçalho 4', format: 'h4' },
      ]},
      { title: 'Destaques', items: [
        { title: 'Negrito', inline: 'strong' },
        { title: 'Itálico', inline: 'em' },
        { title: 'Sublinhado', inline: 'span', styles: { 'text-decoration': 'underline' } },
        { title: 'Marcado (amarelo)', inline: 'mark', styles: { 'background': '#ffe08a', 'padding': '1px 3px' } },
        { title: 'Código inline', inline: 'code', styles: { background: '#f0f0f0', padding: '2px 5px', 'border-radius': '3px', 'font-family': 'monospace', 'font-size': '90%' } },
      ]},
    ],
    style_formats_merge: false,
    indent_use_margin: true,
    image_advtab: true,
    image_caption: true,
    contextmenu: 'link image table | bold italic | insertvariavel',
    table_column_resizing: 'resizetable' as const,
    font_family_formats:
      'Times New Roman=Times New Roman,Times,serif;' +
      'Arial=Arial,Helvetica,sans-serif;' +
      'Calibri=Calibri,sans-serif;' +
      'Georgia=Georgia,serif;' +
      'Verdana=Verdana,Geneva,sans-serif;' +
      'Tahoma=Tahoma,Geneva,sans-serif;' +
      'Trebuchet MS=Trebuchet MS,Helvetica,sans-serif;' +
      'Courier New=Courier New,Courier,monospace;' +
      'Garamond=Garamond,serif;' +
      'Palatino=Palatino Linotype,Book Antiqua,Palatino,serif;' +
      'Book Antiqua=Book Antiqua,Palatino,serif;' +
      'Century Gothic=Century Gothic,sans-serif;',
    fontsize_formats: '8px 9px 10px 11px 12px 13px 14px 15px 16px 18px 20px 22px 24px 28px 32px 36px 48px 60px 72px',
    lineheight_formats: '0.8 0.9 1 1.15 1.25 1.5 1.75 2 2.25 2.5 2.75 3 3.5 4',
    pagebreak_separator: '<!-- pagebreak -->',
    nonbreaking_force_tab: false,
    quickbars_selection_toolbar: 'bold italic underline | forecolor backcolor | link | blocks fontsize',
    quickbars_insert_toolbar: false,
    forced_root_block: 'p',
    valid_styles: {
      '*': 'text-align,margin,margin-top,margin-bottom,margin-left,margin-right,padding,padding-top,padding-bottom,padding-left,padding-right,line-height,font-size,font-family,font-weight,font-style,font-variant,text-decoration,text-transform,text-indent,color,background,background-color,background-image,background-repeat,background-size,background-position,border,border-top,border-bottom,border-left,border-right,border-color,border-style,border-width,border-radius,border-collapse,border-spacing,width,height,min-width,min-height,max-width,max-height,vertical-align,white-space,letter-spacing,word-spacing,word-break,overflow,overflow-x,overflow-y,display,position,top,left,right,bottom,z-index,float,clear,box-sizing,box-shadow,opacity,transform,transform-origin,object-fit,object-position,flex,flex-direction,flex-wrap,flex-grow,flex-shrink,flex-basis,gap,row-gap,column-gap,justify-content,align-items,align-self,align-content,grid-template-columns,grid-template-rows,grid-column,grid-row,page-break-before,page-break-after,page-break-inside,break-before,break-after,break-inside,list-style,list-style-type,list-style-position,visibility,cursor,outline'
    },
    extended_valid_elements:
      'style[type|media|scoped],' +
      'mark[class|style|data-*],' +
      'svg[*],path[*],g[*],circle[*],rect[*],line[*],polygon[*],polyline[*],text[*],defs[*],use[*],symbol[*],' +
      'table[class|style|border|cellpadding|cellspacing|width|summary|data-*],' +
      'tr[class|style|data-*],' +
      'td[class|style|colspan|rowspan|width|height|valign|align|nowrap|data-*],' +
      'th[class|style|colspan|rowspan|width|height|valign|align|scope|data-*],' +
      'colgroup[class|style|span|width],' +
      'col[class|style|span|width],' +
      'div[class|style|id|data-*],' +
      'span[class|style|id|data-*],' +
      'p[class|style|id|data-*],' +
      'img[src|alt|title|width|height|class|style|id|data-*]',
    valid_children: '+body[style],+p[svg|mark],+span[svg|mark]',
    paste_data_images: true,
    paste_remove_styles_if_webkit: false,
    paste_merge_formats: false,
    paste_webkit_styles: 'all',
    table_advtab: true,
    table_cell_advtab: true,
    table_row_advtab: true,
    table_appearance_options: true,
    table_grid: true,
    table_default_attributes: { border: '0' },
    table_default_styles: { 'border-collapse': 'collapse', width: '100%' },
    object_resizing: true,
    keep_styles: true,
    verify_html: false,
    formats: {
      alignleft: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,li', styles: { textAlign: 'left' } },
      aligncenter: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,li', styles: { textAlign: 'center' } },
      alignright: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,li', styles: { textAlign: 'right' } },
      alignjustify: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,li', styles: { textAlign: 'justify' } },
    },
    setup: (editor: any) => {
      const SIG_DIRECTOR = `<p style="font-weight:bold;margin:0 0 28px 0;">O(A) Director(a) da Escola</p>
<span style="display:inline-block;border-bottom:1.5px solid #222;min-width:220px;height:20px;">&nbsp;</span>
<p style="margin:4px 0 0 0;">{{NOME_DIRECTOR}}</p>`;
      const SIG_SUBDIRECTOR = `<p style="font-weight:bold;margin:0 0 28px 0;">O(A) Subdirector(a) Pedagógico(a)</p>
<span style="display:inline-block;border-bottom:1.5px solid #222;min-width:220px;height:20px;">&nbsp;</span>
<p style="margin:4px 0 0 0;">{{NOME_SUBDIRECTOR_PEDAGOGICO}}</p>`;
      const SIG_DG = `<p style="font-weight:bold;margin:0 0 28px 0;">O(A) Director(a) Geral</p>
<span style="display:inline-block;border-bottom:1.5px solid #222;min-width:220px;height:20px;">&nbsp;</span>
<p style="margin:4px 0 0 0;">{{NOME_DIRECTOR_GERAL}}</p>`;
      const buildTable = (cells: string[]) => {
        const w = (100 / cells.length).toFixed(2);
        const tds = cells.map(c =>
          `<td style="width:${w}%;border:none;text-align:center;vertical-align:top;padding:4px;">${c}</td>`
        ).join('');
        return `<table style="width:100%;border:none;border-collapse:collapse;margin-top:12px;"><tbody><tr>${tds}</tr></tbody></table><p>&nbsp;</p>`;
      };
      const replaceClosestSignatureTable = (html: string) => {
        let node: any = editor.selection.getNode();
        let table: HTMLElement | null = null;
        while (node && node !== editor.getBody()) {
          if (node.nodeName === 'TABLE') { table = node; break; }
          node = node.parentNode;
        }
        if (table && /(?:Director|Subdirector|NOME_DIRECTOR|NOME_SUBDIRECTOR|_____)/i.test(table.innerHTML)) {
          editor.dom.setOuterHTML(table, html);
        } else {
          editor.insertContent(html);
        }
        editor.undoManager.add();
        editor.fire('change');
      };
      // ─── Cabeçalho Oficial — bloco institucional reutilizável ─────────────
      const HEADER_VISTO_BOX = `<div style="position:absolute;top:0;left:0;border:1.2px solid #111;padding:6px 10px;font-size:9px;line-height:1.4;min-width:130px;text-align:center;font-family:'Times New Roman',serif;">
<div style="font-weight:bold;letter-spacing:0.5px;margin-bottom:2px;">VISTO</div>
<div style="text-align:left;margin-bottom:6px;">Data ___/___/______</div>
<div style="border-top:1px solid #111;padding-top:3px;font-size:8.5px;font-style:italic;">A Chefe de Repartição<br/>e Ensino</div>
</div>`;
      const HEADER_CREST = `<div style="text-align:center;margin:0 auto 4px auto;">
<img src="{{LOGO_URL}}" alt="Brasão" style="width:78px;height:78px;object-fit:contain;display:inline-block;" />
</div>
<div style="text-align:center;font-family:'Times New Roman',serif;font-size:11pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:2px 0;">{{CABECALHO_LINHA_1}}</div>
<div style="text-align:center;font-family:'Times New Roman',serif;font-size:11pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">{{CABECALHO_LINHA_2}}</div>`;
      const HEADER_INFO_BAR = `<div style="border:1px solid #444;padding:5px 8px;margin-top:8px;font-family:'Times New Roman',serif;font-size:10pt;display:flex;flex-wrap:wrap;gap:18px;">
<div><strong>ESCOLA:</strong> {{NOME_ESCOLA}}</div>
<div><strong>MUNICÍPIO DE:</strong> {{MUNICIPIO_ESCOLA}}</div>
<div><strong>PROVÍNCIA DE:</strong> {{PROVINCIA_ESCOLA}}</div>
</div>`;
      const HEADER_FULL = `<div style="position:relative;min-height:130px;padding-top:6px;">${HEADER_VISTO_BOX}${HEADER_CREST}</div>${HEADER_INFO_BAR}<p>&nbsp;</p>`;
      const HEADER_SIMPLES = `${HEADER_CREST}<p>&nbsp;</p>`;
      const HEADER_SEM_VISTO = `${HEADER_CREST}${HEADER_INFO_BAR}<p>&nbsp;</p>`;
      const HEADER_SO_VISTO = `<div style="position:relative;min-height:90px;">${HEADER_VISTO_BOX}</div>`;
      editor.ui.registry.addMenuButton('cabecalhooficial', {
        text: 'Cabeçalho',
        tooltip: 'Inserir cabeçalho oficial (brasão + REPÚBLICA + MINISTÉRIO + dados da escola)',
        fetch: (callback: any) => {
          callback([
            {
              type: 'menuitem',
              text: 'Cabeçalho COMPLETO (VISTO + brasão + ministério + escola)',
              onAction: () => {
                editor.insertContent(HEADER_FULL);
                editor.undoManager.add();
                editor.fire('change');
              },
            },
            {
              type: 'menuitem',
              text: 'Sem caixa VISTO (brasão + ministério + escola)',
              onAction: () => {
                editor.insertContent(HEADER_SEM_VISTO);
                editor.undoManager.add();
                editor.fire('change');
              },
            },
            {
              type: 'menuitem',
              text: 'Apenas brasão + ministério (centrado)',
              onAction: () => {
                editor.insertContent(HEADER_SIMPLES);
                editor.undoManager.add();
                editor.fire('change');
              },
            },
            { type: 'separator' },
            {
              type: 'menuitem',
              text: 'Apenas caixa VISTO (canto superior esquerdo)',
              onAction: () => {
                editor.insertContent(HEADER_SO_VISTO);
                editor.undoManager.add();
                editor.fire('change');
              },
            },
          ]);
        },
      });
      editor.ui.registry.addMenuButton('resetsignature', {
        text: 'Assinatura',
        tooltip: 'Inserir / repor bloco de assinatura padrão',
        fetch: (callback: any) => {
          callback([
            {
              type: 'menuitem',
              text: 'Apenas Director(a) (centrado)',
              onAction: () => replaceClosestSignatureTable(buildTable([SIG_DIRECTOR])),
            },
            {
              type: 'menuitem',
              text: 'Apenas Subdirector(a) Pedagógico(a) (centrado)',
              onAction: () => replaceClosestSignatureTable(buildTable([SIG_SUBDIRECTOR])),
            },
            {
              type: 'menuitem',
              text: 'Apenas Director(a) Geral (centrado)',
              onAction: () => replaceClosestSignatureTable(buildTable([SIG_DG])),
            },
            { type: 'separator' },
            {
              type: 'menuitem',
              text: 'Director + Subdirector (lado a lado)',
              onAction: () => replaceClosestSignatureTable(buildTable([SIG_DIRECTOR, SIG_SUBDIRECTOR])),
            },
            {
              type: 'menuitem',
              text: 'Director Geral + Director (lado a lado)',
              onAction: () => replaceClosestSignatureTable(buildTable([SIG_DG, SIG_DIRECTOR])),
            },
            {
              type: 'menuitem',
              text: 'Director Geral + Director + Subdirector (3 colunas)',
              onAction: () => replaceClosestSignatureTable(buildTable([SIG_DG, SIG_DIRECTOR, SIG_SUBDIRECTOR])),
            },
          ]);
        },
      });
      editor.ui.registry.addMenuButton('paragraphspacing', {
        text: 'Espaçamento ¶',
        tooltip: 'Espaçamento entre parágrafos (margem superior/inferior)',
        fetch: (callback: any) => {
          const opts = [
            { label: 'Nenhum (0px)', top: 0, bottom: 0 },
            { label: 'Pequeno (4px)', top: 4, bottom: 4 },
            { label: 'Normal (8px)', top: 8, bottom: 8 },
            { label: 'Médio (12px)', top: 12, bottom: 12 },
            { label: 'Grande (16px)', top: 16, bottom: 16 },
            { label: 'Muito grande (24px)', top: 24, bottom: 24 },
            { label: 'Extra (32px)', top: 32, bottom: 32 },
          ];
          callback(opts.map(o => ({
            type: 'menuitem',
            text: o.label,
            onAction: () => {
              const sel = editor.selection;
              const nodes: HTMLElement[] = [];
              const candidates = ['P','DIV','LI','H1','H2','H3','H4','H5','H6','TD','TH'];
              let node: any = sel.getNode();
              while (node && node !== editor.getBody()) {
                if (candidates.includes(node.nodeName)) {
                  if (!nodes.includes(node)) nodes.push(node);
                  break;
                }
                node = node.parentNode;
              }
              const allInRange = editor.selection.getSelectedBlocks?.() || [];
              for (const b of allInRange) {
                if (candidates.includes(b.nodeName) && !nodes.includes(b)) nodes.push(b);
              }
              for (const el of nodes) {
                editor.dom.setStyle(el, 'margin-top', o.top + 'px');
                editor.dom.setStyle(el, 'margin-bottom', o.bottom + 'px');
              }
              editor.undoManager.add();
              editor.fire('change');
            },
          })));
        },
      });

      // ─── Variáveis — inserção rápida por categoria ────────────────────────
      const ins = (tag: string) => { editor.insertContent(tag); editor.undoManager.add(); editor.fire('change'); };
      editor.ui.registry.addMenuButton('insertvariavel', {
        text: '{ } Variáveis',
        tooltip: 'Inserir variável de substituição automática',
        fetch: (callback: any) => {
          callback([
            {
              type: 'nestedmenuitem', text: '🏫 Escola',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{NOME_ESCOLA}}', onAction: () => ins('{{NOME_ESCOLA}}') },
                { type: 'menuitem', text: '{{ANO_LECTIVO}}', onAction: () => ins('{{ANO_LECTIVO}}') },
                { type: 'menuitem', text: '{{MUNICIPIO_ESCOLA}}', onAction: () => ins('{{MUNICIPIO_ESCOLA}}') },
                { type: 'menuitem', text: '{{PROVINCIA_ESCOLA}}', onAction: () => ins('{{PROVINCIA_ESCOLA}}') },
                { type: 'menuitem', text: '{{LOGO_URL}}', onAction: () => ins('{{LOGO_URL}}') },
                { type: 'menuitem', text: '{{LINHA_CONTACTO_ESCOLA}}', onAction: () => ins('{{LINHA_CONTACTO_ESCOLA}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '🎓 Aluno',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{NOME_COMPLETO}}', onAction: () => ins('{{NOME_COMPLETO}}') },
                { type: 'menuitem', text: '{{NUMERO_MATRICULA}}', onAction: () => ins('{{NUMERO_MATRICULA}}') },
                { type: 'menuitem', text: '{{CLASSE}}', onAction: () => ins('{{CLASSE}}') },
                { type: 'menuitem', text: '{{TURMA}}', onAction: () => ins('{{TURMA}}') },
                { type: 'menuitem', text: '{{TURNO}}', onAction: () => ins('{{TURNO}}') },
                { type: 'menuitem', text: '{{CURSO}}', onAction: () => ins('{{CURSO}}') },
                { type: 'menuitem', text: '{{NIVEL}}', onAction: () => ins('{{NIVEL}}') },
                { type: 'menuitem', text: '{{SALA}}', onAction: () => ins('{{SALA}}') },
                { type: 'menuitem', text: '{{GENERO}}', onAction: () => ins('{{GENERO}}') },
                { type: 'menuitem', text: '{{DATA_NASCIMENTO}}', onAction: () => ins('{{DATA_NASCIMENTO}}') },
                { type: 'menuitem', text: '{{IDADE}}', onAction: () => ins('{{IDADE}}') },
                { type: 'menuitem', text: '{{BI}}', onAction: () => ins('{{BI}}') },
                { type: 'menuitem', text: '{{PROVINCIA}}', onAction: () => ins('{{PROVINCIA}}') },
                { type: 'menuitem', text: '{{MUNICIPIO}}', onAction: () => ins('{{MUNICIPIO}}') },
                { type: 'menuitem', text: '{{NOME_PAI}}', onAction: () => ins('{{NOME_PAI}}') },
                { type: 'menuitem', text: '{{NOME_MAE}}', onAction: () => ins('{{NOME_MAE}}') },
                { type: 'menuitem', text: '{{SITUACAO}}', onAction: () => ins('{{SITUACAO}}') },
                { type: 'menuitem', text: '{{DATA_MATRICULA}}', onAction: () => ins('{{DATA_MATRICULA}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '👨‍👩‍👧 Encarregado',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{ENCARREGADO_NOME}}', onAction: () => ins('{{ENCARREGADO_NOME}}') },
                { type: 'menuitem', text: '{{ENCARREGADO_TELEFONE}}', onAction: () => ins('{{ENCARREGADO_TELEFONE}}') },
                { type: 'menuitem', text: '{{ENCARREGADO_EMAIL}}', onAction: () => ins('{{ENCARREGADO_EMAIL}}') },
                { type: 'menuitem', text: '{{ENCARREGADO_PROFISSAO}}', onAction: () => ins('{{ENCARREGADO_PROFISSAO}}') },
                { type: 'menuitem', text: '{{ENCARREGADO_RESIDENCIA}}', onAction: () => ins('{{ENCARREGADO_RESIDENCIA}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '📊 Notas',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{TABELA_NOTAS}}', onAction: () => ins('{{TABELA_NOTAS}}') },
                { type: 'menuitem', text: '{{TABELA_NOTAS_SIMPLES}}', onAction: () => ins('{{TABELA_NOTAS_SIMPLES}}') },
                { type: 'menuitem', text: '{{TABELA_NOTAS_2COL}}', onAction: () => ins('{{TABELA_NOTAS_2COL}}') },
                { type: 'menuitem', text: '{{TABELA_NOTAS_3COL}}', onAction: () => ins('{{TABELA_NOTAS_3COL}}') },
                { type: 'menuitem', text: '{{TABELA_NOTAS_HORIZONTAL}}', onAction: () => ins('{{TABELA_NOTAS_HORIZONTAL}}') },
                { type: 'menuitem', text: '{{TERMOS_DE_FREQUENCIA}}', onAction: () => ins('{{TERMOS_DE_FREQUENCIA}}') },
                { type: 'menuitem', text: '{{MAPA_ACADEMICO}}', onAction: () => ins('{{MAPA_ACADEMICO}}') },
                { type: 'menuitem', text: '{{TABELA_NOTAS_II_CICLO}}', onAction: () => ins('{{TABELA_NOTAS_II_CICLO}}') },
                { type: 'menuitem', text: '{{MEDIA_GERAL}}', onAction: () => ins('{{MEDIA_GERAL}}') },
                { type: 'menuitem', text: '{{MEDIA_GERAL_EXTENSO}}', onAction: () => ins('{{MEDIA_GERAL_EXTENSO}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '💰 Financeiro',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{TOTAL_PAGO}}', onAction: () => ins('{{TOTAL_PAGO}}') },
                { type: 'menuitem', text: '{{TOTAL_PENDENTE}}', onAction: () => ins('{{TOTAL_PENDENTE}}') },
                { type: 'menuitem', text: '{{TOTAL_TRANSACCOES}}', onAction: () => ins('{{TOTAL_TRANSACCOES}}') },
                { type: 'menuitem', text: '{{FIN_ESTADO}}', onAction: () => ins('{{FIN_ESTADO}}') },
                { type: 'menuitem', text: '{{FIN_SALDO}}', onAction: () => ins('{{FIN_SALDO}}') },
                { type: 'menuitem', text: '{{DOC_REF}}', onAction: () => ins('{{DOC_REF}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '👔 Funcionário / RH',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{FUNC_NOME}}', onAction: () => ins('{{FUNC_NOME}}') },
                { type: 'menuitem', text: '{{FUNC_CARGO}}', onAction: () => ins('{{FUNC_CARGO}}') },
                { type: 'menuitem', text: '{{FUNC_CATEGORIA}}', onAction: () => ins('{{FUNC_CATEGORIA}}') },
                { type: 'menuitem', text: '{{MES_ANO_FOLHA}}', onAction: () => ins('{{MES_ANO_FOLHA}}') },
                { type: 'menuitem', text: '{{SALARIO_BASE}}', onAction: () => ins('{{SALARIO_BASE}}') },
                { type: 'menuitem', text: '{{SALARIO_BRUTO}}', onAction: () => ins('{{SALARIO_BRUTO}}') },
                { type: 'menuitem', text: '{{SALARIO_LIQUIDO}}', onAction: () => ins('{{SALARIO_LIQUIDO}}') },
                { type: 'menuitem', text: '{{IRT}}', onAction: () => ins('{{IRT}}') },
                { type: 'menuitem', text: '{{INSS_EMPREGADO}}', onAction: () => ins('{{INSS_EMPREGADO}}') },
                { type: 'menuitem', text: '{{TOTAL_DESCONTOS}}', onAction: () => ins('{{TOTAL_DESCONTOS}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '📅 Datas e Referências',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{DATA_ACTUAL}}', onAction: () => ins('{{DATA_ACTUAL}}') },
                { type: 'menuitem', text: '{{DATA_EMISSAO}}', onAction: () => ins('{{DATA_EMISSAO}}') },
                { type: 'menuitem', text: '{{PERIODO_INICIO}}', onAction: () => ins('{{PERIODO_INICIO}}') },
                { type: 'menuitem', text: '{{PERIODO_FIM}}', onAction: () => ins('{{PERIODO_FIM}}') },
                { type: 'menuitem', text: '{{ANO_LECTIVO}}', onAction: () => ins('{{ANO_LECTIVO}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '🖊️ Responsáveis',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{NOME_DIRECTOR}}', onAction: () => ins('{{NOME_DIRECTOR}}') },
                { type: 'menuitem', text: '{{NOME_DIRECTOR_GERAL}}', onAction: () => ins('{{NOME_DIRECTOR_GERAL}}') },
                { type: 'menuitem', text: '{{NOME_SUBDIRECTOR_PEDAGOGICO}}', onAction: () => ins('{{NOME_SUBDIRECTOR_PEDAGOGICO}}') },
                { type: 'menuitem', text: '{{DIRECTOR_PEDAGOGICO}}', onAction: () => ins('{{DIRECTOR_PEDAGOGICO}}') },
                { type: 'menuitem', text: '{{DIRECTOR_GERAL}}', onAction: () => ins('{{DIRECTOR_GERAL}}') },
              ],
            },
            { type: 'separator' },
            {
              type: 'nestedmenuitem', text: '🔍 Verificação / QR',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{QR_VERIFICACAO}}', onAction: () => ins('{{QR_VERIFICACAO}}') },
                { type: 'menuitem', text: '{{QR_CODE}}', onAction: () => ins('{{QR_CODE}}') },
                { type: 'menuitem', text: '{{BARCODE_IMG}}', onAction: () => ins('{{BARCODE_IMG}}') },
                { type: 'menuitem', text: '{{URL_VERIFICACAO}}', onAction: () => ins('{{URL_VERIFICACAO}}') },
                { type: 'menuitem', text: '{{HASH_VERIFICACAO}}', onAction: () => ins('{{HASH_VERIFICACAO}}') },
                { type: 'menuitem', text: '{{NUMERO_EMISSAO}}', onAction: () => ins('{{NUMERO_EMISSAO}}') },
                { type: 'menuitem', text: '{{BADGE_EMISSAO}}', onAction: () => ins('{{BADGE_EMISSAO}}') },
              ],
            },
            {
              type: 'nestedmenuitem', text: '📋 Blocos Completos',
              getSubmenuItems: () => [
                { type: 'menuitem', text: '{{TABELA_NOTAS_FICHA}}', onAction: () => ins('{{TABELA_NOTAS_FICHA}}') },
                { type: 'menuitem', text: '{{HISTORICO_ANOS}}', onAction: () => ins('{{HISTORICO_ANOS}}') },
                { type: 'menuitem', text: '{{AVATAR_HTML}}', onAction: () => ins('{{AVATAR_HTML}}') },
                { type: 'menuitem', text: '{{LOGO_HTML}}', onAction: () => ins('{{LOGO_HTML}}') },
                { type: 'menuitem', text: '{{TITULO_DOC}}', onAction: () => ins('{{TITULO_DOC}}') },
              ],
            },
          ]);
        },
      });

      // ─── Divisor decorativo ────────────────────────────────────────────────
      editor.ui.registry.addMenuButton('insertdivider', {
        text: '— Divisor',
        tooltip: 'Inserir linha divisória decorativa',
        fetch: (callback: any) => {
          callback([
            {
              type: 'menuitem',
              text: 'Linha simples fina',
              onAction: () => {
                editor.insertContent('<hr style="border:none;border-top:1px solid #333;margin:10px 0;" /><p>&nbsp;</p>');
                editor.undoManager.add(); editor.fire('change');
              },
            },
            {
              type: 'menuitem',
              text: 'Linha dupla',
              onAction: () => {
                editor.insertContent('<hr style="border:none;border-top:3px double #333;margin:10px 0;" /><p>&nbsp;</p>');
                editor.undoManager.add(); editor.fire('change');
              },
            },
            {
              type: 'menuitem',
              text: 'Linha tracejada',
              onAction: () => {
                editor.insertContent('<hr style="border:none;border-top:1.5px dashed #555;margin:10px 0;" /><p>&nbsp;</p>');
                editor.undoManager.add(); editor.fire('change');
              },
            },
            {
              type: 'menuitem',
              text: 'Linha grossa (2px)',
              onAction: () => {
                editor.insertContent('<hr style="border:none;border-top:2px solid #111;margin:14px 0;" /><p>&nbsp;</p>');
                editor.undoManager.add(); editor.fire('change');
              },
            },
            { type: 'separator' },
            {
              type: 'menuitem',
              text: 'Espaço em branco (3 linhas)',
              onAction: () => {
                editor.insertContent('<p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>');
                editor.undoManager.add(); editor.fire('change');
              },
            },
          ]);
        },
      });

      // ─── Campos de preenchimento ───────────────────────────────────────────
      editor.ui.registry.addMenuButton('inserircampo', {
        text: '✏ Campo',
        tooltip: 'Inserir campo de preenchimento (linha com rótulo)',
        fetch: (callback: any) => {
          const campo = (label: string, largura: string) =>
            `<span style="display:inline-block;">${label}: <span style="display:inline-block;min-width:${largura};border-bottom:1px solid #111;">&nbsp;</span></span>`;
          callback([
            {
              type: 'menuitem',
              text: 'Linha em branco (curta)',
              onAction: () => { editor.insertContent('<span style="display:inline-block;min-width:120px;border-bottom:1px solid #111;">&nbsp;</span>'); editor.undoManager.add(); editor.fire('change'); },
            },
            {
              type: 'menuitem',
              text: 'Linha em branco (longa)',
              onAction: () => { editor.insertContent('<span style="display:inline-block;min-width:280px;border-bottom:1px solid #111;">&nbsp;</span>'); editor.undoManager.add(); editor.fire('change'); },
            },
            { type: 'separator' },
            {
              type: 'menuitem',
              text: 'Nome: ___________',
              onAction: () => { editor.insertContent(campo('Nome', '200px')); editor.undoManager.add(); editor.fire('change'); },
            },
            {
              type: 'menuitem',
              text: 'BI/Cédula: ___________',
              onAction: () => { editor.insertContent(campo('BI/Cédula', '180px')); editor.undoManager.add(); editor.fire('change'); },
            },
            {
              type: 'menuitem',
              text: 'Data: ___/___/______',
              onAction: () => { editor.insertContent('<span style="display:inline-block;">Data: <span style="display:inline-block;min-width:110px;border-bottom:1px solid #111;">&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>'); editor.undoManager.add(); editor.fire('change'); },
            },
            {
              type: 'menuitem',
              text: 'Telefone: ___________',
              onAction: () => { editor.insertContent(campo('Telefone', '150px')); editor.undoManager.add(); editor.fire('change'); },
            },
            {
              type: 'menuitem',
              text: 'Assinatura: ___________',
              onAction: () => { editor.insertContent(campo('Assinatura', '200px')); editor.undoManager.add(); editor.fire('change'); },
            },
            { type: 'separator' },
            {
              type: 'menuitem',
              text: 'Tabela de campos (2×2)',
              onAction: () => {
                editor.insertContent(
                  '<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tbody>' +
                  '<tr><td style="padding:6px 8px;border:none;width:50%;">Nome: <span style="display:inline-block;min-width:160px;border-bottom:1px solid #111;">&nbsp;</span></td>' +
                  '<td style="padding:6px 8px;border:none;width:50%;">BI/Cédula: <span style="display:inline-block;min-width:140px;border-bottom:1px solid #111;">&nbsp;</span></td></tr>' +
                  '<tr><td style="padding:6px 8px;border:none;">Data de Nasc.: <span style="display:inline-block;min-width:120px;border-bottom:1px solid #111;">&nbsp;</span></td>' +
                  '<td style="padding:6px 8px;border:none;">Telefone: <span style="display:inline-block;min-width:130px;border-bottom:1px solid #111;">&nbsp;</span></td></tr>' +
                  '</tbody></table><p>&nbsp;</p>'
                );
                editor.undoManager.add(); editor.fire('change');
              },
            },
          ]);
        },
      });
    },
    content_style:
      "body { font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.9; color: #111; padding: 24px 32px; background: #f0f0f0; }" +
      ".mce-content-body { background: #fff; max-width: 850px; margin: 0 auto; padding: 32px 40px; min-height: 400px; box-shadow: 0 2px 14px rgba(0,0,0,0.18); border-radius: 2px; }" +
      "img { max-width: 100%; height: auto; } img:not([width]):not([height]) { width: 120px; }" +
      "table { border-collapse: collapse; } table td, table th { font-size: 13px; } table td p, table th p { margin: 0 0 4px 0; }" +
      "h1,h2,h3,h4 { font-family: 'Times New Roman', Times, serif; }" +
      "div[data-var] { background:#e8f5e9; border:2px dashed #1a6b3c; border-radius:6px; padding:14px; text-align:center; margin:12px 0; cursor:default; }" +
      "div[data-var]:hover { border-color:#0d5c2e; background:#d4edda; }" +
      ".mce-accordion { border:1px solid #c8c8c8; border-radius:4px; margin:8px 0; }" +
      ".mce-accordion-summary { background:#f5f5f5; padding:8px 12px; font-weight:bold; cursor:pointer; }" +
      "mark { background:#ffe08a; padding:1px 3px; border-radius:2px; }",
    skin: 'oxide-dark',
    content_css: 'default',
    language: 'pt_PT',
    resize: 'both' as const,
    statusbar: true,
    image_uploadtab: true,
    automatic_uploads: false,
    images_upload_handler: (blobInfo: any) =>
      Promise.resolve(`data:${blobInfo.blob()?.type || 'image/png'};base64,${blobInfo.base64()}`),
    file_picker_types: 'image',
    file_picker_callback: (cb: any) => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', (e: any) => {
        const file = e.target.files[0];
        document.body.removeChild(input);
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          cb(reader.result as string, { title: file.name, width: '120' });
        });
        reader.readAsDataURL(file);
      });
      input.click();
    },
  }), []);

  // Listen for content changes from the iframe (web only).
  // Update ref only — never state — to avoid re-renders that reload the iframe.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: any) => {
      if (e.data?.type === 'ck_change') {
        webEditorContentRef.current = e.data.html;
      }
    };
    (window as any).addEventListener('message', handler);
    return () => (window as any).removeEventListener('message', handler);
  }, []);

  // Fetch document history for the selected student in emit mode
  useEffect(() => {
    if (!emitAlunoId) { setEmitAlunoHistorico([]); return; }
    fetch(`/api/documentos-emitidos/aluno/${emitAlunoId}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmitAlunoHistorico(Array.isArray(data) ? data : []))
      .catch(() => setEmitAlunoHistorico([]));
  }, [emitAlunoId]);

  // Carregar faltas por disciplina/trimestre quando o aluno muda (para coluna F nos Termos de Frequência)
  useEffect(() => {
    if (!emitAlunoId) { setEmitFaltasData([]); return; }
    fetch(`/api/presencas/aluno/${encodeURIComponent(emitAlunoId)}/faltas-por-disciplina`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmitFaltasData(Array.isArray(data) ? data : []))
      .catch(() => setEmitFaltasData([]));
  }, [emitAlunoId]);

  // Buscar disciplinas reais da turma via turma_disciplinas (mais preciso que derivar das notas)
  useEffect(() => {
    if (!emitTurmaId) { setDisciplinasDaTurmaAPI([]); return; }
    setDisciplinasDaTurmaAPILoading(true);
    fetch(`/api/turmas/${encodeURIComponent(emitTurmaId)}/disciplinas`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { nome: string }[]) => {
        const nomes = Array.isArray(data) ? data.map(d => d.nome).filter(Boolean) : [];
        setDisciplinasDaTurmaAPI(nomes);
      })
      .catch(() => setDisciplinasDaTurmaAPI([]))
      .finally(() => setDisciplinasDaTurmaAPILoading(false));
  }, [emitTurmaId]);

  // Fetch PAP data when a student is selected (for 13ª Classe certificates)
  useEffect(() => {
    if (!emitAlunoId) { setPapAlunoData(null); return; }
    const alunoNotas = notas.filter(n => n.alunoId === emitAlunoId);
    const anoLetivo = alunoNotas.length > 0
      ? [...alunoNotas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo))[0].anoLetivo
      : String(new Date().getFullYear());
    fetch(`/api/pap-alunos?alunoId=${encodeURIComponent(emitAlunoId)}&anoLetivo=${encodeURIComponent(anoLetivo)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setPapAlunoData(data ? {
        notaEstagio: data.notaEstagio ?? null,
        notaDefesa: data.notaDefesa ?? null,
        notaPAP: data.notaPAP ?? null,
      } : null))
      .catch(() => setPapAlunoData(null));
  }, [emitAlunoId, notas]);

  // Rebuild preview when PAP data arrives (for 13ª Classe templates)
  useEffect(() => {
    if (emitTemplate && emitAlunoId && !isExtratoPropinaType(emitTemplate)) {
      setEmitPreview(buildPreview(emitTemplate, emitAlunoId));
    }
  }, [papAlunoData]);

  // Rebuild preview when faltas data arrives (for Termos de Frequência)
  useEffect(() => {
    if (emitTemplate && emitAlunoId && !isExtratoPropinaType(emitTemplate)) {
      setEmitPreview(buildPreview(emitTemplate, emitAlunoId));
    }
  }, [emitFaltasData]);

  // Build full HTML preview for certificado types (for iframe preview panel)
  useEffect(() => {
    if (!emitTemplate || emitTemplate.tipo !== 'certificado' || !emitAlunoId) {
      setPreviewCertHtml('');
      return;
    }
    buildEmitDocHtml().then(result => {
      if (result) setPreviewCertHtml(result.html);
    }).catch(() => setPreviewCertHtml(''));
  }, [emitAlunoId, emitTemplate?.id]);

  // Load templates + seed defaults from database
  useEffect(() => {
    (async () => {
      try {
        const [fetched, deletedSeeds] = await Promise.all([
          api.get<DocTemplate[]>('/api/doc-templates'),
          api.get<string[]>('/api/doc-templates/deleted-seeds').catch(() => [] as string[]),
        ]);
        let list: DocTemplate[] = fetched ?? [];

        // Inject seed templates if not yet present in the database and not intentionally deleted
        const seeds = [SEED_COMPROVATIVO_MATRICULA, SEED_FICHA_INDIVIDUAL, SEED_BOLETIM_MATRICULA, SEED_LISTA_ADMITIDOS, SEED_LISTA_INSCRITOS, SEED_LISTA_RESULTADOS_ADMISSAO, SEED_EXTRATO_PROPINA, SEED_RECIBO_SALARIO, SEED_BOLETIM_INSCRICAO, SEED_CERT_HAB_I_CICLO, SEED_CERT_HAB_7A9A_DUNDO, SEED_CERT_TECNICO_PROF, SEED_CERT_HAB_LIT, SEED_CERT_PRIMARIO, SEED_LISTA_TURMA, SEED_MAPA_FREQUENCIAS, SEED_MAPA_POR_CURSO_CLASSE, SEED_MAPA_APROVEITAMENTO_POR_CURSO, SEED_MAPA_PRIM_TABELA, SEED_MAPA_I_CICLO_TABELA, SEED_CERT_II_CICLO, SEED_CERT_ITAQ_13, SEED_CERT_HAB_13, SEED_CERT_HAB_12, SEED_CERT_HAB_11, SEED_FICHA_MATRICULA, SEED_PAUTA_FINAL, SEED_DECL_NOTA_10, SEED_DECL_NOTA_11, SEED_DECL_NOTA_12, SEED_DECL_NOTA_13, SEED_MINI_PAUTA, SEED_MINI_PAUTA_DISCIPLINA, SEED_DECLARACAO_COM_NOTA, SEED_CERTIFICADO_I_CICLO, SEED_DECLARACAO_HABILITACOES_PRIMARIO, SEED_DECLARACAO_HABILITACOES, SEED_GUIA_TRANSFERENCIA, { id: 'tpl_seed_ficha_reconfirmacao_matricula_v1', nome: 'Ficha de Reconfirmação de Matrícula', tipo: 'ficha_matricula', conteudo: 'FICHA DE RECONFIRMAÇÃO DE MATRÍCULA\n\nEscola: {{NOME_ESCOLA}}\nAno Lectivo: {{ANO_LECTIVO}}\n\nAluno(a): {{NOME_COMPLETO}}\nData de Nascimento: {{DATA_NASCIMENTO}}\nEncarregado(a): {{NOME_PAI}} / {{NOME_MAE}}\n\nClasse reconfirmada: X {{CLASSE}}\nTurma: {{TURMA}}\nData: {{DATA_ACTUAL}}\n\nObservações:\n________________________________\n________________________________\n________________________________' }];
        const existingIds = new Set(list.map(t => t.id));
        const deletedSeedIds = new Set(deletedSeeds ?? []);

        // Auto-remove obsolete mapa templates that were previously seeded but are no longer supported.
        // The kept template is "Mapa de Aproveitamento — Por Curso e Classe (10ª–13ª)".
        const OBSOLETE_SEED_IDS = [
          'tpl_seed_mapa_aproveitamento_final_v1',
          'tpl_seed_mapa_turma_detalhado_v1',
          'tpl_seed_mapa_aproveitamento_v2',
          'tpl_seed_mapa_oficial_med_v1',
          'tpl_seed_mapa_frequencias_v1',
          'tpl_seed_mapa_por_curso_classe_v1',
          'tpl_seed_ficha_individual_v1',
          'tpl_seed_ficha_individual_v2',
          'tpl_seed_ficha_individual_v3',
        ];
        for (const obsoleteId of OBSOLETE_SEED_IDS) {
          if (existingIds.has(obsoleteId)) {
            try {
              await api.delete(`/api/doc-templates/${obsoleteId}`);
              list = list.filter(t => t.id !== obsoleteId);
              existingIds.delete(obsoleteId);
              deletedSeedIds.add(obsoleteId);
            } catch {}
          }
        }

        const toInsert = seeds.filter(s => !existingIds.has(s.id) && !deletedSeedIds.has(s.id));
        for (const seed of toInsert) {
          try {
            const saved = await api.post<DocTemplate>('/api/doc-templates', seed);
            list = [saved, ...list];
          } catch {}
        }

        setTemplates(list);
        setIsLoading(false);
      } catch {
        setIsLoading(false);
      }
    })();
  }, []);

  function saveTemplates(list: DocTemplate[]) {
    setTemplates(list);
  }

  function openNew() {
    (async () => {
      const draft = await readEditorDraft(null);
      const draftContent = draft?.conteudo ?? '';
      setEditingTemplate(null);
      editingTemplateIdRef.current = null;
      setEditorNome(draft?.nome ?? 'Novo Documento');
      editorNomeRef.current = draft?.nome ?? 'Novo Documento';
      setEditorTipo(draft?.tipo ?? 'declaracao');
      editorTipoRef.current = draft?.tipo ?? 'declaracao';
      setEditorContent(draftContent);
      editorContentRef.current = draftContent;
      webEditorContentRef.current = draftContent;
      setEditorInsignia(draft?.insigniaBase64);
      editorInsigniaRef.current = draft?.insigniaBase64;
      setEditorMarcaAgua(draft?.marcaAguaBase64);
      editorMarcaAguaRef.current = draft?.marcaAguaBase64;
      setEditorCabecalhoNome(draft?.cabecalhoNome ?? '');
      editorCabecalhoNomeRef.current = draft?.cabecalhoNome ?? '';
      setEditorCabecalhoExtra(draft?.cabecalhoExtra ?? '');
      editorCabecalhoExtraRef.current = draft?.cabecalhoExtra ?? '';
      setEditorCabecalhoAlign(draft?.cabecalhoAlign ?? 'center');
      editorCabecalhoAlignRef.current = draft?.cabecalhoAlign ?? 'center';
      setShowVarsPanel(true);
      setShowAppearPanel(true);
      if (Platform.OS === 'web') {
        const html = plainTextToHtml(draftContent);
        quillSrcdocRef.current = buildQuillSrcdoc(html);
        setTinyInitContent(html);
        webEditorContentRef.current = html;
        editorContentRef.current = html;
        setEditorKey(k => k + 1);
      }
      setMode('editor');
      if (draft) showToast('Rascunho recuperado automaticamente.', 'info');
    })();
  }

  function handleTipoChange(newTipo: DocTipo) {
    const currentContent = Platform.OS === 'web' ? webEditorContentRef.current : editorContent;
    const defaultTpl = TIPO_DEFAULT_TEMPLATES[newTipo];
    updateEditorTipoState(newTipo);
    if (defaultTpl && !currentContent.trim()) {
      setEditorContent(defaultTpl);
      editorContentRef.current = defaultTpl;
      webEditorContentRef.current = defaultTpl;
      if (Platform.OS === 'web') {
        quillSrcdocRef.current = buildQuillSrcdoc(defaultTpl);
        setTinyInitContent(defaultTpl);
        setEditorKey(k => k + 1);
      }
      scheduleEditorDraftSave(defaultTpl);
    }
  }

  function openEdit(t: DocTemplate) {
    (async () => {
      const draft = await readEditorDraft(t.id);
      const content = draft?.conteudo ?? t.conteudo ?? '';
      setEditingTemplate(t);
      editingTemplateIdRef.current = t.id;
      setEditorNome(draft?.nome ?? t.nome);
      editorNomeRef.current = draft?.nome ?? t.nome;
      setEditorTipo(draft?.tipo ?? t.tipo);
      editorTipoRef.current = draft?.tipo ?? t.tipo;
      setEditorContent(content);
      editorContentRef.current = content;
      webEditorContentRef.current = content;
      setEditorInsignia(draft?.insigniaBase64 ?? t.insigniaBase64);
      editorInsigniaRef.current = draft?.insigniaBase64 ?? t.insigniaBase64;
      setEditorMarcaAgua(draft?.marcaAguaBase64 ?? t.marcaAguaBase64);
      editorMarcaAguaRef.current = draft?.marcaAguaBase64 ?? t.marcaAguaBase64;
      setEditorCabecalhoNome(draft?.cabecalhoNome ?? t.cabecalhoNome ?? '');
      editorCabecalhoNomeRef.current = draft?.cabecalhoNome ?? t.cabecalhoNome ?? '';
      setEditorCabecalhoExtra(draft?.cabecalhoExtra ?? t.cabecalhoExtra ?? '');
      editorCabecalhoExtraRef.current = draft?.cabecalhoExtra ?? t.cabecalhoExtra ?? '';
      setEditorCabecalhoAlign(draft?.cabecalhoAlign ?? t.cabecalhoAlign ?? 'center');
      editorCabecalhoAlignRef.current = draft?.cabecalhoAlign ?? t.cabecalhoAlign ?? 'center';
      setShowVarsPanel(true);
      setShowAppearPanel(true);
      if (Platform.OS === 'web') {
        const html = plainTextToHtml(content);
        quillSrcdocRef.current = buildQuillSrcdoc(html);
        setTinyInitContent(html);
        webEditorContentRef.current = html;
        editorContentRef.current = html;
        setEditorKey(k => k + 1);
      }
      setMode('editor');
      if (draft) showToast('Rascunho recuperado automaticamente.', 'info');
    })();
  }

  async function reporOriginal() {
    if (!editingTemplate) return;
    const confirmed = await new Promise<boolean>(resolve => {
      webAlert(
        'Repor Template Original',
        'As alterações actuais serão substituídas pelo template base.\n\nEsta acção não guarda automaticamente — ainda terá de clicar em "Guardar".',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Repor Original', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });
    if (!confirmed) return;
    try {
      const res = await api.get<{ conteudo: string }>(`/api/doc-templates/${editingTemplate.id}/conteudo-original`);
      const html = plainTextToHtml(res.conteudo);
      setEditorContent(res.conteudo);
      editorContentRef.current = html;
      webEditorContentRef.current = html;
      if (Platform.OS === 'web') {
        setTinyInitContent(html);
        setEditorKey(k => k + 1);
      }
      showToast('Conteúdo original reposto. Clique em "Guardar" para confirmar.', 'info');
    } catch {
      showToast('Este modelo não tem conteúdo original disponível (foi criado manualmente).', 'error');
    }
  }

  async function saveTemplate() {
    if (!editorNome.trim()) return;
    // On web, always read live content directly from TinyMCE (getContent) to capture
    // any pending changes that onEditorChange may not have flushed yet.
    const contentToSave = Platform.OS === 'web' ? getCurrentEditorHtml() : editorContent;
    setIsSaving(true);
    try {
      if (editingTemplate) {
        const saved = await api.put<DocTemplate>(`/api/doc-templates/${editingTemplate.id}`, {
          nome: editorNome.trim(), tipo: editorTipo, conteudo: contentToSave,
          insigniaBase64: editorInsignia ?? null, marcaAguaBase64: editorMarcaAgua ?? null,
          cabecalhoNome: editorCabecalhoNome || null,
          cabecalhoExtra: editorCabecalhoExtra || null,
          cabecalhoAlign: editorCabecalhoAlign || 'center',
        });
        saveTemplates(templates.map(t => t.id === editingTemplate.id ? saved : t));
        await clearEditorDraft(editingTemplate.id);
      } else {
        const saved = await api.post<DocTemplate>('/api/doc-templates', {
          nome: editorNome.trim(), tipo: editorTipo, conteudo: contentToSave,
          insigniaBase64: editorInsignia ?? null, marcaAguaBase64: editorMarcaAgua ?? null,
          cabecalhoNome: editorCabecalhoNome || null,
          cabecalhoExtra: editorCabecalhoExtra || null,
          cabecalhoAlign: editorCabecalhoAlign || 'center',
        });
        saveTemplates([saved, ...templates]);
        await clearEditorDraft(null);
      }
      setMode('list');
      showToast(editingTemplate ? 'Modelo actualizado com sucesso.' : 'Novo modelo criado com sucesso.');
    } catch (e) {
      showToast('Não foi possível guardar o modelo. Tente novamente.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Image picker (web: file input; native: expo-image-picker) ──────────────
  function pickImageWeb(onPick: (base64: string) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        onPick(result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function pickImageNative(onPick: (base64: string) => void) {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        onPick(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch {}
  }

  function pickImage(onPick: (base64: string) => void) {
    if (Platform.OS === 'web') {
      pickImageWeb(onPick);
    } else {
      pickImageNative(onPick);
    }
  }

  function deleteTemplate(id: string) {
    if (!canDelete) {
      showToast('Acesso restrito: apenas CEO, PCA, Administrador ou Director podem eliminar modelos.', 'error');
      return;
    }
    const template = templates.find(t => t.id === id);
    webAlert(
      'Mover para o Lixo',
      `O modelo "${template?.nome ?? ''}" será movido para o lixo. Pode restaurá-lo a qualquer momento.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Mover para Lixo',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/doc-templates/${id}`);
              saveTemplates(templates.filter(t => t.id !== id));
              if (template) {
                setDeletedTemplates(prev => [{ ...template, eliminadoEm: new Date().toISOString() }, ...prev]);
              }
              showToast(`Modelo "${template?.nome ?? ''}" movido para o lixo.`, 'info');
            } catch {
              showToast('Não foi possível mover o modelo para o lixo.', 'error');
            }
          },
        },
      ]
    );
  }

  async function fetchDeletedTemplates() {
    setLoadingDeleted(true);
    try {
      const data = await api.get('/api/doc-templates/eliminados') as DocTemplate[];
      setDeletedTemplates(data);
    } catch {
      showToast('Erro ao carregar o lixo.', 'error');
    } finally {
      setLoadingDeleted(false);
    }
  }

  function restaurarTemplate(id: string) {
    const t = deletedTemplates.find(x => x.id === id);
    webAlert(
      'Restaurar Modelo',
      `O modelo "${t?.nome ?? ''}" será restaurado e voltará a ficar disponível.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'default',
          onPress: async () => {
            try {
              const restored = await api.patch(`/api/doc-templates/${id}/restaurar`, {}) as DocTemplate;
              setDeletedTemplates(prev => prev.filter(x => x.id !== id));
              saveTemplates([restored, ...templates]);
              showToast(`Modelo "${t?.nome ?? ''}" restaurado com sucesso.`, 'success');
            } catch {
              showToast('Não foi possível restaurar o modelo.', 'error');
            }
          },
        },
      ]
    );
  }

  function eliminarPermanente(id: string) {
    const t = deletedTemplates.find(x => x.id === id);
    webAlert(
      'Eliminar Permanentemente',
      `O modelo "${t?.nome ?? ''}" será eliminado de forma permanente e não poderá ser recuperado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Sempre',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/doc-templates/${id}/permanente`);
              setDeletedTemplates(prev => prev.filter(x => x.id !== id));
              showToast(`Modelo "${t?.nome ?? ''}" eliminado permanentemente.`, 'info');
            } catch {
              showToast('Não foi possível eliminar o modelo.', 'error');
            }
          },
        },
      ]
    );
  }

  function esvaziarLixo() {
    if (deletedTemplates.length === 0) return;
    webAlert(
      'Esvaziar Lixo',
      `Todos os ${deletedTemplates.length} modelo${deletedTemplates.length !== 1 ? 's' : ''} no lixo serão eliminados permanentemente. Esta acção é irreversível.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Esvaziar Lixo',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/api/doc-templates/esvaziar-lixo');
              setDeletedTemplates([]);
              showToast('Lixo esvaziado com sucesso.', 'info');
            } catch {
              showToast('Não foi possível esvaziar o lixo.', 'error');
            }
          },
        },
      ]
    );
  }

  async function toggleDisponivelAluno(id: string) {
    if (!canManageLocks) {
      showToast('Acesso restrito: apenas PCA, CEO ou Administrador podem alterar a disponibilidade dos modelos.', 'error');
      return;
    }
    const template = templates.find(t => t.id === id);
    if (!template) return;
    const willPublish = !template.disponivelAluno;
    webAlert(
      willPublish ? 'Disponibilizar para alunos' : 'Retirar dos alunos',
      willPublish
        ? `O modelo "${template.nome}" passará a ser solicitável directamente pelo perfil do aluno. Deseja continuar?`
        : `O modelo "${template.nome}" deixará de aparecer no perfil do aluno e só poderá ser emitido pela secretaria. Deseja continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: willPublish ? 'Disponibilizar' : 'Retirar',
          style: willPublish ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await api.patch(`/api/doc-templates/${id}/disponivel-aluno`, { disponivelAluno: willPublish });
              saveTemplates(templates.map(t => t.id === id ? { ...t, disponivelAluno: willPublish } : t));
              showToast(
                willPublish
                  ? `Modelo "${template.nome}" agora disponível para os alunos.`
                  : `Modelo "${template.nome}" foi retirado do perfil dos alunos.`,
                willPublish ? 'success' : 'info'
              );
            } catch (e) {
              showToast('Erro ao actualizar a disponibilidade do modelo. Tente novamente.', 'error');
            }
          },
        },
      ]
    );
  }

  async function toggleBloqueio(id: string) {
    if (!canManageLocks) {
      showToast('Acesso restrito: apenas PCA, CEO ou Administrador podem bloquear modelos.', 'error');
      return;
    }
    const template = templates.find(t => t.id === id);
    if (!template) return;
    const isBlocking = !template.bloqueado;
    webAlert(
      isBlocking ? 'Bloquear Modelo' : 'Desbloquear Modelo',
      isBlocking
        ? `O modelo "${template.nome}" ficará indisponível para emissão. Deseja continuar?`
        : `O modelo "${template.nome}" ficará disponível para todos os utilizadores autorizados. Deseja continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isBlocking ? 'Bloquear' : 'Desbloquear',
          style: isBlocking ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const novoBloqueado = !template.bloqueado;
              await api.patch(`/api/doc-templates/${id}/bloqueado`, { bloqueado: novoBloqueado });
              saveTemplates(templates.map(t => t.id === id ? { ...t, bloqueado: novoBloqueado } : t));
              showToast(
                novoBloqueado
                  ? `Modelo "${template.nome}" bloqueado com sucesso.`
                  : `Modelo "${template.nome}" desbloqueado com sucesso.`,
                novoBloqueado ? 'info' : 'success'
              );
            } catch (e) {
              showToast('Erro ao actualizar o estado do modelo. Tente novamente.', 'error');
            }
          },
        },
      ]
    );
  }

  function previewTemplate(template: DocTemplate, previewContent?: string) {
    if (Platform.OS !== 'web') return;
    const win = window.open('', '_blank');
    if (!win) return;

    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

    // Build content: use provided previewContent (from editor) or replace vars with examples
    let conteudo = previewContent ?? template.conteudo;
    const cfgAny = config as any;
    const municipioCfg = cfgAny?.municipio || cfgAny?.municipioEscola || 'Luanda';
    const provinciaCfg = cfgAny?.provincia || cfgAny?.provinciaEscola || 'Luanda';
    const nivelEnsinoCfg = cfgAny?.nivelEnsino || 'I Ciclo do Ensino Secundário Geral';
    const anoLetivoCfg = cfgAny?.anoLetivo || `${now.getFullYear() - 1}/${String(now.getFullYear()).slice(-2)}`;
    const nomeProfessorCfg = (user?.role === 'professor' ? `${user?.nome || ''} ${(user as any)?.apelido || ''}`.trim() : '') || '____________________________';
    const exampleMap = {
      ...VARIABLE_EXAMPLE_MAP,
      ...variableExampleMap,
      '{{DATA_ACTUAL}}': dataActual,
      '{{DATA_EMISSAO}}': dataActual,
      '{{MES_ACTUAL}}': MESES[now.getMonth()],
      '{{ANO_ACTUAL}}': String(now.getFullYear()),
      '{{NOME_ESCOLA}}': config.nomeEscola || 'Escola Secundária N.º 1',
      '{{NOME_DIRECTOR}}': directorGeral,
      '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
      '{{NOME_DIRECTOR_PEDAGOGICO}}': directorPedagogico,
      '{{NOME_DIRECTOR_PROVINCIAL}}': directorProvincialEducacao,
      '{{MUNICIPIO}}': municipioCfg,
      '{{MUNICIPIO_ESCOLA}}': municipioCfg,
      '{{PROVINCIA}}': provinciaCfg,
      '{{NIVEL_ENSINO}}': nivelEnsinoCfg,
      '{{ANO_LECTIVO}}': anoLetivoCfg,
      '{{DISCIPLINA}}': 'Matemática',
      '{{CLASSE}}': '10',
      '{{TURMA}}': 'A',
      '{{TURNO}}': cfgAny?.turno || 'Manhã',
      '{{NOME_PROFESSOR}}': nomeProfessorCfg,
      '{{NOME_PROFESSOR_DIRECTOR}}': nomeProfessorCfg,
      '{{SALA}}': '___',
      '{{PAUTA_NUMERO}}': '001',
    };
    Object.entries(exampleMap).forEach(([k, v]) => {
      conteudo = conteudo.split(k).join(v);
    });

    // Substituir o brasão de Angola pela insígnia carregada no template (se existir)
    const insigniaSrc = (template as any).insigniaBase64 || editorInsigniaRef.current;
    if (insigniaSrc) {
      conteudo = conteudo
        .split('src="/angola-brasao.png"').join(`src="${insigniaSrc}"`)
        .split("src='/angola-brasao.png'").join(`src='${insigniaSrc}'`)
        .split(`src="${window.location.origin}/angola-brasao.png"`).join(`src="${insigniaSrc}"`)
        .split(`src='${window.location.origin}/angola-brasao.png'`).join(`src='${insigniaSrc}'`);
    }

    const watermarkHtml = template.marcaAguaBase64
      ? `<img src="${template.marcaAguaBase64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;opacity:0.05;pointer-events:none;z-index:0;" />`
      : '';

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Pré-visualização — ${template.nome}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; margin: 60px; font-size: 14px; line-height: 1.8; color: #000; position: relative; }
    .preview-banner { position: fixed; top: 0; left: 0; right: 0; background: #f59e0b; color: #000; text-align: center; padding: 6px 0; font-family: sans-serif; font-size: 12px; font-weight: bold; letter-spacing: 1px; z-index: 999; }
    .content { position: relative; z-index: 1; margin-top: 30px; }
    pre { white-space: pre-wrap; font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.9; text-align: justify; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: bold; cursor: pointer; font-family: sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999; }
    .print-btn:hover { background: #1e40af; }
    @media print {
      .preview-banner, .print-btn { display: none !important; }
      body { margin: 30px 50px; }
      .content { margin-top: 0; }
    }
  </style>
</head>
<body>
  <div class="preview-banner">⚠ PRÉ-VISUALIZAÇÃO — Dados fictícios para demonstração</div>
  ${watermarkHtml}
  <div class="content">
    ${isHtmlContent(conteudo) ? `<div style="line-height:1.9;font-family:'Times New Roman',serif;font-size:14px;">${conteudo}</div>` : `<pre>${conteudo}</pre>`}
  </div>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
</body>
</html>`);
    win.document.close();
  }

  function openEmit(t: DocTemplate) {
    setEmitTemplate(t);
    setEmitAlunoId('');
    setEmitPreview('');
    setEmitAnoLetivo('');
    setEmitMiniPautaTrimestre(0);
    // Pré-seleccionar o ano em contexto (histórico ou activo)
    setEmitMiniPautaAnoLetivo(anoContexto || '');
    setEmitTurmaId('');
    setEmitDisciplina('');
    setEmitExtratoDataInicio('');
    setEmitExtratoDataFim('');
    setMode('emit');
  }

  // Helper: checks if this template uses turma-level emit (pauta types)
  function isPautaType(t: DocTemplate | null) {
    return t?.tipo === 'pauta' || t?.tipo === 'mini_pauta';
  }
  function isPautaFinalType(t: DocTemplate | null) {
    return t?.tipo === 'pauta_final';
  }
  function isMiniPautaDisciplinaType(t: DocTemplate | null) {
    return t?.tipo === 'pauta_disciplina';
  }
  function isMapaType(t: DocTemplate | null) {
    return t?.tipo === 'mapa_aproveitamento' || t?.tipo === 'mapa_frequencias';
  }
  function isMapaPorCursoType(t: DocTemplate | null) {
    return t?.tipo === 'mapa_aproveitamento' && t?.classeAlvo === 'MAPA_POR_CURSO_INDIVIDUAL';
  }
  function isMapaOficialMEDType(t: DocTemplate | null) {
    return t?.tipo === 'mapa_aproveitamento' && (
      t?.classeAlvo === 'MAPA_OFICIAL_MED_GERAL' ||
      t?.classeAlvo === 'MAPA_PRIMARIO_TABELA' ||
      t?.classeAlvo === 'MAPA_I_CICLO_TABELA'
    );
  }
  function isListaTurmaType(t: DocTemplate | null) {
    return t?.tipo === 'lista_turma';
  }
  function isCertificadoPrimarioType(t: DocTemplate | null) {
    return t?.tipo === 'certificado_primario';
  }
  function isExtratoPropinaType(t: DocTemplate | null) {
    return t?.tipo === 'extrato_propina';
  }

  function isComprovatvoMatriculaType(t: DocTemplate | null) {
    return t?.tipo === 'comprovativo_matricula';
  }

  function isHistoricoAcademicoType(t: DocTemplate | null) {
    return t?.tipo === 'historico_academico';
  }

  // ─── Certificado do Ensino Primário HTML Builder ───────────────────────────

  function buildCertificadoPrimarioHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';

    const now = new Date();
    const MESES_LOCAL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    function numPorExtenso(n: number): string {
      const map: Record<number, string> = {
        1: 'Um Valor', 2: 'Dois Valores', 3: 'Três Valores', 4: 'Quatro Valores',
        5: 'Cinco Valores', 6: 'Seis Valores', 7: 'Sete Valores', 8: 'Oito Valores',
        9: 'Nove Valores', 10: 'Dez Valores',
      };
      return map[n] || `${n} Valores`;
    }

    const bDate = aluno.dataNascimento ? new Date(aluno.dataNascimento + 'T12:00:00') : null;
    const bDay = bDate ? String(bDate.getDate()).padStart(2, '0') : '__';
    const bMonth = bDate ? MESES_LOCAL[bDate.getMonth()] : '___________';
    const bYear = bDate ? String(bDate.getFullYear()) : '____';
    const filhoA = aluno.genero === 'F' ? 'filha' : 'filho';

    const escola = config.nomeEscola || '___________________________';
    const director = directorGeral;
    const cidade = aluno.provincia || 'Luanda';
    const dataActual = `${now.getDate()} de ${MESES_LOCAL[now.getMonth()]} de ${now.getFullYear()}`;

    const todasNotasAluno = notas.filter(n => n.alunoId === alunoId);

    function getClasseForTurma(tId: string): string {
      return turmas.find(t => t.id === tId)?.classe || '';
    }

    function getGradePorClasse(disciplinaNome: string, classe: string): number | null {
      const matchNome = disciplinaNome.trim().toLowerCase();
      const notasClasse = todasNotasAluno.filter(n => {
        const tClasse = getClasseForTurma(n.turmaId);
        return tClasse === classe && n.disciplina.trim().toLowerCase() === matchNome;
      });
      if (notasClasse.length === 0) return null;
      const withNf = notasClasse.find(n => n.nf > 0);
      if (withNf) return Math.round(withNf.nf);
      const mts = notasClasse.map(n => n.mt1).filter(v => v > 0);
      if (mts.length === 0) return null;
      return Math.round(mts.reduce((a, b) => a + b, 0) / mts.length);
    }

    const cicloClasses = ['2ª Classe', '4ª Classe', '6ª Classe'];

    const DISCIPLINAS_PRIMARIO: { nome: string; ciclos: number[]; bold: boolean }[] = [
      { nome: 'Língua Portuguesa',          ciclos: [1, 2, 3], bold: false },
      { nome: 'Matemática',                 ciclos: [1, 2, 3], bold: false },
      { nome: 'Estudo do Meio',             ciclos: [1, 2],    bold: false },
      { nome: 'Ciências Naturais',          ciclos: [3],       bold: false },
      { nome: 'História',                   ciclos: [3],       bold: true  },
      { nome: 'Geografia',                  ciclos: [3],       bold: false },
      { nome: 'Educação Moral e Cívica',    ciclos: [3],       bold: true  },
      { nome: 'Educação Manual e Plástica', ciclos: [1, 2, 3], bold: false },
      { nome: 'Educação Musical',           ciclos: [1, 2, 3], bold: false },
      { nome: 'Educação Física',            ciclos: [1, 2, 3], bold: false },
      { nome: 'Língua de Origem Africana',  ciclos: [],        bold: false },
    ];

    const tableRows = DISCIPLINAS_PRIMARIO.map(disc => {
      const grades: (number | null)[] = [1, 2, 3].map(ciclo => {
        if (!disc.ciclos.includes(ciclo)) return null;
        return getGradePorClasse(disc.nome, cicloClasses[ciclo - 1]);
      });
      const validGrades = grades.filter((g): g is number => g !== null);
      const mediaFinal = validGrades.length > 0
        ? Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
        : null;

      const cells = grades.map((g, idx) => {
        if (!disc.ciclos.includes(idx + 1)) {
          return `<td style="background:#c0c0c0;"></td>`;
        }
        return `<td style="text-align:center;">${g !== null ? g : ''}</td>`;
      }).join('');

      const fw = disc.bold ? 'font-weight:bold;' : '';
      return `<tr>
        <td style="${fw}padding:2px 4px;">${disc.nome}</td>
        ${cells}
        <td style="text-align:center;font-weight:bold;">${mediaFinal !== null ? mediaFinal : ''}</td>
        <td style="text-align:center;">${mediaFinal !== null ? numPorExtenso(mediaFinal) : ''}</td>
      </tr>`;
    }).join('');

    const allDiscMedias: number[] = [];
    for (const disc of DISCIPLINAS_PRIMARIO) {
      const validForDisc = [1, 2, 3]
        .filter(c => disc.ciclos.includes(c))
        .map(c => getGradePorClasse(disc.nome, cicloClasses[c - 1]))
        .filter((g): g is number => g !== null);
      if (validForDisc.length > 0) {
        allDiscMedias.push(Math.round(validForDisc.reduce((a, b) => a + b, 0) / validForDisc.length));
      }
    }
    const mediaGeral = allDiscMedias.length > 0
      ? Math.round(allDiscMedias.reduce((a, b) => a + b, 0) / allDiscMedias.length)
      : null;

    const notasTurma = turmas.find(t => t.id === aluno.turmaId);
    const anoLetivoConclusao = todasNotasAluno.length > 0
      ? [...todasNotasAluno].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo))[0].anoLetivo
      : (notasTurma?.anoLetivo || String(now.getFullYear()));

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <title>Certificado Ensino Primário — ${aluno.nome} ${aluno.apelido}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; background: #fff; padding: 20mm 20mm 15mm 25mm; }
    .visto-block { float: left; width: 200px; font-size: 10pt; margin-right: 20px; }
    .visto-block p { margin: 2px 0; }
    .visto-line { border-bottom: 1px solid #000; width: 180px; margin: 18px 0 4px; }
    .header-center { text-align: center; font-size: 12pt; line-height: 1.6; }
    .header-center .nivel { font-size: 12pt; margin-top: 6px; }
    .header-center .titulo { font-size: 18pt; font-weight: bold; margin: 10px 0 16px; letter-spacing: 2px; text-transform: uppercase; }
    .body-text { text-align: justify; font-size: 11pt; line-height: 1.7; margin-bottom: 14px; clear: both; }
    .underline { font-style: italic; }
    .bold-caps { font-weight: bold; text-transform: uppercase; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
    table th, table td { border: 1px solid #000; padding: 3px 5px; }
    table th { background: #f2f2f2; font-weight: bold; text-align: center; font-size: 9.5pt; }
    .media-row td { font-weight: bold; background: #fffde7; }
    .legal-text { font-size: 11pt; text-align: justify; line-height: 1.6; margin: 14px 0; }
    .date-line { margin: 18px 0 10px; font-size: 11pt; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 40px; }
    .sig-block { text-align: center; min-width: 220px; }
    .sig-block .label { font-size: 11pt; margin-bottom: 30px; }
    .sig-line { border-top: 1px solid #000; width: 200px; margin: 0 auto 4px; }
    .sig-name { font-size: 10pt; }
    .clearfix::after { content: ""; display: table; clear: both; }
    @media print { @page { size: A4 portrait; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>

  <div class="clearfix">
    <div class="visto-block">
      <p>Visto do(a)</p>
      <p>Director(a)/Secretário(a) Municipal</p>
      <div class="visto-line"></div>
      <p>___________________________</p>
    </div>
    <div class="header-center">
      <img src="${window.location.origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p><strong>REPÚBLICA DE ANGOLA</strong></p>
      <p><strong>MINISTÉRIO DA EDUCAÇÃO</strong></p>
      <p class="nivel">ENSINO PRIMÁRIO</p>
      <p class="titulo">Certificado</p>
    </div>
  </div>

  <div class="body-text">
    <p>a)&nbsp;&nbsp;<span class="underline">__________________________</span>, Director(a) da Escola Primária nº&nbsp;<span class="underline">_______</span>,&nbsp;Ex:&nbsp;<span class="underline">_______</span>,&nbsp;nome
    <span class="underline">${escola}</span>, criada sob Decreto Executivo nº&nbsp;<span class="underline">_____</span>&nbsp;/&nbsp;<span class="underline">____</span>&nbsp;de&nbsp;<span class="underline">_____________</span>,
    certifica que</p>
  </div>

  <div class="body-text">
    <span class="underline" style="color:#8B0000;font-weight:bold;">${aluno.nome} ${aluno.apelido}</span>,
    ${filhoA}(a) de&nbsp;<span class="underline">___________________________________</span>&nbsp;e de&nbsp;<span class="underline">___________________________________</span>,
    nascido(a) aos&nbsp;<span class="underline">${bDay} de ${bMonth} de ${bYear}</span>,
    natural de&nbsp;<span class="underline">${aluno.municipio}</span>,
    Município de&nbsp;<span class="underline">${aluno.municipio}</span>,
    Província de&nbsp;<span class="underline">${aluno.provincia}</span>,
    portador(a) do B.I./Passaporte nº&nbsp;<span class="underline">__________________</span>,
    passado(a) pela Conservatória do registo civil de&nbsp;<span class="underline">_____________</span>
    aos&nbsp;<span class="underline">_____________________</span>,
    concluiu no ano lectivo&nbsp;<span class="underline"><strong>${anoLetivoConclusao}</strong></span>&nbsp;
    o <span class="bold-caps">Ensino Primário,</span>
    conforme o disposto na alínea b) do artigo 109.º. da LBSEE 17/16, de 7 de Outubro,
    com a Média Final de&nbsp;<span class="underline"><strong>${mediaGeral !== null ? mediaGeral : '_____'}</strong></span>&nbsp;valores
    obtida nas seguintes classificações por ciclos de aprendizagem:
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" style="text-align:left;min-width:180px;">Disciplina</th>
        <th colspan="1">I Ciclo</th>
        <th colspan="1">II Ciclo</th>
        <th colspan="1">III Ciclo</th>
        <th rowspan="2">Média Final</th>
        <th rowspan="2">Média por Extenso</th>
      </tr>
      <tr>
        <th>2ª. Classe</th>
        <th>4ª. Classe</th>
        <th>6ª. Classe</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="legal-text">
    Para efeitos legais lhe é passado o presente <strong>CERTIFICADO</strong>, que consta no livro de registo nº&nbsp;___________,
    folha&nbsp;___________, assinado por mim e autenticado com carimbo a óleo/selo branco em uso neste estabelecimento de ensino.
  </div>

  <div class="date-line">${cidade}, aos ${dataActual}</div>

  ${buildSigRow(directorGeral, directorPedagogico, directorProvincialEducacao)}

</body>
</html>`;
  }

  // ─── Pauta Final HTML Builder ──────────────────────────────────────────────

  function buildPautaFinalHtml(turmaId: string, paperSize: 'A3' | 'A4' = 'A4', insigniaBase64?: string, marcaAguaBase64?: string, pautaNumero?: string): string {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) return '';

    const now = new Date();
    const notasDaTurma = notas.filter(n => n.turmaId === turmaId);

    // Apenas alunos activos COM pelo menos uma nota lançada nesta turma
    const alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .filter(a => notasDaTurma.some(n => n.alunoId === a.id && ((n.mt1 ?? 0) > 0 || (n.mac ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0)))
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));

    // Disciplinas: usa SEMPRE a lista real atribuída à turma (turma_disciplinas/curso_disciplinas via
    // /api/turmas/:id/disciplinas), não apenas as que já têm notas lançadas — assim a Pauta Final mostra
    // TODAS as disciplinas da turma (com células em branco nas que ainda faltam), nunca disciplinas em falta.
    const disciplinasAtribuidas = turmaId === emitTurmaId ? disciplinasDaTurmaAPI : [];
    let disciplinas: string[];
    if (disciplinasAtribuidas.length > 0) {
      disciplinas = [...disciplinasAtribuidas].sort((a, b) => a.localeCompare(b));
    } else {
      // Fallback (endpoint indisponível ou turma sem atribuições registadas): deriva das notas existentes
      const disciplinasSet: string[] = [];
      for (const n of notasDaTurma) {
        if (!disciplinasSet.includes(n.disciplina)) disciplinasSet.push(n.disciplina);
      }
      disciplinas = disciplinasSet.sort((a, b) => a.localeCompare(b));
    }

    // ── Decreto Executivo nº 04/2026: MFD com Exame Nacional (NEN) para disciplinas nucleares ──
    const classeNum = classeParaNum(turma.classe);
    const examClasse = isClasseExame(turma.classe);
    const usarDecreto = !!(config as any)?.usarFormulasDecreto;
    const decretoWeights = {
      percMT3Exame9a: (config as any)?.percMT3Exame9aDecreto,
      percMT3Exame12a: (config as any)?.percMT3Exame12aDecreto,
    };
    const nuclearMap: Record<string, boolean> = {};
    disciplinasCatalogo.forEach((d: any) => { if (d?.nome) nuclearMap[d.nome] = !!d.nuclear; });
    const discShowsNen = (disc: string) => examClasse && !!nuclearMap[disc];

    // ── Regras de Transição (Art. 23º) aplicáveis a esta classe ──────────────
    const isICicloRestricao = isClasseICicloRestricao(turma.classe || '');
    const isIICicloRestricao = isClasseIICicloRestricao(turma.classe || '') && !examClasse;
    const notaMin = config?.notaMinimaAprovacao ?? 10;
    const notaMinAbs = 6;
    const maxNegativas = examClasse
      ? 0
      : isICicloRestricao
        ? Number((config as any)?.maxNegativosICiclo ?? 2)
        : Number((config as any)?.maxNegativosIICiclo ?? 3);
    const restricaoArt23Activa = examClasse
      ? false
      : isICicloRestricao
        ? !!(config as any)?.restricaoArt23ICiclo
        : isIICicloRestricao
          ? !!(config as any)?.restricaoArt23IICiclo
          : false;
    const disciplinasNuclearArt23: string[] = Array.isArray((config as any)?.disciplinasNuclearArt23)
      ? (config as any).disciplinasNuclearArt23
      : [];

    // Devolve MT1/MT2/MT3, NEN (quando aplicável) e MFD calculada segundo o Decreto 04/2026
    function getGrades(alunoId: string, disc: string) {
      const t1 = notasDaTurma.find(x => x.alunoId === alunoId && x.disciplina === disc && x.trimestre === 1);
      const t2 = notasDaTurma.find(x => x.alunoId === alunoId && x.disciplina === disc && x.trimestre === 2);
      const t3 = notasDaTurma.find(x => x.alunoId === alunoId && x.disciplina === disc && x.trimestre === 3);
      const mt1v = t1?.mt1 ?? 0, mt2v = t2?.mt1 ?? 0, mt3v = t3?.mt1 ?? 0;
      const nuclear = !!nuclearMap[disc];
      const showNen = discShowsNen(disc);
      let nenV = 0;
      let mfdV: number | null = null;
      if (usarDecreto && classeNum > 0) {
        nenV = examClasse ? calcNEN(t3?.ex1 ?? 0, t3?.ex2 ?? 0, classeNum) : 0;
        if (mt1v > 0 || mt2v > 0 || mt3v > 0) {
          mfdV = calcMFD_auto(mt1v, mt2v, mt3v, nenV, nuclear, classeNum, decretoWeights);
        }
      } else {
        // Sem fórmulas do Decreto activas: usa nf guardado ou média simples MT1/MT2/MT3
        const withNf = [t1, t2, t3].find(x => x && x.nf);
        if (withNf) {
          mfdV = withNf!.nf;
        } else {
          const mts = [mt1v, mt2v, mt3v].filter(v => v > 0);
          mfdV = mts.length > 0 ? mts.reduce((a, b) => a + b, 0) / mts.length : null;
        }
      }
      return {
        mt1: mt1v > 0 ? String(Math.round(mt1v)) : '',
        mt2: mt2v > 0 ? String(Math.round(mt2v)) : '',
        mt3: mt3v > 0 ? String(Math.round(mt3v)) : '',
        nen: showNen && nenV > 0 ? String(Math.round(nenV)) : '',
        mfd: mfdV !== null && mfdV > 0 ? String(Math.round(mfdV)) : '',
        mfdRaw: mfdV,
        showNen,
      };
    }

    const cicloMap: Record<string, string> = {
      'Primário': 'ENSINO PRIMÁRIO',
      'I Ciclo': 'Iº CICLO',
      'II Ciclo': 'IIº CICLO',
    };
    const ciclo = cicloMap[turma.nivel] || (turma.nivel || '').toUpperCase();
    const escola = config.nomeEscola || '___________________________';
    const brasaoSrc = insigniaBase64 || (config as any)?.logoUrl || '/angola-brasao.png';
    const municipioCfg = (config as any)?.municipio || '______________________';
    const provinciaCfg = (config as any)?.provincia || '______________________';
    const salaTurma = (turma as any).sala || '_____';
    const anoCorrente = now.getFullYear();
    const dataExtensa = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

    // II Ciclo onwards: include curso no cabeçalho
    const isIICicloOuSuperior = turma.nivel === 'II Ciclo' || turma.nivel === 'III Ciclo';
    const cursoDaTurma = (turma as any).cursoId
      ? cursos.find(c => c.id === (turma as any).cursoId)
      : null;
    const cursoNome = cursoDaTurma?.nome || '';
    const directorTurmaNome = (() => {
      if (!turma.professorId) return '___________________________';
      const prof = professores.find(p => p.id === turma.professorId);
      return prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : '___________________________';
    })();

    const colorNota = (raw: string) => {
      const v = parseFloat(raw);
      if (!raw || isNaN(v) || v <= 0) return '#000';
      return v >= notaMin ? '#155724' : '#cc0000';
    };

    // Build discipline header columns (dark green like Mini-Pauta); disciplinas nucleares
    // em classes de exame (6ª/9ª/12ª) ganham uma coluna extra NEN (Exame Nacional).
    const disciplinaHeaders = disciplinas
      .map(d => {
        const showNen = discShowsNen(d);
        return `<th colspan="${showNen ? 5 : 4}" class="hdr-disc">${d}${showNen ? ' <span style="font-size:6px;font-weight:normal;">(c/ EN)</span>' : ''}</th>`;
      })
      .join('');
    const subHeaders = disciplinas
      .map(d => {
        const showNen = discShowsNen(d);
        return `<th class="hdr-sub">MT1</th><th class="hdr-sub">MT2</th><th class="hdr-sub">MT3</th>`
          + (showNen ? `<th class="hdr-sub hdr-nen">NEN</th>` : '')
          + `<th class="hdr-mfd">MFD</th>`;
      })
      .join('');

    // Build student rows with alternating background and coloured grades
    let totalTransita = 0;
    let totalTransitaCondicao = 0;
    let totalNaoTransita = 0;
    let totalSemNota = 0;
    const todasMfds: number[] = [];
    const studentRows = alunosDaTurma.map((aluno, idx) => {
      const bg = idx % 2 === 0 ? '#e8f5e9' : '#ffffff';
      const disciplinasParaTransicao: { nome: string; mfd: number }[] = [];
      const gradeCells = disciplinas.map(disc => {
        const g = getGrades(aluno.id, disc);
        if (g.mfdRaw !== null && g.mfdRaw > 0) {
          disciplinasParaTransicao.push({ nome: disc, mfd: g.mfdRaw });
          todasMfds.push(g.mfdRaw);
        }
        return `<td style="color:${colorNota(g.mt1)};">${g.mt1}</td>`
             + `<td style="color:${colorNota(g.mt2)};">${g.mt2}</td>`
             + `<td style="color:${colorNota(g.mt3)};">${g.mt3}</td>`
             + (g.showNen ? `<td class="cell-nen" style="color:${colorNota(g.nen)};font-weight:bold;">${g.nen}</td>` : '')
             + `<td class="cell-mfd" style="color:${colorNota(g.mfd)};font-weight:bold;">${g.mfd}</td>`;
      }).join('');

      // Situação geral do aluno — Art. 23º (Decreto Exec. nº 3/20 e 04/2026)
      let obs = '';
      let obsColor = '#000';
      if (disciplinasParaTransicao.length > 0) {
        const resultado = calcularTransicaoAngola(
          disciplinasParaTransicao,
          notaMin,
          notaMinAbs,
          maxNegativas,
          { restricaoArt23Activa, disciplinasNuclearArt23 },
        );
        obs = resultado.situacao;
        obsColor = resultado.cor;
        if (resultado.situacao === 'TRANSITA') totalTransita++;
        else if (resultado.situacao === 'TRANSITA C/ CONDIÇÃO') totalTransitaCondicao++;
        else totalNaoTransita++;
      } else {
        totalSemNota++;
      }
      return `<tr style="background:${bg};">
        <td style="text-align:center;">${idx + 1}</td>
        <td style="text-align:center;font-weight:bold;">${(aluno as any).numeroMatricula || '—'}</td>
        <td style="text-align:left;padding-left:4px;white-space:nowrap;">${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}</td>
        ${gradeCells}
        <td style="font-weight:bold;color:${obsColor};font-size:6px;">${obs}</td>
      </tr>`;
    }).join('');

    // Estatísticas da turma
    const totalAlunos = alunosDaTurma.length;
    const totalAprovadosGeral = totalTransita + totalTransitaCondicao;
    const taxaAprov = totalAlunos > 0 ? ((totalAprovadosGeral / totalAlunos) * 100).toFixed(1) : '0.0';
    const taxaReprov = totalAlunos > 0 ? ((totalNaoTransita / totalAlunos) * 100).toFixed(1) : '0.0';
    const mediaGeral = todasMfds.length > 0
      ? (todasMfds.reduce((a, b) => a + b, 0) / todasMfds.length).toFixed(2)
      : '—';
    const statsHtml = `
  <div class="stats-box">
    <div class="stats-title">ESTATÍSTICAS DA TURMA</div>
    <div class="stats-grid">
      <div class="stat-item"><span class="stat-label">Total de Alunos:</span> <span class="stat-value">${totalAlunos}</span></div>
      <div class="stat-item"><span class="stat-label">Transita:</span> <span class="stat-value" style="color:#1b5e20;">${totalTransita}</span></div>
      <div class="stat-item"><span class="stat-label">Transita c/ Condição:</span> <span class="stat-value" style="color:#e65100;">${totalTransitaCondicao}</span></div>
      <div class="stat-item"><span class="stat-label">Não Transita:</span> <span class="stat-value" style="color:#b71c1c;">${totalNaoTransita}</span></div>
      <div class="stat-item"><span class="stat-label">Taxa de Aprovação:</span> <span class="stat-value" style="color:#155724;">${taxaAprov}%</span></div>
      <div class="stat-item"><span class="stat-label">Taxa de Reprovação:</span> <span class="stat-value" style="color:#cc0000;">${taxaReprov}%</span></div>
      ${totalSemNota > 0 ? `<div class="stat-item"><span class="stat-label">Sem Notas:</span> <span class="stat-value">${totalSemNota}</span></div>` : ''}
      <div class="stat-item"><span class="stat-label">Média Geral da Turma:</span> <span class="stat-value" style="color:${parseFloat(mediaGeral) >= notaMin ? '#155724' : '#cc0000'};">${mediaGeral}</span></div>
      <div class="stat-item"><span class="stat-label">Nota Mínima de Aprovação:</span> <span class="stat-value">${notaMin}</span></div>
    </div>
  </div>`;

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <title>Pauta Final — ${turma.classe} ${turma.nome} ${turma.anoLetivo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 7.5px; margin: 10px; color: #000; }
    .brasao-wrap { text-align: center; margin-bottom: 3px; }
    .brasao { width: 56px; height: auto; display: inline-block; }
    .hrow { width: 100%; padding: 1px 0; line-height: 1.4; }
    .hrow-rep { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 1px; }
    .hrow-min { font-size: 12px; font-weight: bold; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 2px; }
    .hrow-2 { font-size: 10px; font-weight: bold; text-align: center; margin-bottom: 2px; text-transform: uppercase; }
    .visto-block { position: absolute; top: 0; left: 0; font-size: 8px; border: 1px solid #000; padding: 4px 8px; min-width: 120px; text-align: center; line-height: 1.3; }
    .info-box { border: 1px solid #000; padding: 3px 5px; margin: 4px 0 4px; font-size: 8.5px; }
    .info-row-1, .info-row-2 { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 2px; }
    .info-row-2:last-child { margin-bottom: 0; }
    .main-table { border-collapse: collapse; width: 100%; font-size: 6.5px; }
    .main-table th, .main-table td { border: 1px solid #999; padding: 1px 2px; text-align: center; }
    .main-table th { background-color: #c6efce !important; color: #1a3a1a; font-weight: bold; white-space: nowrap; }
    .main-table th.hdr-disc { background-color: #1a6b3c !important; color: #fff !important; font-size: 8px; letter-spacing: 0.3px; }
    .main-table th.hdr-sub { background-color: #c6efce !important; color: #1a3a1a; }
    .main-table th.hdr-sub.hdr-nen { background-color: #90caf9 !important; color: #0d47a1; }
    .main-table th.hdr-mfd { background-color: #a8d5a2 !important; color: #1a3a1a; font-weight: bold; }
    .main-table td.cell-mfd { background-color: #d4edda !important; font-weight: bold; }
    .main-table td.cell-nen { background-color: #bbdefb !important; font-weight: bold; }
    .main-table .name-col { text-align: left; min-width: 110px; max-width: 140px; }
    .main-table .num-col { width: 18px; background-color: #c6efce !important; }
    .disc-section { font-size: 9px; font-weight: bold; text-align: center; margin: 3px 0 2px; text-transform: uppercase; letter-spacing: 1px; color: #1a3a1a; }
    .footer { display: flex; justify-content: space-around; margin-top: 20px; font-size: 8px; gap: 16px; }
    .sig { text-align: center; flex: 1; max-width: 260px; }
    .sig-line { border-top: 1px solid #000; padding-top: 3px; margin-top: 30px; }
    .stats-box { margin: 8px auto 0; border: 1.5px solid #1a6b3c; border-radius: 4px; padding: 5px 10px; background-color: #f3faf5 !important; font-size: 7.5px; max-width: 760px; }
    .stats-title { font-weight: bold; text-align: center; color: #1a3a1a; letter-spacing: 0.5px; margin-bottom: 4px; font-size: 8px; text-transform: uppercase; border-bottom: 1px solid #a8d5a2; padding-bottom: 2px; }
    .stats-grid { display: flex; flex-wrap: wrap; gap: 4px 22px; justify-content: center; }
    .stat-item { font-size: 7.5px; }
    .stat-label { font-weight: bold; color: #1a3a1a; }
    .stat-value { font-weight: bold; }
    @media print { @page { size: ${paperSize} landscape; margin: 0; } body { margin: 0; font-size: ${paperSize === 'A3' ? '7.5px' : '6.5px'}; } }
  </style>
</head>
<body>
  <div style="position:relative;">
    <div class="visto-block">
      <p><strong>VISTO</strong></p>
      <p>Data ___/___/______</p>
      <br/>
      <p>A Chefe de Repartição e Ensino</p>
      <br/>
      <p>_________________________</p>
    </div>
    <div class="brasao-wrap"><img src="${brasaoSrc}" class="brasao" alt="Insígnia da República de Angola" onerror="this.style.display='none'" /></div>
    <div class="hrow hrow-rep">REPÚBLICA DE ANGOLA</div>
    <div class="hrow hrow-min">MINISTÉRIO DA EDUCAÇÃO</div>
    <div class="hrow hrow-2">${examClasse ? `PAUTA FINAL/GERAL — CLASSE DE EXAME NACIONAL — ${turma.classe} ${turma.nome}` : `PAUTA FINAL/GERAL — ${turma.classe} ${turma.nome}`} — Ano Lectivo: ${turma.anoLetivo}</div>
  </div>

  <div class="info-box">
    <div class="info-row-1">
      <span><strong>ESCOLA:</strong> ${escola}</span>
      <span><strong>MUNICÍPIO DE:</strong> ${municipioCfg}</span>
      <span><strong>PROVÍNCIA DE:</strong> ${provinciaCfg}</span>
    </div>
    <div class="info-row-2">
      <span><strong>PAUTA N.º</strong> ${pautaNumero || '________'} / ${anoCorrente}</span>
      <span><strong>ANO LECTIVO:</strong> ${turma.anoLetivo}</span>
      <span><strong>CLASSE:</strong> ${turma.classe}</span>
      <span><strong>TURMA:</strong> ${turma.nome}</span>
      <span><strong>SALA:</strong> ${salaTurma}</span>
      <span><strong>TURNO:</strong> ${turma.turno}</span>
      ${isIICicloOuSuperior ? `<span><strong>CURSO:</strong> ${cursoNome || '______________________'}</span>` : ''}
    </div>
  </div>

  <div class="disc-section">DISCIPLINAS — ANO LECTIVO ${turma.anoLetivo}</div>

  <table class="main-table">
    <thead>
      <tr>
        <th class="num-col" rowspan="2">Nº</th>
        <th rowspan="2" style="width:50px;background-color:#c6efce !important;">Nº ALUNO</th>
        <th class="name-col" rowspan="2">NOME DO ALUNO</th>
        ${disciplinaHeaders}
        <th rowspan="2" style="width:60px;">SITUAÇÃO FINAL</th>
      </tr>
      <tr>
        ${subHeaders}
      </tr>
    </thead>
    <tbody>
      ${studentRows}
    </tbody>
  </table>

  ${statsHtml}

  <div style="text-align:center;margin-top:10px;font-size:8px;font-style:italic;color:#1a3a1a;">
    ${escola}, aos ${dataExtensa}.
  </div>

  <div class="footer">
    <div class="sig"><div class="sig-line">DIRECTOR(A) DE TURMA<br/><span style="font-weight:bold;">${directorTurmaNome}</span></div></div>
    <div class="sig"><div class="sig-line">O(A) SUB-DIRECTOR(A) PEDAGÓGICO<br/><span style="font-weight:bold;">${directorPedagogico}</span></div></div>
    <div class="sig"><div class="sig-line">O(A) DIRECTOR(A)<br/><span style="font-weight:bold;">${directorGeral}</span></div></div>
  </div>

  <div style="font-size:6.5px;margin-top:8px;color:#555;">
    Legenda: MT1/MT2/MT3 = Média Trimestral | MFD = Média Final da Disciplina
    ${examClasse ? '| NEN = Nota do Exame Nacional (incluída na MFD das disciplinas nucleares — Decreto Exec. nº 04/2026, Anexo III)' : ''}
    | Situação Final: <strong style="color:#1b5e20;">TRANSITA</strong> = sem negativas; <strong style="color:#e65100;">TRANSITA C/ CONDIÇÃO</strong> = negativas dentro do limite permitido (${maxNegativas}); <strong style="color:#b71c1c;">NÃO TRANSITA</strong> = nota abaixo de ${notaMinAbs} valores, mais de ${maxNegativas} negativas, ou restrição do Art. 23º aplicável — Decreto Exec. nº 3/20 e nº 04/2026.
  </div>
${marcaAguaBase64 ? `<img src="${marcaAguaBase64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:55%;opacity:0.05;pointer-events:none;z-index:0;" alt="" />` : ''}
</body>
</html>`;
  }

  // ─── Pauta Final Excel Builder ────────────────────────────────────────────
  // Versão estilizada (ExcelJS) — espelha o HTML/PDF: cores, estatísticas e assinaturas.

  async function buildPautaFinalExcel(turmaId: string, paperSize: 'A3' | 'A4' = 'A4') {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) return;

    const notasDaTurma = notas.filter(n => n.turmaId === turmaId);

    // Apenas alunos COM pelo menos uma nota lançada
    const alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .filter(a => notasDaTurma.some(n => n.alunoId === a.id && ((n.mt1 ?? 0) > 0 || (n.mac ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0)))
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));

    const disciplinasSet: string[] = [];
    for (const n of notasDaTurma) {
      if (!disciplinasSet.includes(n.disciplina)) disciplinasSet.push(n.disciplina);
    }
    const disciplinas = disciplinasSet.sort((a, b) => a.localeCompare(b));

    // ── Decreto Executivo nº 04/2026: MFD com Exame Nacional (NEN) para disciplinas nucleares ──
    const classeNum = classeParaNum(turma.classe);
    const examClasse = isClasseExame(turma.classe);
    const usarDecreto = !!(config as any)?.usarFormulasDecreto;
    const decretoWeights = {
      percMT3Exame9a: (config as any)?.percMT3Exame9aDecreto,
      percMT3Exame12a: (config as any)?.percMT3Exame12aDecreto,
    };
    const nuclearMap: Record<string, boolean> = {};
    disciplinasCatalogo.forEach((d: any) => { if (d?.nome) nuclearMap[d.nome] = !!d.nuclear; });
    const discShowsNen = (disc: string) => examClasse && !!nuclearMap[disc];

    // ── Regras de Transição (Art. 23º) aplicáveis a esta classe ──────────────
    const isICicloRestricaoXls = isClasseICicloRestricao(turma.classe || '');
    const isIICicloRestricaoXls = isClasseIICicloRestricao(turma.classe || '') && !examClasse;
    const notaMinAbsXls = 6;
    const maxNegativasXls = examClasse
      ? 0
      : isICicloRestricaoXls
        ? Number((config as any)?.maxNegativosICiclo ?? 2)
        : Number((config as any)?.maxNegativosIICiclo ?? 3);
    const restricaoArt23ActivaXls = examClasse
      ? false
      : isICicloRestricaoXls
        ? !!(config as any)?.restricaoArt23ICiclo
        : isIICicloRestricaoXls
          ? !!(config as any)?.restricaoArt23IICiclo
          : false;
    const disciplinasNuclearArt23Xls: string[] = Array.isArray((config as any)?.disciplinasNuclearArt23)
      ? (config as any).disciplinasNuclearArt23
      : [];

    function getGradesNum(alunoId: string, disc: string) {
      const t1 = notasDaTurma.find(x => x.alunoId === alunoId && x.disciplina === disc && x.trimestre === 1);
      const t2 = notasDaTurma.find(x => x.alunoId === alunoId && x.disciplina === disc && x.trimestre === 2);
      const t3 = notasDaTurma.find(x => x.alunoId === alunoId && x.disciplina === disc && x.trimestre === 3);
      const mt1v = t1?.mt1 ?? 0, mt2v = t2?.mt1 ?? 0, mt3v = t3?.mt1 ?? 0;
      const nuclear = !!nuclearMap[disc];
      const showNen = discShowsNen(disc);
      let nenV = 0;
      let mfdV: number | null = null;
      if (usarDecreto && classeNum > 0) {
        nenV = examClasse ? calcNEN(t3?.ex1 ?? 0, t3?.ex2 ?? 0, classeNum) : 0;
        if (mt1v > 0 || mt2v > 0 || mt3v > 0) {
          mfdV = calcMFD_auto(mt1v, mt2v, mt3v, nenV, nuclear, classeNum, decretoWeights);
        }
      } else {
        const withNf = [t1, t2, t3].find(x => x && x.nf);
        if (withNf) {
          mfdV = withNf!.nf;
        } else {
          const mts = [mt1v, mt2v, mt3v].filter(v => v > 0);
          mfdV = mts.length > 0 ? mts.reduce((a, b) => a + b, 0) / mts.length : null;
        }
      }
      return {
        mt1: mt1v > 0 ? Math.round(mt1v) : null,
        mt2: mt2v > 0 ? Math.round(mt2v) : null,
        mt3: mt3v > 0 ? Math.round(mt3v) : null,
        nen: showNen && nenV > 0 ? Math.round(nenV) : null,
        mfd: mfdV !== null && mfdV > 0 ? Math.round(mfdV) : null,
        showNen,
      };
    }

    const escola = config?.nomeEscola || '—';
    const anoLetivo = turma.anoLetivo;
    const notaMin = config?.notaMinimaAprovacao ?? 10;
    const cicloMap: Record<string, string> = {
      'Primário': 'ENSINO PRIMÁRIO',
      'I Ciclo': 'Iº CICLO',
      'II Ciclo': 'IIº CICLO',
    };
    const ciclo = cicloMap[turma.nivel] || (turma.nivel || '').toUpperCase();
    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
    const municipio = (config as any)?.municipio || '______________________';
    const provincia = (config as any)?.provincia || '______________________';
    const sala = (turma as any).sala || '_____';

    // II Ciclo onwards: include curso, director da turma e subdirector pedagógico no cabeçalho
    const isIICicloOuSuperior = turma.nivel === 'II Ciclo' || turma.nivel === 'III Ciclo';
    const cursoDaTurma = (turma as any).cursoId
      ? cursos.find(c => c.id === (turma as any).cursoId)
      : null;
    const cursoNome = cursoDaTurma?.nome || '';
    const directorTurmaNome = (() => {
      if (!turma.professorId) return '___________________________';
      const prof = professores.find(p => p.id === turma.professorId);
      return prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : '___________________________';
    })();

    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new (ExcelJS as any).Workbook();
    const ws = wb.addWorksheet('Pauta Final', { pageSetup: { orientation: 'landscape', paperSize: paperSize === 'A3' ? 8 : 9, fitToPage: true, fitToWidth: 1 } });

    // 3 colunas fixas (Nº, Nº ALUNO, NOME) + 4 ou 5 cols por disciplina (5 quando nuclear
    // c/ Exame Nacional) + OBSERVAÇÃO
    const colOffsets: number[] = [];
    let colCursor = 4;
    disciplinas.forEach(d => { colOffsets.push(colCursor); colCursor += discShowsNen(d) ? 5 : 4; });
    const colObs = colCursor;
    const COLS = colObs;

    const solidFill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${hex.replace('#', '')}` } });
    const centerAlign = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
    const leftAlign = { horizontal: 'left' as const, vertical: 'middle' as const };
    const thinBorder = { style: 'thin' as const, color: { argb: 'FF999999' } };
    const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

    // ── Brasão (logo) ─────────────────────────────────────────
    let brasaoImageId: number | null = null;
    const brasaoUrl = (config as any)?.logoUrl || '/angola-brasao.png';
    try {
      const resp = await fetch(brasaoUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        brasaoImageId = (wb as any).addImage({ base64: btoa(binary), extension: 'png' });
      }
    } catch (_) {}

    const applyInfoRow = (rowNum: number, text: string, bold: boolean, fontSize: number, center = true) => {
      ws.getRow(rowNum).height = fontSize + 8;
      const cell = ws.getCell(rowNum, 1);
      cell.value = text;
      cell.font = { bold, size: fontSize, name: 'Calibri' };
      cell.alignment = center ? centerAlign : leftAlign;
      ws.mergeCells(rowNum, 1, rowNum, COLS);
    };

    // Linhas 1-5: cabeçalho
    ws.getRow(1).height = 62;
    if (brasaoImageId !== null) {
      const midCol = Math.floor(COLS / 2) - 0.7;
      (ws as any).addImage(brasaoImageId, { tl: { col: midCol, row: 0.08 }, ext: { width: 56, height: 62 } });
    }
    applyInfoRow(2, 'REPÚBLICA DE ANGOLA', true, 12);
    applyInfoRow(3, 'MINISTÉRIO DA EDUCAÇÃO', true, 11);
    applyInfoRow(4, examClasse ? `PAUTA FINAL/GERAL — CLASSE DE EXAME NACIONAL — ${ciclo}` : `PAUTA FINAL/GERAL — ${ciclo}`, true, 11);
    ws.getRow(5).height = 4;

    // Linha 6 - info da escola
    const infoRow = ws.getRow(6);
    infoRow.height = 16;
    const infoCell = ws.getCell(6, 1);
    infoCell.value = `ESCOLA: ${escola}    MUNICÍPIO: ${municipio}    PROVÍNCIA: ${provincia}`;
    infoCell.font = { bold: true, size: 9, name: 'Calibri' };
    infoCell.alignment = leftAlign;
    ws.mergeCells(6, 1, 6, COLS);

    // Linha 7 - info turma (CURSO no fim, depois do TURNO, apenas no II Ciclo)
    const infoRow2 = ws.getRow(7);
    infoRow2.height = 16;
    const infoCell2 = ws.getCell(7, 1);
    const cursoSuffix2 = isIICicloOuSuperior ? `    CURSO: ${cursoNome || '______________________'}` : '';
    infoCell2.value = `PAUTA N.º ____/${now.getFullYear()}    ANO LECTIVO: ${anoLetivo}    CLASSE: ${turma.classe}    TURMA: ${turma.nome}    SALA: ${sala}    TURNO: ${turma.turno || '—'}${cursoSuffix2}`;
    infoCell2.font = { bold: true, size: 9, name: 'Calibri' };
    infoCell2.alignment = leftAlign;
    ws.mergeCells(7, 1, 7, COLS);

    const headerOffset = 0;
    const gapRow = 8 + headerOffset;
    const bannerRow = 9 + headerOffset;
    const hdrRow1 = 10 + headerOffset;
    const hdrRow2 = 11 + headerOffset;

    ws.getRow(gapRow).height = 4;

    // "DISCIPLINAS" banner
    const banner = ws.getCell(bannerRow, 1);
    banner.value = 'DISCIPLINAS';
    banner.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF1A3A1A' } };
    banner.alignment = centerAlign;
    ws.getRow(bannerRow).height = 14;
    ws.mergeCells(bannerRow, 1, bannerRow, COLS);

    // Cabeçalhos da tabela
    const styleHdr = (r: number, c: number, value: string, bgHex: string, textHex: string, bold = true, sz = 9) => {
      const cell = ws.getCell(r, c);
      cell.value = value;
      cell.font = { bold, size: sz, name: 'Calibri', color: { argb: `FF${textHex.replace('#', '')}` } };
      cell.fill = solidFill(bgHex);
      cell.alignment = centerAlign;
      cell.border = allBorders;
    };

    ws.getRow(hdrRow1).height = 18;
    ws.getRow(hdrRow2).height = 14;

    styleHdr(hdrRow1, 1, 'Nº', 'c6efce', '1a3a1a');
    ws.mergeCells(hdrRow1, 1, hdrRow2, 1);
    styleHdr(hdrRow1, 2, 'Nº ALUNO', 'c6efce', '1a3a1a');
    ws.mergeCells(hdrRow1, 2, hdrRow2, 2);
    styleHdr(hdrRow1, 3, 'NOME DO ALUNO', 'c6efce', '1a3a1a');
    ws.mergeCells(hdrRow1, 3, hdrRow2, 3);

    disciplinas.forEach((d, di) => {
      const startC = colOffsets[di];
      const showNen = discShowsNen(d);
      const span = showNen ? 5 : 4;
      styleHdr(hdrRow1, startC, d + (showNen ? ' (c/ EN)' : ''), '1a6b3c', 'ffffff', true, 10);
      ws.mergeCells(hdrRow1, startC, hdrRow1, startC + span - 1);
      const labels = showNen ? ['MT1', 'MT2', 'MT3', 'NEN', 'MFD'] : ['MT1', 'MT2', 'MT3', 'MFD'];
      labels.forEach((lbl, i) => {
        const isMfd = i === labels.length - 1;
        const isNen = lbl === 'NEN';
        styleHdr(hdrRow2, startC + i, lbl, isMfd ? 'a8d5a2' : isNen ? '90caf9' : 'c6efce', isNen ? '0d47a1' : '1a3a1a');
      });
    });

    styleHdr(hdrRow1, colObs, 'SITUAÇÃO FINAL', 'c6efce', '1a3a1a');
    ws.mergeCells(hdrRow1, colObs, hdrRow2, colObs);

    // Linhas dos alunos (a partir da 12)
    let totalTransita = 0;
    let totalTransitaCondicao = 0;
    let totalNaoTransita = 0;
    let totalSemNota = 0;
    const todasMfds: number[] = [];

    alunosDaTurma.forEach((aluno, idx) => {
      const rowNum = 12 + headerOffset + idx;
      const rowBg = idx % 2 === 0 ? 'e8f5e9' : 'ffffff';
      ws.getRow(rowNum).height = 16;

      const setCell = (c: number, value: unknown, bgHex: string, bold = false, textHex = '000000', center = false) => {
        const cell = ws.getCell(rowNum, c);
        cell.value = value as any;
        cell.font = { size: 9, name: 'Calibri', bold, color: { argb: `FF${textHex}` } };
        cell.fill = solidFill(bgHex);
        cell.alignment = center ? centerAlign : leftAlign;
        cell.border = allBorders;
      };

      setCell(1, idx + 1, rowBg, false, '000000', true);
      setCell(2, (aluno as any).numeroMatricula || '—', rowBg, true, '000000', true);
      setCell(3, `${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}`, rowBg);

      const mfdsAluno: number[] = [];
      disciplinas.forEach((disc, di) => {
        const startC = colOffsets[di];
        const g = getGradesNum(aluno.id, disc);

        const colorFor = (v: number | null) => v === null ? '000000' : v >= notaMin ? '155724' : 'cc0000';

        setCell(startC + 0, g.mt1 ?? '', rowBg, false, colorFor(g.mt1), true);
        setCell(startC + 1, g.mt2 ?? '', rowBg, false, colorFor(g.mt2), true);
        setCell(startC + 2, g.mt3 ?? '', rowBg, false, colorFor(g.mt3), true);
        let mfdCol = startC + 3;
        if (g.showNen) {
          setCell(mfdCol, g.nen ?? '', 'bbdefb', true, colorFor(g.nen), true);
          mfdCol = startC + 4;
        }
        setCell(mfdCol, g.mfd ?? '', 'd4edda', true, colorFor(g.mfd), true);

        if (g.mfd !== null) {
          mfdsAluno.push(g.mfd);
          todasMfds.push(g.mfd);
        }
      });

      let obs = '';
      let obsColor = '000000';
      if (mfdsAluno.length > 0) {
        const disciplinasParaTransicao = disciplinas
          .map(disc => ({ nome: disc, mfd: getGradesNum(aluno.id, disc).mfd }))
          .filter((d): d is { nome: string; mfd: number } => d.mfd !== null && d.mfd > 0);
        const resultado = calcularTransicaoAngola(
          disciplinasParaTransicao,
          notaMin,
          notaMinAbsXls,
          maxNegativasXls,
          { restricaoArt23Activa: restricaoArt23ActivaXls, disciplinasNuclearArt23: disciplinasNuclearArt23Xls },
        );
        obs = resultado.situacao;
        obsColor = resultado.cor.replace('#', '');
        if (resultado.situacao === 'TRANSITA') totalTransita++;
        else if (resultado.situacao === 'TRANSITA C/ CONDIÇÃO') totalTransitaCondicao++;
        else totalNaoTransita++;
      } else {
        totalSemNota++;
      }
      setCell(colObs, obs, rowBg, true, obsColor, true);
    });

    // ── Estatísticas da turma ──────────────────────────────
    const totalAlunos = alunosDaTurma.length;
    const totalAprovadosXls = totalTransita + totalTransitaCondicao;
    const taxaAprov = totalAlunos > 0 ? ((totalAprovadosXls / totalAlunos) * 100).toFixed(1) : '0.0';
    const taxaReprov = totalAlunos > 0 ? ((totalNaoTransita / totalAlunos) * 100).toFixed(1) : '0.0';
    const mediaGeral = todasMfds.length > 0
      ? (todasMfds.reduce((a, b) => a + b, 0) / todasMfds.length).toFixed(2)
      : '—';

    const statsTitleRow = 12 + headerOffset + alunosDaTurma.length + 1;
    const statsDataRow = statsTitleRow + 1;

    ws.getRow(statsTitleRow).height = 18;
    const statsTitleCell = ws.getCell(statsTitleRow, 1);
    statsTitleCell.value = 'ESTATÍSTICAS DA TURMA';
    statsTitleCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF1A3A1A' } };
    statsTitleCell.fill = solidFill('a8d5a2');
    statsTitleCell.alignment = centerAlign;
    statsTitleCell.border = allBorders;
    ws.mergeCells(statsTitleRow, 1, statsTitleRow, COLS);

    ws.getRow(statsDataRow).height = 18;
    const statsCell = ws.getCell(statsDataRow, 1);
    const mediaColor = mediaGeral !== '—' && parseFloat(mediaGeral) >= notaMin ? '155724' : 'cc0000';
    statsCell.value = `Total de Alunos: ${totalAlunos}    |    Transita: ${totalTransita}    |    Transita c/ Condição: ${totalTransitaCondicao}    |    Não Transita: ${totalNaoTransita}    |    Taxa de Aprovação: ${taxaAprov}%${totalSemNota > 0 ? `    |    Sem Notas: ${totalSemNota}` : ''}    |    Média Geral da Turma: ${mediaGeral}    |    Nota Mínima de Aprovação: ${notaMin}`;
    statsCell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: `FF${mediaColor}` } };
    statsCell.fill = solidFill('f3faf5');
    statsCell.alignment = centerAlign;
    statsCell.border = allBorders;
    ws.mergeCells(statsDataRow, 1, statsDataRow, COLS);

    // ── Assinaturas ───────────────────────────────────────
    const sigGap1 = statsDataRow + 2;
    const sigHdrRow = sigGap1 + 1;
    const sigGap2 = sigHdrRow + 2;
    const sigNameRow = sigGap2 + 1;
    const sigRoleRow = sigNameRow + 1;

    ws.getRow(sigGap1).height = 6;
    ws.getRow(sigHdrRow).height = 16;

    // Divide as colunas em 3 secções para as 3 assinaturas (igual ao modelo da Mini-Pauta):
    // Director(a) de Turma | Sub-Director(a) Pedagógico | Director(a)
    const seg3 = Math.floor(COLS / 3);
    const sigCol1Start = 1, sigCol1End = seg3;
    const sigCol2Start = seg3 + 1, sigCol2End = seg3 * 2;
    const sigCol3Start = seg3 * 2 + 1, sigCol3End = COLS;

    // Linha de assinatura (apenas border-top) para as 3 secções
    ws.getRow(sigGap2).height = 18;
    const drawLine = (rowNum: number, colS: number, colE: number) => {
      for (let c = colS; c <= colE; c++) {
        const cell = ws.getCell(rowNum, c);
        cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } } } as any;
      }
    };
    drawLine(sigGap2, sigCol1Start, sigCol1End);
    drawLine(sigGap2, sigCol2Start, sigCol2End);
    drawLine(sigGap2, sigCol3Start, sigCol3End);

    ws.getRow(sigNameRow).height = 14;
    ws.getRow(sigRoleRow).height = 14;
    const writeBlock = (colS: number, colE: number, name: string, role: string) => {
      const cName = ws.getCell(sigNameRow, colS);
      cName.value = name;
      cName.font = { bold: true, size: 9, name: 'Calibri' };
      cName.alignment = centerAlign;
      ws.mergeCells(sigNameRow, colS, sigNameRow, colE);

      const cRole = ws.getCell(sigRoleRow, colS);
      cRole.value = role;
      cRole.font = { size: 8, name: 'Calibri' };
      cRole.alignment = centerAlign;
      ws.mergeCells(sigRoleRow, colS, sigRoleRow, colE);
    };
    writeBlock(sigCol1Start, sigCol1End, directorTurmaNome, 'DIRECTOR(A) DE TURMA');
    writeBlock(sigCol2Start, sigCol2End, config?.directorPedagogico || '', 'O(A) SUB-DIRECTOR(A) PEDAGÓGICO');
    writeBlock(sigCol3Start, sigCol3End, config?.directorGeral || '', 'O(A) DIRECTOR(A)');

    // Linha centrada por baixo das assinaturas: "Escola, Data"
    const escolaDataRow = sigRoleRow + 2;
    ws.getRow(escolaDataRow - 1).height = 6;
    ws.getRow(escolaDataRow).height = 16;
    const escolaDataCell = ws.getCell(escolaDataRow, 1);
    escolaDataCell.value = `${escola}, ${dataActual}`;
    escolaDataCell.font = { italic: true, bold: true, size: 9, name: 'Calibri', color: { argb: 'FF1A3A1A' } };
    escolaDataCell.alignment = centerAlign;
    ws.mergeCells(escolaDataRow, 1, escolaDataRow, COLS);

    // Larguras das colunas
    ws.getColumn(1).width = 5;   // Nº
    ws.getColumn(2).width = 12;  // Nº ALUNO
    ws.getColumn(3).width = 32;  // NOME
    for (let c = 4; c < colObs; c++) ws.getColumn(c).width = 6;
    ws.getColumn(colObs).width = 14; // OBSERVAÇÃO

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pauta_Final_${turma.classe}_${turma.nome}_${anoLetivo}.xlsx`.replace(/\//g, '-');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Mini Pauta Excel Builder ─────────────────────────────────────────────

  async function buildMiniPautaExcel(turmaId: string, disciplinaFiltro?: string, trimestreFiltro?: 1 | 2 | 3) {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) return;

    const alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));

    const notasDaTurma = notas.filter(n => n.turmaId === turmaId);
    const disciplinasSet: string[] = [];
    for (const n of notasDaTurma) {
      if (!disciplinasSet.includes(n.disciplina)) disciplinasSet.push(n.disciplina);
    }
    let disciplinas = disciplinasSet.sort((a, b) => a.localeCompare(b));
    if (disciplinaFiltro) disciplinas = disciplinas.filter(d => d === disciplinaFiltro);
    if (disciplinas.length === 0) disciplinas.push('—');

    const escola = config?.nomeEscola || '—';
    const anoLetivo = turma.anoLetivo || '20__/20__';
    const nivelClasse = (turma.classe || '').replace(/ª\s*Classe/i, '').trim();
    const turnoStr = turma.turno ? `   Turno: ${turma.turno}` : '';
    const dataHoje = new Date().toLocaleDateString('pt-AO');
    const notaMin = config?.notaMinimaAprovacao ?? 10;

    const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new (ExcelJS as any).Workbook();

    const COLS = 16;
    const solidFill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${hex.replace('#', '')}` } });
    const centerAlign = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
    const leftAlign = { horizontal: 'left' as const, vertical: 'middle' as const };
    const thinBorder = { style: 'thin' as const, color: { argb: 'FF999999' } };
    const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

    // ── Fetch coat of arms image once, reuse across sheets ──────────────────
    let brasaoImageId: number | null = null;
    const brasaoUrl = (config as any)?.logoUrl || '/angola-brasao.png';
    try {
      const resp = await fetch(brasaoUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        brasaoImageId = (wb as any).addImage({ base64: btoa(binary), extension: 'png' });
      }
    } catch (_) {}

    for (const disciplina of disciplinas) {
      const sheetName = disciplina.slice(0, 31).replace(/[\\/*?[\]:]/g, '_');
      const ws = wb.addWorksheet(sheetName);

      const applyInfoRow = (rowNum: number, text: string, bold: boolean, fontSize: number, center = true) => {
        ws.getRow(rowNum).height = fontSize + 8;
        const cell = ws.getCell(rowNum, 1);
        cell.value = text;
        cell.font = { bold, size: fontSize, name: 'Calibri' };
        cell.alignment = center ? centerAlign : leftAlign;
        ws.mergeCells(rowNum, 1, rowNum, COLS);
      };

      // Row 1: tall empty row — coat of arms image floats here
      ws.getRow(1).height = 62;
      if (brasaoImageId !== null) {
        (ws as any).addImage(brasaoImageId, { tl: { col: 7.3, row: 0.08 }, ext: { width: 56, height: 62 } });
      }
      applyInfoRow(2, 'REPÚBLICA DE ANGOLA', true, 13);
      applyInfoRow(3, 'MINISTÉRIO DA EDUCAÇÃO', true, 12);
      applyInfoRow(4, `MINI-PAUTA — ${disciplina} — ${nivelClasse}ª Classe ${turma.nome} — Ano Lectivo: ${anoLetivo}`, true, 11);
      applyInfoRow(5, `Escola: ${escola}${turnoStr}   Data: ${dataHoje}`, true, 10, false);
      ws.getRow(6).height = 5;

      const styleHdr = (r: number, c: number, value: string, bgHex: string, textHex: string, bold = true, sz = 9) => {
        const cell = ws.getCell(r, c);
        cell.value = value;
        cell.font = { bold, size: sz, name: 'Calibri', color: { argb: `FF${textHex.replace('#', '')}` } };
        cell.fill = solidFill(bgHex);
        cell.alignment = centerAlign;
        cell.border = allBorders;
      };

      ws.getRow(7).height = 18;
      ws.getRow(8).height = 14;

      styleHdr(7, 1, 'Nº', 'c6efce', '1a3a1a');
      ws.mergeCells(7, 1, 8, 1);
      styleHdr(7, 2, 'NOME COMPLETO', 'c6efce', '1a3a1a');
      ws.mergeCells(7, 2, 8, 2);

      const fmt = (v: number | null | undefined) => (v && v > 0 ? v : '');

      const setCell = (rowNum: number, c: number, value: unknown, bgHex: string, bold = false, textHex = '000000', center = false) => {
        const cell = ws.getCell(rowNum, c);
        cell.value = value as any;
        cell.font = { size: 9, name: 'Calibri', bold, color: { argb: `FF${textHex}` } };
        cell.fill = solidFill(bgHex);
        cell.alignment = center ? centerAlign : leftAlign;
        cell.border = allBorders;
      };

      // ── Modelo de avaliação dinâmico ──────────────────────────────────────
      const exNumAval = Math.max(1, Math.min(8, config?.numAvaliacoes ?? 4));
      const exNPP = (config as any)?.temNPP !== false && (config as any)?.pp1Habilitado !== false;
      const exNPT = (config as any)?.temNPT !== false && (config as any)?.pptHabilitado !== false;
      // Nº de colunas por grupo de trimestre: Ax + MAC + [NPP] + [NPT] + MT
      const triColsEx = exNumAval + 1 + (exNPP ? 1 : 0) + (exNPT ? 1 : 0) + 1;
      const colObs = 2 + triColsEx * 3 + 1; // Nº + Nome + T1 + T2 + T3 + MFD + OBS
      const colMFD = colObs - 1;
      const COLS_XL = colObs;

      if (trimestreFiltro) {
        // ── Cabeçalho simplificado: 1 trimestre ─────────────────────────────
        const COLS_T = 2 + triColsEx + 1; // Nº + Nome + triCols + OBS
        const triLbl = trimestreFiltro === 1 ? '1º TRIMESTRE' : trimestreFiltro === 2 ? '2º TRIMESTRE' : '3º TRIMESTRE';
        applyInfoRow(4, `MINI-PAUTA — ${disciplina} — ${triLbl} — ${nivelClasse}ª Classe ${turma.nome} — Ano Lectivo: ${anoLetivo}`, true, 11);
        ws.mergeCells(4, 1, 4, COLS_T);
        [2, 3, 5].forEach(r => ws.mergeCells(r, 1, r, COLS_T));
        ws.getRow(7).height = 18; ws.getRow(8).height = 14;
        styleHdr(7, 1, 'Nº', 'c6efce', '1a3a1a'); ws.mergeCells(7, 1, 8, 1);
        styleHdr(7, 2, 'NOME COMPLETO', 'c6efce', '1a3a1a'); ws.mergeCells(7, 2, 8, 2);
        styleHdr(7, 3, triLbl, '1a6b3c', 'ffffff', true, 10);
        ws.mergeCells(7, 3, 7, 2 + triColsEx);
        // Sub-cabeçalhos: A1..An + MAC + [NPP] + [NPT] + MT
        let colIdx = 3;
        for (let i = 1; i <= exNumAval; i++) styleHdr(8, colIdx++, `A${i}`, 'dff0da', '1a3a1a');
        styleHdr(8, colIdx++, 'MAC', '5da85d', 'ffffff');
        if (exNPP) styleHdr(8, colIdx++, 'NPP', 'a8d5a2', '0a2a0a');
        if (exNPT) styleHdr(8, colIdx++, 'NPT', '88c488', '0a2a0a');
        styleHdr(8, colIdx++, `MT${trimestreFiltro}`, 'a8d5a2', '1a3a1a');
        styleHdr(7, colIdx, 'OBSERVAÇÃO', 'c6efce', '1a3a1a'); ws.mergeCells(7, colIdx, 8, colIdx);

        alunosDaTurma.forEach((aluno, idx) => {
          const n = notasDaTurma.find(x => x.alunoId === aluno.id && x.disciplina === disciplina && x.trimestre === trimestreFiltro);
          const rowBg = idx % 2 === 0 ? 'e8f5e9' : 'ffffff';
          const rowNum = 9 + idx;
          ws.getRow(rowNum).height = 16;
          setCell(rowNum, 1, idx + 1, rowBg, false, '000000', true);
          setCell(rowNum, 2, `${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}`, rowBg);
          let c = 3;
          for (let i = 1; i <= exNumAval; i++) setCell(rowNum, c++, fmt((n as any)?.[`aval${i}`] ?? 0), rowBg, false, '000000', true);
          const macV = n ? (n.mac ?? (n as any).mac1 ?? 0) : 0;
          setCell(rowNum, c++, macV > 0 ? macV : '', 'b8e4b8', true, '000000', true);
          if (exNPP) setCell(rowNum, c++, fmt(n?.pp1 ?? 0), rowBg, false, '000000', true);
          if (exNPT) setCell(rowNum, c++, fmt(n?.ppt ?? 0), rowBg, false, '000000', true);
          const mtVal = n?.mt1 ?? 0;
          const isLow = mtVal > 0 && mtVal < notaMin;
          setCell(rowNum, c++, mtVal > 0 ? mtVal : '', 'd4edda', true, isLow ? 'cc0000' : '000000', true);
          const obs = mtVal > 0 ? (mtVal >= notaMin ? 'Aprovado' : 'Reprovado') : '';
          setCell(rowNum, c, obs, rowBg, false, obs === 'Reprovado' ? 'cc0000' : (obs ? '155724' : '000000'), true);
        });

        ws.getColumn(1).width = 5;
        ws.getColumn(2).width = 36;
        for (let c = 3; c <= 2 + triColsEx; c++) ws.getColumn(c).width = 7;
        ws.getColumn(2 + triColsEx + 1).width = 14;
      } else {
        // ── Cabeçalho completo: todos os trimestres ──────────────────────────
        applyInfoRow(4, `MINI-PAUTA — ${disciplina} — ${nivelClasse}ª Classe ${turma.nome} — Ano Lectivo: ${anoLetivo}`, true, 11);
        ws.mergeCells(4, 1, 4, COLS_XL);
        [2, 3, 5].forEach(r => ws.mergeCells(r, 1, r, COLS_XL));
        ws.getRow(7).height = 18; ws.getRow(8).height = 14;
        styleHdr(7, 1, 'Nº', 'c6efce', '1a3a1a'); ws.mergeCells(7, 1, 8, 1);
        styleHdr(7, 2, 'NOME COMPLETO', 'c6efce', '1a3a1a'); ws.mergeCells(7, 2, 8, 2);

        const triGroups = [
          { label: '1º TRIMESTRE', startC: 3 },
          { label: '2º TRIMESTRE', startC: 3 + triColsEx },
          { label: '3º TRIMESTRE', startC: 3 + triColsEx * 2 },
        ];
        for (const g of triGroups) {
          styleHdr(7, g.startC, g.label, '1a6b3c', 'ffffff', true, 10);
          ws.mergeCells(7, g.startC, 7, g.startC + triColsEx - 1);
          let ci = g.startC;
          for (let i = 1; i <= exNumAval; i++) styleHdr(8, ci++, `A${i}`, 'dff0da', '1a3a1a');
          styleHdr(8, ci++, 'MAC', '5da85d', 'ffffff');
          if (exNPP) styleHdr(8, ci++, 'NPP', 'a8d5a2', '0a2a0a');
          if (exNPT) styleHdr(8, ci++, 'NPT', '88c488', '0a2a0a');
          styleHdr(8, ci, 'MT', 'a8d5a2', '1a3a1a');
        }
        styleHdr(7, colMFD, 'MFD', 'a8d5a2', '1a3a1a'); ws.mergeCells(7, colMFD, 8, colMFD);
        styleHdr(7, colObs, 'OBSERVAÇÃO', 'c6efce', '1a3a1a'); ws.mergeCells(7, colObs, 8, colObs);

        alunosDaTurma.forEach((aluno, idx) => {
          const getN = (tr: number) => notasDaTurma.find(x => x.alunoId === aluno.id && x.disciplina === disciplina && x.trimestre === tr);
          const t1 = getN(1); const t2 = getN(2); const t3 = getN(3);
          const mts = [t1?.mt1, t2?.mt1, t3?.mt1].filter((v): v is number => !!v && v > 0);
          const mfd = mts.length ? Math.round((mts.reduce((a, b) => a + b, 0) / mts.length) * 10) / 10 : null;
          const aprovado = mfd !== null ? (mfd >= notaMin ? 'Aprovado' : 'Reprovado') : '';
          const rowBg = idx % 2 === 0 ? 'e8f5e9' : 'ffffff';
          const rowNum = 9 + idx;
          ws.getRow(rowNum).height = 16;
          setCell(rowNum, 1, idx + 1, rowBg, false, '000000', true);
          setCell(rowNum, 2, `${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}`, rowBg);

          [t1, t2, t3].forEach((tn, ti) => {
            let c = 3 + ti * triColsEx;
            for (let i = 1; i <= exNumAval; i++) setCell(rowNum, c++, fmt((tn as any)?.[`aval${i}`] ?? 0), rowBg, false, '000000', true);
            const macV = tn ? (tn.mac ?? (tn as any).mac1 ?? 0) : 0;
            setCell(rowNum, c++, macV > 0 ? macV : '', 'b8e4b8', true, '000000', true);
            if (exNPP) setCell(rowNum, c++, fmt(tn?.pp1 ?? 0), rowBg, false, '000000', true);
            if (exNPT) setCell(rowNum, c++, fmt(tn?.ppt ?? 0), rowBg, false, '000000', true);
            const mtV = tn?.mt1 ?? 0;
            const isLow = mtV > 0 && mtV < notaMin;
            setCell(rowNum, c, mtV > 0 ? mtV : '', 'd4edda', true, isLow ? 'cc0000' : '000000', true);
          });

          const mfdLow = mfd !== null && mfd < notaMin;
          setCell(rowNum, colMFD, mfd !== null ? mfd : '', 'c6efce', true, mfdLow ? 'cc0000' : '155724', true);
          setCell(rowNum, colObs, aprovado, rowBg, false, aprovado === 'Reprovado' ? 'cc0000' : (aprovado ? '155724' : '000000'), true);
        });

        ws.getColumn(1).width = 5;
        ws.getColumn(2).width = 30;
        for (let c = 3; c < colMFD; c++) ws.getColumn(c).width = 6;
        ws.getColumn(colMFD).width = 7;
        ws.getColumn(colObs).width = 12;
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mini_Pauta_${nivelClasse}_${turma.nome}_${anoLetivo}.xlsx`.replace(/\//g, '-');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Mini Pauta HTML Builder (formato Angola) ─────────────────────────────

  function buildMiniPautaHtml(turmaId: string, disciplinaFiltro?: string, trimestreFiltro?: 1 | 2 | 3, insigniaBase64?: string, marcaAguaBase64?: string, pautaNumero?: string): string {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) return '';

    const notasDaTurma = notas.filter(n => n.turmaId === turmaId);

    // Alunos activos na turma; fallback histórico: buscar alunos a partir das notas (turmas de anos anteriores)
    let alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));
    if (alunosDaTurma.length === 0 && notasDaTurma.length > 0) {
      const idsNasNotas = [...new Set(notasDaTurma.map(n => (n as any).alunoId).filter(Boolean))];
      alunosDaTurma = alunos
        .filter(a => idsNasNotas.includes(a.id))
        .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));
    }
    const disciplinasSet: string[] = [];
    for (const n of notasDaTurma) {
      if (!disciplinasSet.includes(n.disciplina)) disciplinasSet.push(n.disciplina);
    }
    let disciplinas = disciplinasSet.sort((a, b) => a.localeCompare(b));
    if (disciplinaFiltro) disciplinas = disciplinas.filter(d => d === disciplinaFiltro);

    const escola = config?.nomeEscola || '___________________________';
    const logoUrl = (config as any)?.logoUrl || '';
    const brasaoSrc = insigniaBase64 || logoUrl || '/angola-brasao.png';
    const anoLetivo = turma.anoLetivo || '20__/20__';
    const turmaNome = turma.nome || '—';
    const nivelClasse = (turma.classe || '').replace(/ª\s*Classe/i, '').trim();
    const turno = turma.turno || '';
    const turnoStr = turno ? `   Turno: ${turno}` : '';
    const dataHoje = new Date().toLocaleDateString('pt-AO');
    const notaMin = config?.notaMinimaAprovacao ?? 10;
    const municipioCfg = (config as any)?.municipio || '______________________';
    const provinciaCfg = (config as any)?.provincia || '______________________';
    const salaTurma = (turma as any).sala || '_____';
    const anoCorrente = new Date().getFullYear();
    const directorTurmaNome = (() => {
      if (!turma.professorId) return '___________________________';
      const prof = professores.find((p: any) => p.id === turma.professorId);
      return prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : '___________________________';
    })();
    const dataExtensa = (() => {
      const d = new Date();
      const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    })();

    const fmt = (v: number | null | undefined) => (v && v > 0) ? v.toFixed(1) : '';

    const triLabel = (t: number) => t === 1 ? '1º TRIMESTRE' : t === 2 ? '2º TRIMESTRE' : '3º TRIMESTRE';
    const mtLabel = (t: number) => `MT${t}`;

    // ── Modelo de avaliação dinâmico (igual ao professor-pauta) ─────────────
    const numAval = Math.max(1, Math.min(8, config?.numAvaliacoes ?? 4));
    const mostrarNPP = (config as any)?.temNPP !== false && (config as any)?.pp1Habilitado !== false;
    const mostrarNPT = (config as any)?.temNPT !== false && (config as any)?.pptHabilitado !== false;
    // Nº de colunas por trimestre: Ax + MAC + [NPP] + [NPT] + MT
    const triCols = numAval + 1 + (mostrarNPP ? 1 : 0) + (mostrarNPT ? 1 : 0) + 1;

    // Sub-cabeçalho de colunas de avaliação por trimestre
    const subHdrTh = () => [
      ...Array.from({ length: numAval }, (_, i) => `<th>A${i + 1}</th>`),
      `<th>MAC</th>`,
      ...(mostrarNPP ? [`<th>NPP</th>`] : []),
      ...(mostrarNPT ? [`<th>NPT</th>`] : []),
    ].join('');

    // Células de dados para um registo de notas
    const avalCells = (n: typeof notasDaTurma[number] | null | undefined, blank: boolean) => {
      const cells: string[] = [];
      for (let i = 1; i <= numAval; i++) {
        cells.push(`<td class="nc">${blank ? '' : fmt((n as any)?.[`aval${i}`] ?? 0)}</td>`);
      }
      const macV = n ? (n.mac ?? (n as any).mac1 ?? 0) : 0;
      cells.push(`<td class="nc">${blank ? '' : fmt(macV > 0 ? macV : null)}</td>`);
      if (mostrarNPP) cells.push(`<td class="nc">${blank ? '' : fmt(n ? (n.pp1 ?? 0) : 0)}</td>`);
      if (mostrarNPT) cells.push(`<td class="nc">${blank ? '' : fmt(n ? (n.ppt ?? 0) : 0)}</td>`);
      return cells.join('');
    };

    const buildPage = (disciplina: string, showBlank: boolean) => {
      const discLabel = showBlank ? '____________________' : disciplina;
      const triStr = trimestreFiltro ? ` — ${triLabel(trimestreFiltro)}` : '';

      if (trimestreFiltro) {
        // ── Tabela simplificada: apenas 1 trimestre ──────────────────────────
        const rows = alunosDaTurma.map((aluno, idx) => {
          const n = notasDaTurma.find(x => x.alunoId === aluno.id && x.disciplina === disciplina && x.trimestre === trimestreFiltro);
          const mtVal = n ? (n.mt1 ?? 0) : 0;
          const mtColor = mtVal <= 0 ? '#000' : mtVal >= notaMin ? '#155724' : '#cc0000';
          const bg = idx % 2 === 0 ? '#e8f5e9' : '#ffffff';
          return `<tr style="background:${bg}">
            <td style="text-align:center;font-size:9px;">${String(idx + 1).padStart(2, '0')}</td>
            <td style="padding-left:4px;font-size:9px;">${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}</td>
            ${avalCells(n, showBlank)}
            <td class="nc mt" style="color:${showBlank ? '#000' : mtColor};">${showBlank ? '' : (mtVal > 0 ? mtVal.toFixed(1) : '')}</td>
            <td style="text-align:center;font-size:8px;color:${mtVal > 0 && mtVal < notaMin ? '#cc0000' : '#155724'};">${showBlank ? '' : (mtVal > 0 ? (mtVal >= notaMin ? 'Aprovado' : 'Reprovado') : '')}</td>
          </tr>`;
        });
        return `
<div class="page">
  <div style="position:relative;">
    <div class="visto-block">
      <p><strong>VISTO</strong></p><p>Data ___/___/______</p><br/>
      <p>A Chefe de Repartição e Ensino</p><br/><p>_________________________</p>
    </div>
    <div class="brasao-wrap"><img src="${brasaoSrc}" class="brasao" alt="Insígnia" onerror="this.style.display='none'"/></div>
    <div class="hrow hrow-rep">REPÚBLICA DE ANGOLA</div>
    <div class="hrow hrow-min">MINISTÉRIO DA EDUCAÇÃO</div>
    <div class="hrow hrow-2">MINI-PAUTA — ${discLabel}${triStr} — ${nivelClasse}ª Classe ${turmaNome} — Ano Lectivo: ${anoLetivo}</div>
  </div>
  <div class="info-box">
    <div class="info-row-1">
      <span><strong>ESCOLA:</strong> ${escola}</span>
      <span><strong>MUNICÍPIO DE:</strong> ${municipioCfg}</span>
      <span><strong>PROVÍNCIA DE:</strong> ${provinciaCfg}</span>
    </div>
    <div class="info-row-2">
      <span><strong>PAUTA N.º</strong> ${pautaNumero || '________'} / ${anoCorrente}</span>
      <span><strong>ANO LECTIVO:</strong> ${anoLetivo}</span>
      <span><strong>TRIMESTRE:</strong> ${triLabel(trimestreFiltro)}</span>
      <span><strong>CLASSE:</strong> ${turma.classe || ''}</span>
      <span><strong>TURMA:</strong> ${turmaNome}</span>
      <span><strong>SALA:</strong> ${salaTurma}</span>
      <span><strong>TURNO:</strong> ${turno || '—'}</span>
      <span><strong>DATA:</strong> ${dataHoje}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:26px;">Nº</th>
        <th rowspan="2" style="min-width:140px;text-align:left;padding-left:4px;">NOME COMPLETO</th>
        <th colspan="${triCols}" class="hdr-tri">${triLabel(trimestreFiltro)}</th>
        <th rowspan="2" style="width:64px;">OBSERVAÇÃO</th>
      </tr>
      <tr>${subHdrTh()}<th class="th-mt">${mtLabel(trimestreFiltro)}</th></tr>
    </thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>
  <div style="text-align:center;font-size:9px;font-weight:bold;margin-bottom:6px;">${escola}, aos ${dataExtensa}.</div>
  <div class="footer">
    <div class="sig"><div class="sig-line">DIRECTOR(A) DE TURMA<br/><span style="font-weight:bold;">${directorTurmaNome}</span></div></div>
    <div class="sig"><div class="sig-line">O(A) SUB-DIRECTOR(A) PEDAGÓGICO<br/><span style="font-weight:bold;">${directorPedagogico}</span></div></div>
    <div class="sig"><div class="sig-line">O(A) DIRECTOR(A)<br/><span style="font-weight:bold;">${directorGeral}</span></div></div>
  </div>
</div>`;
      }

      // ── Tabela completa: todos os trimestres (comportamento padrão) ──────────
      const rows = alunosDaTurma.map((aluno, idx) => {
        const getN = (tr: number) => notasDaTurma.find(x => x.alunoId === aluno.id && x.disciplina === disciplina && x.trimestre === tr);
        const t1 = getN(1); const t2 = getN(2); const t3 = getN(3);
        const mts = [t1?.mt1, t2?.mt1, t3?.mt1].filter((v): v is number => !!v && v > 0);
        const mfd = mts.length ? Math.round((mts.reduce((a, b) => a + b, 0) / mts.length) * 10) / 10 : null;
        const aprovado = mfd !== null ? (mfd >= notaMin ? 'Aprovado' : 'Reprovado') : '';
        const mfdColor = mfd === null ? '#000' : mfd >= notaMin ? '#155724' : '#cc0000';
        const bg = idx % 2 === 0 ? '#e8f5e9' : '#ffffff';
        const mt = (n: typeof t1) => n?.mt1 ?? 0;
        return `<tr style="background:${bg}">
          <td style="text-align:center;font-size:9px;">${String(idx + 1).padStart(2, '0')}</td>
          <td style="padding-left:4px;font-size:9px;">${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}</td>
          ${avalCells(t1, showBlank)}<td class="nc mt">${showBlank ? '' : fmt(mt(t1))}</td>
          ${avalCells(t2, showBlank)}<td class="nc mt">${showBlank ? '' : fmt(mt(t2))}</td>
          ${avalCells(t3, showBlank)}<td class="nc mt">${showBlank ? '' : fmt(mt(t3))}</td>
          <td class="nc mfd" style="color:${showBlank ? '#000' : mfdColor};">${showBlank ? '' : (mfd !== null ? mfd.toFixed(1) : '')}</td>
          <td style="text-align:center;font-size:8px;color:${mfd !== null && mfd < notaMin ? '#cc0000' : '#155724'};">${showBlank ? '' : aprovado}</td>
        </tr>`;
      });
      return `
<div class="page">
  <div style="position:relative;">
    <div class="visto-block">
      <p><strong>VISTO</strong></p>
      <p>Data ___/___/______</p>
      <br/>
      <p>A Chefe de Repartição e Ensino</p>
      <br/>
      <p>_________________________</p>
    </div>
    <div class="brasao-wrap"><img src="${brasaoSrc}" class="brasao" alt="Insígnia" onerror="this.style.display='none'"/></div>
    <div class="hrow hrow-rep">REPÚBLICA DE ANGOLA</div>
    <div class="hrow hrow-min">MINISTÉRIO DA EDUCAÇÃO</div>
    <div class="hrow hrow-2">MINI-PAUTA — ${discLabel} — ${nivelClasse}ª Classe ${turmaNome} — Ano Lectivo: ${anoLetivo}</div>
  </div>
  <div class="info-box">
    <div class="info-row-1">
      <span><strong>ESCOLA:</strong> ${escola}</span>
      <span><strong>MUNICÍPIO DE:</strong> ${municipioCfg}</span>
      <span><strong>PROVÍNCIA DE:</strong> ${provinciaCfg}</span>
    </div>
    <div class="info-row-2">
      <span><strong>PAUTA N.º</strong> ${pautaNumero || '________'} / ${anoCorrente}</span>
      <span><strong>ANO LECTIVO:</strong> ${anoLetivo}</span>
      <span><strong>CLASSE:</strong> ${turma.classe || ''}</span>
      <span><strong>TURMA:</strong> ${turmaNome}</span>
      <span><strong>SALA:</strong> ${salaTurma}</span>
      <span><strong>TURNO:</strong> ${turno || '—'}</span>
      <span><strong>DATA:</strong> ${dataHoje}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width:26px;">Nº</th>
        <th rowspan="2" style="min-width:110px;text-align:left;padding-left:4px;">NOME COMPLETO</th>
        <th colspan="${triCols}" class="hdr-tri">1º TRIMESTRE</th>
        <th colspan="${triCols}" class="hdr-tri">2º TRIMESTRE</th>
        <th colspan="${triCols}" class="hdr-tri">3º TRIMESTRE</th>
        <th rowspan="2" class="hdr-mfd" style="width:30px;">MFD</th>
        <th rowspan="2" style="width:56px;">OBSERVAÇÃO</th>
      </tr>
      <tr>
        ${subHdrTh()}<th class="th-mt">MT1</th>
        ${subHdrTh()}<th class="th-mt">MT2</th>
        ${subHdrTh()}<th class="th-mt">MT3</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('\n')}
    </tbody>
  </table>
  <div style="text-align:center;font-size:9px;font-weight:bold;margin-bottom:6px;">${escola}, aos ${dataExtensa}.</div>
  <div class="footer">
    <div class="sig"><div class="sig-line">DIRECTOR(A) DE TURMA<br/><span style="font-weight:bold;">${directorTurmaNome}</span></div></div>
    <div class="sig"><div class="sig-line">O(A) SUB-DIRECTOR(A) PEDAGÓGICO<br/><span style="font-weight:bold;">${directorPedagogico}</span></div></div>
    <div class="sig"><div class="sig-line">O(A) DIRECTOR(A)<br/><span style="font-weight:bold;">${directorGeral}</span></div></div>
  </div>
</div>`;
    };

    const pages = disciplinas.length > 0
      ? disciplinas.map(d => buildPage(d, false))
      : [buildPage('', true)];

    return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Mini-Pauta · ${turmaNome} · ${anoLetivo}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:Calibri,Arial,sans-serif;background:#fff;color:#000;font-size:10px;}
  .page{padding:12px 16px;page-break-after:always;}
  .page:last-child{page-break-after:auto;}
  .brasao-wrap{text-align:center;margin-bottom:3px;}
  .brasao{width:54px;height:auto;display:inline-block;}
  .hrow{width:100%;padding:1px 0;line-height:1.4;}
  .hrow-rep{font-size:13px;font-weight:bold;text-align:center;margin-bottom:1px;}
  .hrow-min{font-size:12px;font-weight:bold;text-align:center;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:2px;}
  .hrow-2{font-size:10px;font-weight:bold;text-align:center;margin-bottom:2px;}
  .hrow-3{font-size:9px;font-weight:bold;text-align:left;border-bottom:2px solid #000;padding-bottom:3px;margin-bottom:5px;}
  .visto-block{position:absolute;top:0;left:0;font-size:8px;border:1px solid #000;padding:4px 8px;min-width:120px;text-align:center;line-height:1.3;}
  .info-box{border:1px solid #000;padding:3px 5px;margin:4px 0 4px;font-size:8.5px;}
  .info-row-1,.info-row-2{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:2px;}
  .info-row-2{margin-bottom:0;}
  table{width:100%;border-collapse:collapse;font-size:8px;}
  th,td{border:1px solid #999;padding:2px 2px;}
  th{background-color:#c6efce !important;font-size:8px;font-weight:bold;text-align:center;white-space:nowrap;color:#1a3a1a;}
  th.hdr-tri{background-color:#1a6b3c !important;color:#fff !important;font-size:9px;}
  th.hdr-mfd{background-color:#a8d5a2 !important;color:#1a3a1a;}
  th.th-mt{background-color:#a8d5a2 !important;color:#1a3a1a;}
  td.nc{text-align:center;font-size:8px;}
  td.mt{background-color:#d4edda !important;font-weight:bold;}
  td.mfd{background-color:#c6efce !important;font-weight:bold;}
  .footer{margin-top:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;}
  .sig{text-align:center;}
  .sig-line{border-top:1px solid #000;margin-top:36px;padding-top:3px;font-size:9px;min-width:160px;}
  .sig-line span{font-size:9px;}
  @media print{
    body{padding:0;}
    .page{padding:6px 10px;}
    @page{size:A4 landscape;margin: 0;}
    .no-print{display:none;}
  }
</style>
</head><body>
${pages.join('\n')}
${marcaAguaBase64 ? `<img src="${marcaAguaBase64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:55%;opacity:0.05;pointer-events:none;z-index:0;" alt="" />` : ''}
<div class="no-print" style="text-align:center;margin:16px;">
  <button onclick="window.print()" style="padding:10px 32px;font-size:14px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
</body></html>`;
  }

  // ─── Mini Pauta por Disciplina HTML Builder ───────────────────────────────

  function buildMiniPautaDisciplinaHtml(turmaId: string, disciplina: string, insigniaBase64?: string, marcaAguaBase64?: string): string {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma || !disciplina) return '';

    const alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));

    const notasDaTurma = notas.filter(n => n.turmaId === turmaId);
    const nomeEscola = config?.nomeEscola || 'Super Escola';
    const anoLetivo = turma.anoLetivo || '20__/20__';
    const anoLetivoCurto = anoLetivo.includes('/') ? anoLetivo.replace('/', '-') : anoLetivo;
    const turmaNome = turma.nome || '—';
    const nivelClasse = (turma.classe || '—').replace(/ª\s*Classe/i, '').trim();
    const sala = (turma as any).sala || '—';
    const turno = (turma as any).turno || '';
    const notaMinima = config?.notaMinimaAprovacao ?? 10;
    const dirPedNome = (config as any)?.directorPedagogico || directorPedagogico || '____________________';
    const dirGeralNome = (config as any)?.directorGeral || directorGeral || '____________________';
    const municipio = (config as any)?.municipioEscola || (config as any)?.municipio || '';
    const provincia = (config as any)?.provinciaEscola || (config as any)?.provincia || '';
    const brasaoUrl = insigniaBase64 || (config as any)?.logoUrl || '/angola-brasao.png';
    const cabecalhoLinha1 = (config as any)?.cabecalhoLinha1 || 'REPÚBLICA DE ANGOLA';
    const cabecalhoLinha2 = (config as any)?.cabecalhoLinha2 || 'MINISTÉRIO DA EDUCAÇÃO';
    const hoje = new Date();
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dataHoje = `${String(hoje.getDate()).padStart(2,'0')} de ${meses[hoje.getMonth()].toLowerCase()} de ${hoje.getFullYear()}`;
    const anoCorrente = hoje.getFullYear();
    const numeroPauta = '____';

    const fmtVal = (v: number | null | undefined): string => {
      if (!v || v <= 0) return '';
      return v.toFixed(1);
    };
    const fmtCell = (v: number | null | undefined, bold = false): string => {
      const txt = fmtVal(v);
      if (!txt) return '';
      const isFailing = (v as number) < notaMinima;
      const style = [
        isFailing ? 'color:#cc0000;' : 'color:#000;',
        bold ? 'font-weight:bold;' : '',
      ].join('');
      return `<span style="${style}">${txt}</span>`;
    };

    // Apenas alunos com pelo menos uma nota lançada nesta disciplina
    const alunosComNota = alunosDaTurma.filter(aluno =>
      notasDaTurma.some(n => n.alunoId === aluno.id && n.disciplina === disciplina &&
        ((n.mac ?? (n as any).mac1 ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0 || (n.mt1 ?? 0) > 0))
    );
    const rows = alunosComNota.map((aluno, idx) => {
      const get = (tr: number) => {
        const n = notasDaTurma.find(x => x.alunoId === aluno.id && x.disciplina === disciplina && x.trimestre === tr);
        return n ? { mac: n.mac ?? (n as any).mac1 ?? 0, npp: n.pp1 ?? 0, npt: n.ppt ?? 0, mt: n.mt1 ?? 0 } : null;
      };
      const t1 = get(1); const t2 = get(2); const t3 = get(3);
      const mts = [t1?.mt, t2?.mt, t3?.mt].filter((v): v is number => !!v && v > 0);
      const mfd = mts.length ? Math.round((mts.reduce((a, b) => a + b, 0) / mts.length) * 10) / 10 : null;
      const mfdArred = mfd !== null ? Math.round(mfd) : null;
      const aprovado = mfdArred !== null ? (mfdArred >= notaMinima ? 'Aprovado' : 'Reprovado') : '';
      const mfdColor = mfdArred === null ? '#000' : mfdArred >= notaMinima ? '#155724' : '#cc0000';
      const bgEven = idx % 2 === 0 ? '#e8f5e9' : '#ffffff';
      const nomeCompleto = `${aluno.nome} ${aluno.apelido || ''}`.trim().toUpperCase();
      return `<tr style="background-color:${bgEven}">
        <td class="nc-num">${String(idx + 1).padStart(2, '0')}</td>
        <td class="nc-nome">${nomeCompleto}</td>
        <td class="nc">${fmtCell(t1?.mac)}</td><td class="nc">${fmtCell(t1?.npp)}</td><td class="nc">${fmtCell(t1?.npt)}</td><td class="nc mt">${fmtCell(t1?.mt, true)}</td>
        <td class="nc">${fmtCell(t2?.mac)}</td><td class="nc">${fmtCell(t2?.npp)}</td><td class="nc">${fmtCell(t2?.npt)}</td><td class="nc mt">${fmtCell(t2?.mt, true)}</td>
        <td class="nc">${fmtCell(t3?.mac)}</td><td class="nc">${fmtCell(t3?.npp)}</td><td class="nc">${fmtCell(t3?.npt)}</td><td class="nc mt">${fmtCell(t3?.mt, true)}</td>
        <td class="nc mfd" style="font-weight:bold;background-color:#c6efce;color:${mfdColor};">${mfd !== null ? mfd.toFixed(1) : ''}</td>
        <td class="nc-obs" style="color:${mfd !== null && mfd < notaMinima ? '#cc0000' : '#155724'};">${aprovado}</td>
      </tr>`;
    });

    return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Mini-Pauta · ${disciplina} · ${turmaNome}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:'Times New Roman',Calibri,Arial,sans-serif;background:#fff;color:#000;padding:10px 14px;font-size:11px;}
  .top-bar{position:relative;display:block;min-height:120px;margin-bottom:4px;}
  .visto{position:absolute;left:0;top:0;width:170px;border:1px solid #000;padding:4px 6px;font-size:9px;line-height:1.35;}
  .visto-title{text-align:center;font-weight:bold;font-size:10px;letter-spacing:0.5px;margin-bottom:4px;}
  .visto-data{font-size:9px;margin-bottom:18px;}
  .visto-cargo{border-top:1px solid #000;padding-top:2px;text-align:center;font-size:9px;font-style:italic;}
  .doc-header{text-align:center;padding-top:0;}
  .doc-header img{width:78px;height:78px;object-fit:contain;display:block;margin:0 auto 2px;}
  .doc-header .rep{font-size:12px;font-weight:bold;line-height:1.25;}
  .doc-header .min{font-size:11px;font-weight:bold;line-height:1.25;margin-bottom:6px;}
  .doc-title{text-align:center;font-size:14px;font-weight:bold;margin:2px 0 6px;letter-spacing:0.5px;}
  .info-bar{border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0;font-size:10px;}
  .info-bar .row1, .info-bar .row2{display:flex;flex-wrap:wrap;gap:18px;padding:1px 4px;}
  .info-bar .lbl{font-weight:bold;}
  table{width:100%;border-collapse:collapse;font-size:9px;margin-top:0;}
  th,td{border:1px solid #444;padding:2px 3px;}
  thead th{background-color:#1a6b3c !important;color:#fff !important;font-size:9px;font-weight:bold;text-align:center;white-space:nowrap;}
  thead tr:first-child th.col-num,
  thead tr:first-child th.col-nome,
  thead tr:first-child th.col-mfd,
  thead tr:first-child th.col-obs{background-color:#1a6b3c !important;color:#fff !important;}
  thead tr:nth-child(2) th{background-color:#c6efce !important;color:#1a3a1a !important;font-size:8.5px;font-weight:bold;}
  th.col-num{width:28px;}
  th.col-nome{min-width:200px;text-align:left;padding-left:6px;}
  th.col-mfd{width:34px;background-color:#a8d5a2 !important;}
  th.col-obs{width:70px;}
  td.nc{text-align:center;font-size:9.5px;}
  td.nc-num{text-align:center;font-size:9.5px;font-weight:bold;}
  td.nc-nome{font-size:9.5px;padding-left:6px;font-weight:bold;letter-spacing:0.2px;}
  td.nc-obs{text-align:center;font-size:9px;font-weight:bold;}
  td.mt{background-color:#a8d5a2 !important;font-weight:bold;}
  td.mfd{background-color:#c6efce !important;}
  tbody tr:last-child td{border-bottom:1.5px solid #1a6b3c;}
  .legenda{margin-top:8px;font-size:9px;font-style:italic;color:#333;padding:2px 4px;border-top:1px solid #ccc;}
  .legenda b{font-style:normal;color:#000;}
  .footer{margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:18px;page-break-inside:avoid;break-inside:avoid;}
  .footer-loc{font-size:10px;flex:0 0 auto;align-self:flex-end;padding-bottom:2px;}
  .sigs{display:flex;justify-content:flex-end;flex:1;gap:30px;margin-top:34px;}
  .sig{text-align:center;min-width:170px;}
  .sig-line{border-top:1px solid #000;padding-top:3px;font-size:10px;font-weight:bold;}
  .sig-name{font-size:10px;font-weight:bold;margin-top:0;}
  @media print{
    html,body{height:auto;}
    body{padding:6px 8px;}
    @page{size:A4 landscape;margin:6mm 6mm;}
    .no-print{display:none;}
    table{page-break-inside:auto;}
    thead{display:table-header-group;}
    tr{page-break-inside:avoid;break-inside:avoid;}
  }
</style>
</head><body>
<div class="top-bar">
  <div class="visto">
    <div class="visto-title">VISTO</div>
    <div class="visto-data">Data ___/___/______</div>
    <div class="visto-cargo">A Chefe de Repartição e Ensino</div>
  </div>
  <div class="doc-header">
    <img src="${brasaoUrl}" alt="Brasão" onerror="this.style.display='none'"/>
    <div class="rep">${cabecalhoLinha1}</div>
    <div class="min">${cabecalhoLinha2}</div>
  </div>
</div>
<div class="doc-title">MINI-PAUTA — ${(disciplina || '').toUpperCase()}</div>
<div class="info-bar">
  <div class="row1">
    <div><span class="lbl">ESCOLA:</span> ${nomeEscola}</div>
    <div><span class="lbl">MUNICÍPIO DE:</span> ${municipio || '_________________'}</div>
    <div><span class="lbl">PROVÍNCIA DE:</span> ${provincia || '_________________'}</div>
  </div>
  <div class="row2">
    <div><span class="lbl">PAUTA Nº</span> ${numeroPauta} /${anoCorrente}</div>
    <div><span class="lbl">ANO LECTIVO:</span> ${anoLetivoCurto}</div>
    <div><span class="lbl">CLASSE:</span> ${nivelClasse}ª</div>
    <div><span class="lbl">TURMA:</span> ${turmaNome}</div>
    <div><span class="lbl">SALA:</span> ${sala}</div>
    <div><span class="lbl">TURNO:</span> ${turno || '—'}</div>
    <div><span class="lbl">Data:</span> ${dataHoje}</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th rowspan="2" class="col-num">Nº</th>
      <th rowspan="2" class="col-nome">NOME COMPLETO</th>
      <th colspan="4">1º TRIMESTRE</th>
      <th colspan="4">2º TRIMESTRE</th>
      <th colspan="4">3º TRIMESTRE</th>
      <th rowspan="2" class="col-mfd">MFD</th>
      <th rowspan="2" class="col-obs">OBSERVAÇÃO</th>
    </tr>
    <tr>
      <th>MAC</th><th>NPP</th><th>NPT</th><th>MT1</th>
      <th>MAC</th><th>NPP</th><th>NPT</th><th>MT2</th>
      <th>MAC</th><th>NPP</th><th>NPT</th><th>MT3</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('\n')}
  </tbody>
</table>
<div class="legenda">
  <b>Legenda:</b> MAC = Média das Avaliações Contínuas | NPP = Nota da Prova Parcial | NPT = Nota da Prova Trimestral | MT = Média Trimestral | MFD = Média Final do Ano
</div>
<div class="footer">
  <div class="footer-loc">${nomeEscola}, ${dataHoje}.</div>
  <div class="sigs">
    <div class="sig">
      <div class="sig-line">O(A) SUB-DIRECTOR(A) PEDAGÓGICO</div>
      <div class="sig-name">${dirPedNome}</div>
    </div>
    <div class="sig">
      <div class="sig-line">O(A) DIRECTOR(A) DA ESCOLA</div>
      <div class="sig-name">${dirGeralNome}</div>
    </div>
    <div class="sig">
      <div class="sig-line">O PROFESSOR</div>
      <div class="sig-name">_________________________</div>
    </div>
  </div>
</div>
${marcaAguaBase64 ? `<img src="${marcaAguaBase64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:55%;opacity:0.05;pointer-events:none;z-index:0;" alt="" />` : ''}
</body></html>`;
  }

  async function buildMiniPautaDisciplinaExcel(turmaId: string, disciplina: string) {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma || !disciplina) return;

    const alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));

    const notasDaTurma = notas.filter(n => n.turmaId === turmaId && n.disciplina === disciplina);
    const escola = config?.nomeEscola || '—';
    const anoLetivo = turma.anoLetivo;
    const now = new Date();

    const header1 = ['REPÚBLICA DE ANGOLA — MINISTÉRIO DA EDUCAÇÃO'];
    const header2 = [`MINI-PAUTA — ${disciplina} — ${turma.classe} ${turma.nome} — Ano Lectivo: ${anoLetivo}`];
    const header3 = [`Escola: ${escola}   Turno: ${turma.turno}   Data: ${now.toLocaleDateString('pt-AO')}`];
    const emptyRow: string[] = [];
    const colHeader = ['Nº', 'Nome do Aluno', 'MAC T1', 'NPP T1', 'NPT T1', 'MT1', 'MAC T2', 'NPP T2', 'NPT T2', 'MT2', 'MAC T3', 'NPP T3', 'NPT T3', 'MT3', 'MFD', 'Observação'];

    const notaMin = config?.notaMinimaAprovacao ?? 10;
    const dataRows = alunosDaTurma.map((aluno, idx) => {
      const get = (tr: number) => notasDaTurma.find(x => x.alunoId === aluno.id && x.trimestre === tr);
      const t1 = get(1); const t2 = get(2); const t3 = get(3);
      const mts = [t1?.mt1, t2?.mt1, t3?.mt1].filter((v): v is number => !!v && v > 0);
      const mfd = mts.length ? Math.round((mts.reduce((a, b) => a + b, 0) / mts.length) * 10) / 10 : null;
      return [
        idx + 1,
        `${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}`,
        t1?.mac || '', t1?.pp1 || '', t1?.ppt || '', t1?.mt1 ? Math.round(t1.mt1 * 10) / 10 : '',
        t2?.mac || '', t2?.pp1 || '', t2?.ppt || '', t2?.mt1 ? Math.round(t2.mt1 * 10) / 10 : '',
        t3?.mac || '', t3?.pp1 || '', t3?.ppt || '', t3?.mt1 ? Math.round(t3.mt1 * 10) / 10 : '',
        mfd !== null ? mfd : '',
        mfd !== null ? (mfd >= notaMin ? 'Aprovado' : 'Reprovado') : '',
      ];
    });

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const wsData = [header1, header2, header3, emptyRow, colHeader, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } },
    ];
    ws['!cols'] = [{ wch: 4 }, { wch: 32 }, ...Array(12).fill({ wch: 8 }), { wch: 6 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Mini-Pauta');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mini_Pauta_${disciplina}_${turma.classe}_${turma.nome}_${anoLetivo}.xlsx`.replace(/[/\s]/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Lista da Turma HTML Builder ──────────────────────────────────────────

  function buildListaTurmaHtml(turmaId: string): string {
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) return '';

    const now = new Date();
    const professor = professores.find(p => p.id === turma.professorId);
    const professorNome = professor ? `${professor.nome} ${professor.apelido || ''}`.trim() : '___________________________';
    const escolaNome = config.nomeEscola || '___________________________';
    const director = directorGeral;
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

    const alunosDaTurma = alunos
      .filter(a => a.ativo && a.turmaId === turmaId)
      .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`));

    function calcAge(dataNasc: string): number {
      if (!dataNasc) return 0;
      const birth = new Date(dataNasc);
      if (isNaN(birth.getTime())) return 0;
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
      return age;
    }

    function fmtDate(d: string): string {
      if (!d) return '';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('pt-PT');
    }

    const studentRows = alunosDaTurma.map((aluno, idx) => {
      const age = calcAge(aluno.dataNascimento);
      const bg = idx % 2 === 1 ? '#FFF9C4' : '#ffffff';
      return `<tr style="background:${bg};">
        <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
        <td style="text-align:left;padding-left:6px;">${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}</td>
        <td style="text-align:center;">${age > 0 ? age : ''}</td>
        <td style="text-align:center;">${aluno.genero || ''}</td>
        <td style="text-align:center;">${fmtDate(aluno.dataNascimento)}</td>
        <td style="text-align:center;">${aluno.telefoneEncarregado || ''}</td>
      </tr>`;
    }).join('');

    const total = alunosDaTurma.length;
    const masculinos = alunosDaTurma.filter(a => a.genero === 'M').length;
    const femininos = alunosDaTurma.filter(a => a.genero === 'F').length;
    const pctM = total > 0 ? Math.round((masculinos / total) * 100) : 0;
    const pctF = total > 0 ? Math.round((femininos / total) * 100) : 0;

    const idadeGroups = [10, 11, 12, 13, 14, 15, 16];

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Lista da Turma — ${turma.classe} ${turma.nome} ${turma.anoLetivo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px 30px; color: #000; }
    .header { text-align: center; margin-bottom: 12px; }
    .header p { margin: 1px 0; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .info-block { margin-bottom: 6px; font-size: 11px; }
    .info-row { display: flex; gap: 24px; margin-bottom: 3px; }
    .info-row span { white-space: nowrap; }
    .doc-title { text-align: center; font-size: 13px; font-weight: bold; text-decoration: underline; margin: 10px 0 8px; text-transform: uppercase; letter-spacing: 1px; }
    .main-table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 20px; }
    .main-table th { background: #00BCD4; color: #fff; font-style: italic; font-weight: bold; border: 1px solid #000; padding: 4px 6px; text-align: center; }
    .main-table td { border: 1px solid #000; padding: 3px 4px; }
    .main-table .num-col { width: 30px; }
    .main-table .name-col { width: 38%; }
    .stat-title { text-align: center; font-weight: bold; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; }
    .stat-table { border-collapse: collapse; margin: 0 auto; min-width: 340px; font-size: 11px; }
    .stat-table th { background: #00BCD4; color: #fff; font-style: italic; font-weight: bold; border: 1px solid #000; padding: 4px 8px; text-align: center; }
    .stat-table td { border: 1px solid #000; padding: 3px 8px; text-align: center; }
    .stat-label { background: #00BCD4; color: #fff; font-weight: bold; font-style: italic; text-align: center; }
    .stat-genero-label { background: #00BCD4; color: #fff; font-weight: bold; font-style: italic; text-align: center; }
    .total-row td { font-weight: bold; background: #e3f2fd; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 24px; font-size: 10px; }
    .sig-block { text-align: center; min-width: 160px; }
    .sig-line { width: 140px; border-top: 1px solid #000; margin: 30px auto 4px; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #0369a1; color: #fff; border: none; border-radius: 8px; padding: 10px 22px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999; }
    .print-btn:hover { background: #0284c7; }
    @media print {
      .print-btn { display: none !important; }
      body { margin: 15px 20px; }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
    <p>REPÚBLICA DE ANGOLA</p>
    <p>MINISTÉRIO DA EDUCAÇÃO</p>
    <p>ENSINO GERAL</p>
    <p style="margin-top:4px;">${escolaNome}</p>
  </div>

  <div class="info-block">
    <div class="info-row">
      <span><strong>${turma.classe}</strong></span>
      <span><strong>SALA:</strong> ${turma.sala || '___'}</span>
      <span><strong>TURMA:</strong> ${turma.nome}</span>
      <span><strong>PERÍODO:</strong> ${turma.turno.toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span><strong>PROFESSOR(A):</strong> ${professorNome}</span>
      <span><strong>ANO LECTIVO:</strong> ${turma.anoLetivo}</span>
    </div>
  </div>

  <div class="doc-title">Lista da Turma</div>

  <table class="main-table">
    <thead>
      <tr>
        <th class="num-col">Nº</th>
        <th class="name-col">NOME DO ALUNO</th>
        <th>IDADE</th>
        <th>SEXO</th>
        <th>DATA DE<br>NASCIMENTO</th>
        <th>CONTACTOS</th>
      </tr>
    </thead>
    <tbody>
      ${studentRows}
    </tbody>
  </table>

  <div class="stat-title">Mapa Estatístico</div>
  <table class="stat-table">
    <thead>
      <tr>
        <th colspan="2"></th>
        <th>Nº DE ALUNOS</th>
        <th>VALOR PERCENTUAL</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td rowspan="2" class="stat-genero-label">GÉNERO</td>
        <td class="stat-genero-label" style="font-style:italic;font-weight:bold;">MASCULINO</td>
        <td>${masculinos}</td>
        <td>${pctM}%</td>
      </tr>
      <tr>
        <td class="stat-genero-label" style="font-style:italic;font-weight:bold;">FEMENINO</td>
        <td>${femininos}</td>
        <td>${pctF}%</td>
      </tr>
      ${idadeGroups.map((age, i) => {
        const count = alunosDaTurma.filter(a => calcAge(a.dataNascimento) === age).length;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        if (i === 0) {
          return `<tr>
            <td rowspan="${idadeGroups.length}" class="stat-label">IDADE</td>
            <td class="stat-label" style="font-style:italic;font-weight:bold;">${age} ANOS</td>
            <td>${count}</td>
            <td>${pct}%</td>
          </tr>`;
        }
        return `<tr>
          <td class="stat-label" style="font-style:italic;font-weight:bold;">${age} ANOS</td>
          <td>${count}</td>
          <td>${pct}%</td>
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td colspan="2" style="font-weight:bold;background:#e3f2fd;">TOTAL DE ALUNOS</td>
        <td colspan="2" style="font-weight:bold;background:#e3f2fd;">${total}</td>
      </tr>
    </tbody>
  </table>

  <div class="sig-row">
    <div class="sig-block">
      <div>O PROFESSOR DIRECTOR DE TURMA</div>
      <div class="sig-line"></div>
      <div>${professorNome}</div>
    </div>
    <div class="sig-block">
      <div>${dataActual}</div>
      <div class="sig-line"></div>
      <div>${director}</div>
      <div>O(A) DIRECTOR(A)</div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
</body>
</html>`;
  }

  // Insert variable into editor at cursor (web-aware)
  function insertVariable(tag: string) {
    if (Platform.OS === 'web' && tinyEditorRef.current) {
      tinyEditorRef.current.insertContent(tag);
      return;
    }
    if (Platform.OS === 'web' && quillIframeRef.current) {
      quillIframeRef.current.contentWindow?.postMessage({ type: 'ck_insert', text: tag }, '*');
      return;
    }
    if (Platform.OS === 'web') {
      const el = (inputRef.current as any)?._inputRef?.current as HTMLTextAreaElement | null
        || document.activeElement as HTMLTextAreaElement | null;
      if (el && el.tagName === 'TEXTAREA') {
        const start = el.selectionStart ?? editorContent.length;
        const end = el.selectionEnd ?? editorContent.length;
        const next = editorContent.slice(0, start) + tag + editorContent.slice(end);
        setEditorContent(next);
        setTimeout(() => {
          el.selectionStart = el.selectionEnd = start + tag.length;
          el.focus();
        }, 0);
        return;
      }
    }
    setEditorContent(prev => prev + tag);
  }

  // Fill variables for a given student
  function buildPreview(template: DocTemplate, alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return template.conteudo;
    const turma = turmas.find(t => t.id === aluno.turmaId);
    const now = new Date();

    // Resolve cycle from nivel
    const cicloMap: Record<string, string> = {
      'Primário': 'Ensino Primário',
      'I Ciclo': 'Iº Ciclo',
      'II Ciclo': 'IIº Ciclo',
    };

    // Build nota lookup: disciplina (lowercase) → nf for this student
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);
    const notaByDisciplina: Record<string, number> = {};
    for (const n of alunoNotas) {
      notaByDisciplina[n.disciplina.toLowerCase().trim()] = n.nf;
    }

    // Helper: find nota by variable tag
    function resolveNota(tag: string): string {
      const candidates = DISCIPLINA_NOTA_MAP[tag] || [];
      for (const candidate of candidates) {
        const v = notaByDisciplina[candidate];
        if (v !== undefined) return String(Math.round(v));
      }
      const direct = alunoNotas.find(n => buildNotaTagFromDisciplina(n.disciplina) === tag);
      if (direct?.nf !== undefined) return String(Math.round(direct.nf));
      return '____';
    }

    // ── Smart grade table generator ─────────────────────────────────────────
    // Resolve classe de cada nota (via turma ou fallback por anoLetivo)
    const _anoLetivosAluno = [...new Set(
      alunoNotas.filter(n => n.nf > 0 && n.disciplina).map(n => n.anoLetivo)
    )].sort();
    const _anoToClasse: Record<string, string> = {};
    {
      const _cicloClasses = ['10', '11', '12'];
      const _offset = Math.max(0, _anoLetivosAluno.length - 3);
      _anoLetivosAluno.slice(_offset).forEach((ano, i) => { _anoToClasse[ano] = _cicloClasses[i]; });
    }
    function _resolveClasse(n: any): string {
      const t = turmas.find((tr: any) => tr.id === n.turmaId);
      if (t?.classe) {
        const cn = String(t.classe).replace(/[^\d]/g, '').slice(0, 2);
        if (cn) return cn;
      }
      return _anoToClasse[n.anoLetivo] || '';
    }

    // Collect unique disciplines with final grade > 0, sorted alphabetically
    const discMap: Record<string, number> = {};
    for (const n of alunoNotas) {
      if (n.nf > 0) {
        const key = n.disciplina.trim();
        // Keep highest nf per discipline
        if (!discMap[key] || n.nf > discMap[key]) discMap[key] = n.nf;
      }
    }
    const discList = Object.keys(discMap).sort((a, b) => a.localeCompare(b, 'pt'));

    const numExtensoLocal = (n: number): string => {
      const m: Record<number, string> = {
        0:'Zero',1:'Um',2:'Dois',3:'Três',4:'Quatro',5:'Cinco',
        6:'Seis',7:'Sete',8:'Oito',9:'Nove',10:'Dez',11:'Onze',
        12:'Doze',13:'Treze',14:'Catorze',15:'Quinze',16:'Dezasseis',
        17:'Dezassete',18:'Dezoito',19:'Dezanove',20:'Vinte',
      };
      return m[Math.round(n)] ?? String(Math.round(n));
    };

    const thS = 'padding:7px 10px;border:1px solid #555;background:#1a2540;color:#fff;text-align:left;font-size:12px;font-family:"Times New Roman",serif;';
    const tdS = (i: number) => `padding:6px 10px;border:1px solid #ccc;font-family:"Times New Roman",serif;background:${i % 2 === 0 ? '#fff' : '#f5f6fb'};`;
    const noDataRow = (cols: number) =>
      `<tr><td colspan="${cols}" style="padding:10px;text-align:center;color:#aaa;font-style:italic;border:1px solid #ccc;">Sem notas lançadas</td></tr>`;

    const mediaVals = discList.map(d => discMap[d]);
    const mediaGeral = mediaVals.length > 0
      ? Math.round(mediaVals.reduce((s, v) => s + v, 0) / mediaVals.length)
      : null;

    // Full table: agrupa por classe (10ª/11ª/12ª) se o aluno tiver notas em múltiplas classes
    const tabelaNotas = (() => {
      // Detectar se há notas em múltiplas classes do II Ciclo
      const classesDetectadas = new Set<string>();
      const gradesByClasseMap: Record<string, Record<string, number>> = {}; // classe→disc→nf
      for (const n of alunoNotas) {
        if (n.nf <= 0 || !n.disciplina) continue;
        const cls = _resolveClasse(n);
        if (!cls) continue;
        classesDetectadas.add(cls);
        if (!gradesByClasseMap[cls]) gradesByClasseMap[cls] = {};
        const key = n.disciplina.trim();
        if (!gradesByClasseMap[cls][key] || n.nf > gradesByClasseMap[cls][key]) {
          gradesByClasseMap[cls][key] = n.nf;
        }
      }

      const II_CICLO = ['10', '11', '12'];
      const classesII = II_CICLO.filter(c => classesDetectadas.has(c));

      // Tabela agrupada por classe do II Ciclo (quando há ≥2 classes)
      if (classesII.length >= 2) {
        const allDiscsII = new Set<string>();
        classesII.forEach(c => Object.keys(gradesByClasseMap[c] || {}).forEach(d => allDiscsII.add(d)));
        const discsII = [...allDiscsII].sort((a, b) => a.localeCompare(b, 'pt'));
        const thSII = 'padding:6px 8px;border:1px solid #555;background:#1a2540;color:#fff;text-align:center;font-size:11px;font-family:"Times New Roman",serif;';
        const tdSII = (i: number) => `padding:5px 8px;border:1px solid #ccc;font-family:"Times New Roman",serif;background:${i % 2 === 0 ? '#fff' : '#f5f6fb'};font-size:12px;`;
        const classCols = classesII.map(c => `<th style="${thSII}width:70px;">${c}.ª Classe</th>`).join('');
        const colCount = classesII.length + 3;
        const rows = discsII.length === 0 ? noDataRow(colCount) : discsII.map((disc, i) => {
          const grades = classesII.map(c => gradesByClasseMap[c]?.[disc] ?? null);
          const valid = grades.filter(g => g !== null) as number[];
          const media = valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
          const gradesCols = grades.map(g =>
            g !== null
              ? `<td style="${tdSII(i)}text-align:center;font-weight:bold;">${Math.round(g)}</td>`
              : `<td style="${tdSII(i)}text-align:center;color:#aaa;font-size:10px;">—</td>`
          ).join('');
          return `<tr>
            <td style="${tdSII(i)}">${disc}</td>
            ${gradesCols}
            <td style="${tdSII(i)}text-align:center;font-weight:bold;">${media !== null ? media : '—'}</td>
            <td style="${tdSII(i)}">${media !== null ? numExtensoLocal(media) + ' Valores' : '—'}</td>
          </tr>`;
        }).join('');
        const allMediasII = discsII.map(d => {
          const vals = classesII.map(c => gradesByClasseMap[c]?.[d] ?? null).filter(g => g !== null) as number[];
          return vals.length > 0 ? Math.round(vals.reduce((a,b) => a+b,0)/vals.length) : null;
        }).filter(m => m !== null) as number[];
        const mediaGeralII = allMediasII.length > 0 ? Math.round(allMediasII.reduce((a,b) => a+b,0)/allMediasII.length) : null;
        const mediaRow = mediaGeralII !== null
          ? `<tr style="background:#eef2ff;"><td colspan="${classesII.length + 1}" style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;font-family:'Times New Roman',serif;text-align:right;">Média Final</td><td style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;text-align:center;">${mediaGeralII}</td><td style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;">${numExtensoLocal(mediaGeralII)} Valores</td></tr>`
          : '';
        return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;">
          <thead><tr>
            <th style="${thSII}text-align:left;">Disciplina</th>
            ${classCols}
            <th style="${thSII}width:60px;">Média</th>
            <th style="${thSII}">Por Extenso</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          ${mediaRow ? `<tfoot>${mediaRow}</tfoot>` : ''}
        </table>`;
      }

      // Tabela simples (aluno com notas de uma única classe)
      const rows = discList.length === 0 ? noDataRow(4) : discList.map((disc, i) => {
        const nota = discMap[disc];
        const ext = numExtensoLocal(nota);
        const ok = nota >= 10;
        return `<tr>
          <td style="${tdS(i)}">${disc}</td>
          <td style="${tdS(i)}text-align:center;font-weight:bold;">${nota}</td>
          <td style="${tdS(i)}">${ext} Valores</td>
          <td style="${tdS(i)}text-align:center;font-weight:bold;color:${ok ? '#166534' : '#991b1b'};">${ok ? 'Aprovado' : 'Reprovado'}</td>
        </tr>`;
      }).join('');
      const mediaRow = mediaGeral !== null
        ? `<tr style="background:#eef2ff;"><td colspan="2" style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;font-family:'Times New Roman',serif;">Média Final</td><td colspan="2" style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;font-family:'Times New Roman',serif;">${mediaGeral} — ${numExtensoLocal(mediaGeral)} Valores</td></tr>`
        : '';
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
        <thead><tr>
          <th style="${thS}">Disciplina</th>
          <th style="${thS}text-align:center;width:55px;">Nota</th>
          <th style="${thS}">Por Extenso</th>
          <th style="${thS}text-align:center;width:90px;">Resultado</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        ${mediaRow ? `<tfoot>${mediaRow}</tfoot>` : ''}
      </table>`;
    })();

    // Simple table: Disciplina | Nota
    const tabelaNotasSimples = (() => {
      const rows = discList.length === 0 ? noDataRow(2) : discList.map((disc, i) => {
        const nota = discMap[disc];
        return `<tr>
          <td style="${tdS(i)}">${disc}</td>
          <td style="${tdS(i)}text-align:center;font-weight:bold;">${nota}</td>
        </tr>`;
      }).join('');
      const mediaRow = mediaGeral !== null
        ? `<tr style="background:#eef2ff;"><td style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;font-family:'Times New Roman',serif;">Média Final</td><td style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;text-align:center;font-family:'Times New Roman',serif;">${mediaGeral}</td></tr>`
        : '';
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
        <thead><tr>
          <th style="${thS}">Disciplina</th>
          <th style="${thS}text-align:center;width:60px;">Nota</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        ${mediaRow ? `<tfoot>${mediaRow}</tfoot>` : ''}
      </table>`;
    })();

    // Multi-column table builder: groups disciplines into N side-by-side pairs (Disciplina | Nota)
    function buildTabelaMultiCol(numCols: number): string {
      if (discList.length === 0) {
        return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;"><tbody>${noDataRow(numCols * 2)}</tbody></table>`;
      }
      const sepTd = `<td style="padding:0 4px;border:none;width:8px;"></td>`;
      // Widths per column group
      const discW = Math.floor((100 - (numCols - 1) * 2) / numCols * 0.78);
      const notaW = Math.floor((100 - (numCols - 1) * 2) / numCols * 0.22);
      const rows: string[] = [];
      for (let r = 0; r < discList.length; r += numCols) {
        const cells: string[] = [];
        for (let c = 0; c < numCols; c++) {
          const idx = r + c;
          const bg = r % 2 === 0 ? '#fff' : '#f5f6fb';
          const tdBase = `padding:5px 8px;border:1px solid #ccc;background:${bg};font-family:'Times New Roman',serif;`;
          if (idx < discList.length) {
            const disc = discList[idx];
            const nota = discMap[disc];
            cells.push(`<td style="${tdBase}width:${discW}%;">${disc}</td>`);
            cells.push(`<td style="${tdBase}text-align:center;font-weight:bold;width:${notaW}%;">${nota}</td>`);
          } else {
            // Invisible filler — no border, no background, no content
            cells.push(`<td style="padding:5px 8px;border:none;background:transparent;width:${discW}%;"></td>`);
            cells.push(`<td style="padding:5px 8px;border:none;background:transparent;width:${notaW}%;"></td>`);
          }
          if (c < numCols - 1) cells.push(sepTd);
        }
        rows.push(`<tr>${cells.join('')}</tr>`);
      }
      const mediaRow = mediaGeral !== null
        ? (() => {
            const totalCols = numCols * 2 + (numCols - 1);
            return `<tr style="background:#eef2ff;"><td colspan="${totalCols}" style="padding:6px 10px;border:1px solid #aaa;font-weight:bold;text-align:right;font-family:'Times New Roman',serif;">Média Geral: ${mediaGeral} — ${numExtensoLocal(mediaGeral)} Valores</td></tr>`;
          })()
        : '';
      return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;">
        <tbody>${rows.join('')}${mediaRow}</tbody>
      </table>`;
    }

    const tabelaNotas2Col = buildTabelaMultiCol(2);
    const tabelaNotas3Col = buildTabelaMultiCol(3);

    // Comportamento — derived from disciplinary occurrences (leve/moderada/grave → Bom/Regular/Mau)
    const alunoOcos = ocorrencias.filter(o => o.alunoId === aluno.id);
    const comportamentoValor = computeComportamento(alunoOcos);

    // Horizontal table: row of disciplines (header) + row of grades (Boletim format)
    const tabelaNotasHorizontal = (() => {
      if (discList.length === 0) {
        return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;font-family:'Times New Roman',serif;"><tbody><tr><td style="padding:6px;border:1px solid #000;text-align:center;color:#666;">Sem notas registadas para este aluno.</td></tr></tbody></table>`;
      }
      const headerCells = `<th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:left;font-family:'Times New Roman',serif;font-size:12px;">Disciplina</th>` +
        discList.map(d => `<th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-family:'Times New Roman',serif;font-size:12px;">${d}</th>`).join('') +
        `<th style="padding:5px 6px;border:1px solid #000;background:#fff;font-weight:bold;text-align:center;font-family:'Times New Roman',serif;font-size:12px;">Comport.</th>`;
      const dataCells = `<td style="padding:5px 6px;border:1px solid #000;font-family:'Times New Roman',serif;font-size:12px;">Notas</td>` +
        discList.map(d => {
          const nota = discMap[d];
          const isPositiva = nota >= 10;
          const corNota = isPositiva ? '#166534' : '#991b1b';
          return `<td style="padding:5px 6px;border:1px solid #000;text-align:center;font-weight:bold;font-family:'Times New Roman',serif;font-size:12px;color:${corNota};">${nota}</td>`;
        }).join('') +
        `<td style="padding:5px 6px;border:1px solid #000;text-align:center;font-family:'Times New Roman',serif;font-size:12px;">${comportamentoValor}</td>`;
      return `<table style="width:100%;border-collapse:collapse;margin:10px 0;"><thead><tr>${headerCells}</tr></thead><tbody><tr>${dataCells}</tr></tbody></table>`;
    })();

    const map: Record<string, string> = {
      '{{NOME_COMPLETO}}': `${aluno.nome} ${aluno.apelido}`,
      '{{NOME}}': aluno.nome,
      '{{APELIDO}}': aluno.apelido,
      '{{DATA_NASCIMENTO}}': aluno.dataNascimento
        ? new Date(aluno.dataNascimento).toLocaleDateString('pt-PT') : '',
      '{{GENERO}}': aluno.genero === 'M' ? 'Masculino' : 'Feminino',
      '{{PROVINCIA}}': aluno.provincia || '',
      '{{MUNICIPIO}}': aluno.municipio || '',
      '{{NATURALIDADE}}': aluno.municipio || '',
      '{{NUMERO_MATRICULA}}': aluno.numeroMatricula || '',
      '{{NOME_ENCARREGADO}}': aluno.nomeEncarregado || '',
      '{{PAI}}': (aluno as any).nomePai || '________________________',
      '{{MAE}}': (aluno as any).nomeMae || '________________________',
      '{{DIA_NASC}}': aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getDate()) : '__',
      '{{MES_NASC}}': aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '__________',
      '{{ANO_NASC}}': aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getFullYear()) : '____',
      '{{BI_NUMERO}}': (aluno as any).numeroBi || '________________________',
      '{{BI_DATA_EMISSAO}}': (aluno as any).biDataEmissao || '________________________',
      '{{BI_LOCAL_EMISSAO}}': (aluno as any).biLocalEmissao || '________________________',
      '{{ENCARREGADO_PROFISSAO}}': (aluno as any).encarregadoProfissao || '________________________',
      '{{ENCARREGADO_LOCAL_TRABALHO}}': (aluno as any).encarregadoLocalTrabalho || '________________________',
      '{{ENCARREGADO_RESIDENCIA}}': (aluno as any).encarregadoResidencia || '________________________',
      '{{ENCARREGADO_CONTACTO2}}': (aluno as any).encarregadoContacto2 || '________________________',
      '{{TELEFONE_ENCARREGADO}}': aluno.telefoneEncarregado || '',
      '{{TURMA}}': turma?.nome || '',
      '{{SALA}}': turma?.sala || '',
      '{{CLASSE}}': turma ? `${turma.classe} Classe` : '',
      '{{NIVEL}}': turma?.nivel || '',
      '{{CICLO}}': turma ? (cicloMap[turma.nivel] || turma.nivel) : '',
      '{{TURNO}}': turma?.turno || '',
      '{{ANO_LECTIVO}}': turma?.anoLetivo || new Date().getFullYear().toString(),
      '{{NOME_DIRECTOR_TURMA}}': (() => {
        if (!turma?.professorId) return '___________________________';
        const prof = professores.find(p => p.id === turma.professorId);
        return prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : '___________________________';
      })(),
      '{{COMPORTAMENTO}}': comportamentoValor,
      '{{AREA}}': (() => {
        const areaDir = (turma as any)?.areaFormacao;
        if (areaDir) return areaDir;
        const cursoObj = cursos?.find((c: any) => c.id === (turma as any)?.cursoId);
        return cursoObj?.areaFormacao || cursoObj?.nome || '________________________';
      })(),
      '{{AREA_FORMACAO}}': (() => {
        const areaDir = (turma as any)?.areaFormacao;
        if (areaDir) return areaDir;
        const cursoObj = cursos?.find((c: any) => c.id === (turma as any)?.cursoId);
        return cursoObj?.areaFormacao || cursoObj?.nome || '________________________';
      })(),
      '{{CURSO}}': (() => {
        const cursoObj = cursos?.find((c: any) => c.id === (turma as any)?.cursoId);
        return cursoObj?.nome || (turma as any)?.areaFormacao || '________________________';
      })(),
      '{{CLASSE_NUMERO}}': turma?.classe ? String(turma.classe).replace(/[^\d]/g, '') : '___',
      '{{CLASSE_TEXTO}}': turma?.classe ? `${turma.classe} Classe` : '___',
      '{{MUNICIPIO_TITULO}}': (() => {
        const mun = aluno.municipio || (config as any).municipio || '';
        return mun ? `Administração Municipal de ${mun}` : '____________________________';
      })(),
      '{{TELEFONE_ALUNO}}': (aluno as any).telefone || (aluno as any).contacto || '',
      '{{CONTACTO_ALUNO}}': (aluno as any).contacto || (aluno as any).telefone || '',
      '{{RESULTADO}}': mediaGeral !== null ? (mediaGeral >= 10 ? 'APROVADO' : 'REPROVADO') : 'APTO',
      '{{RESULTADO_LETRA}}': mediaGeral !== null ? (mediaGeral >= 10 ? 'A' : 'R') : 'A',
      '{{PAUTA_NUMERO}}': '____',
      '{{PROCESSO_NUMERO}}': aluno.numeroMatricula || '____',
      '{{CODIGO_BARRAS}}': (() => {
        const mat = aluno.numeroMatricula || aluno.id?.slice(0,10) || 'SEM-MATRICULA';
        const svg = generateCode39Svg(mat, 110, 24);
        return svg ? `<div style="display:inline-block;text-align:center;"><div style="font-size:8px;color:#555;margin-bottom:2px;">Nº ${mat}</div>${svg}</div>` : '';
      })(),
      '{{QR_CODE}}': (() => {
        const nome = `${aluno.nome} ${aluno.apelido || ''}`.trim().toUpperCase();
        const area = ((turma as any)?.areaFormacao || '').toUpperCase() || '___';
        const anoLetivo = turma?.anoLetivo || String(new Date().getFullYear());
        const escola = (config.nomeEscola || '').toUpperCase();
        const mat = aluno.numeroMatricula || aluno.id?.slice(0, 8) || '';
        const qrLines = [
          'CERT. HABILITACOES II CICLO',
          `ESCOLA: ${escola}`,
          `ALUNO: ${nome}`,
          `MATRICULA: ${mat}`,
          `AREA: ${area}`,
          `ANO LECTIVO: ${anoLetivo}`,
          `FINALISTA: SIM`,
        ].join('\n');
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=65x65&data=${encodeURIComponent(qrLines)}&bgcolor=ffffff&color=000000&margin=4`;
        return `<img src="${url}" alt="QR Code" style="width:65px;height:65px;display:block;margin:0 auto;" />`;
      })(),
      '{{NOME_ESCOLA}}': config.nomeEscola || '',
      '{{NOME_ESCOLA_CURTA}}': config.nomeEscola || '',
      '{{ANO_LECTIVO_ANO}}': (() => {
        const al = turma?.anoLetivo || String(new Date().getFullYear());
        return al.includes('/') ? al.split('/').pop()!.trim() : al;
      })(),
      '{{NOME_DIRECTOR}}': directorGeral,
      '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
      '{{NOME_DIRECTOR_PEDAGOGICO}}': directorPedagogico,
      '{{NOME_DIRECTOR_PROVINCIAL}}': directorProvincialEducacao,
      '{{CHEFE_SECRETARIA}}': (config as any).chefeSecretaria || '___________________________',
      '{{DATA_ACTUAL}}': `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`,
      '{{MES_ACTUAL}}': MESES[now.getMonth()],
      '{{ANO_ACTUAL}}': now.getFullYear().toString(),
      // Grade variables — auto-resolved from notas, fallback to blank
      '{{NOTA_LP}}': resolveNota('{{NOTA_LP}}'),
      '{{NOTA_LE}}': resolveNota('{{NOTA_LE}}'),
      '{{NOTA_MAT}}': resolveNota('{{NOTA_MAT}}'),
      '{{NOTA_INF}}': resolveNota('{{NOTA_INF}}'),
      '{{NOTA_EF}}': resolveNota('{{NOTA_EF}}'),
      '{{NOTA_HIS}}': resolveNota('{{NOTA_HIS}}'),
      '{{NOTA_GEO}}': resolveNota('{{NOTA_GEO}}'),
      '{{NOTA_INTRO_DIR}}': resolveNota('{{NOTA_INTRO_DIR}}'),
      '{{NOTA_INTRO_ECO}}': resolveNota('{{NOTA_INTRO_ECO}}'),
      '{{NOTA_DIR}}': resolveNota('{{NOTA_DIR}}'),
      '{{NOTA_ECO}}': resolveNota('{{NOTA_ECO}}'),
      '{{NOTA_GEST}}': resolveNota('{{NOTA_GEST}}'),
      '{{NOTA_CONT}}': resolveNota('{{NOTA_CONT}}'),
      '{{NOTA_FIL}}': resolveNota('{{NOTA_FIL}}'),
      '{{NOTA_DIR_COM}}': resolveNota('{{NOTA_DIR_COM}}'),
      '{{NOTA_ECO_POL}}': resolveNota('{{NOTA_ECO_POL}}'),
      '{{NOTA_CONT_GEST}}': resolveNota('{{NOTA_CONT_GEST}}'),
      '{{NOTA_EMPREEND}}': resolveNota('{{NOTA_EMPREEND}}'),
      '{{NOTA_DIR_EMP}}': resolveNota('{{NOTA_DIR_EMP}}'),
      '{{NOTA_ECO_AV}}': resolveNota('{{NOTA_ECO_AV}}'),
      '{{NOTA_GEST_FIN}}': resolveNota('{{NOTA_GEST_FIN}}'),
      '{{NOTA_CONT_AV}}': resolveNota('{{NOTA_CONT_AV}}'),
      // PAP — Prova de Aptidão Profissional (13ª Classe)
      '{{NOTA_PAP}}': papAlunoData?.notaPAP != null ? String(papAlunoData.notaPAP) : '____',
      '{{NOTA_PAP_EXTENSO}}': papAlunoData?.notaPAP != null ? `${numExtensoLocal(papAlunoData.notaPAP)} Valores` : '________',
      '{{NOTA_ESTAGIO}}': papAlunoData?.notaEstagio != null ? String(papAlunoData.notaEstagio) : '____',
      '{{NOTA_DEFESA}}': papAlunoData?.notaDefesa != null ? String(papAlunoData.notaDefesa) : '____',
      // Smart table variables — resolved from actual student grades
      '{{TABELA_NOTAS}}': tabelaNotas,
      '{{TABELA_NOTAS_SIMPLES}}': tabelaNotasSimples,
      '{{TABELA_NOTAS_2COL}}': tabelaNotas2Col,
      '{{TABELA_NOTAS_3COL}}': tabelaNotas3Col,
      '{{TABELA_NOTAS_HORIZONTAL}}': tabelaNotasHorizontal,
      '{{TABELA_NOTAS_II_CICLO}}': (() => {
        const anoLetivoTurma = turma?.anoLetivo || '';
        const turmaIdAluno = String((aluno as any).turmaId || '');
        // Filtro em cascata: ambos → só turmaId → só anoLetivo → mais recente do aluno
        let notasTurma = turmaIdAluno && anoLetivoTurma
          ? alunoNotas.filter((n: any) => String(n.turmaId) === turmaIdAluno && String(n.anoLetivo) === anoLetivoTurma)
          : [];
        if (notasTurma.length === 0 && turmaIdAluno) {
          notasTurma = alunoNotas.filter((n: any) => String(n.turmaId) === turmaIdAluno);
        }
        if (notasTurma.length === 0 && anoLetivoTurma) {
          notasTurma = alunoNotas.filter((n: any) => String(n.anoLetivo) === anoLetivoTurma);
        }
        if (notasTurma.length === 0 && alunoNotas.length > 0) {
          const anosDisponiveis = [...new Set(alunoNotas.map((n: any) => String(n.anoLetivo || '')).filter(Boolean))].sort();
          const maisRecente = anosDisponiveis[anosDisponiveis.length - 1];
          notasTurma = maisRecente ? alunoNotas.filter((n: any) => String(n.anoLetivo) === maisRecente) : alunoNotas;
        }
        const disciplinas = [...new Set(notasTurma.map((n: any) => String(n.disciplina || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
        // Formata valor numérico: mostra '' quando 0/null/undefined
        const fmtN = (v: any): string => {
          const n = Number(v);
          return (!isNaN(n) && n > 0) ? String(Math.round(n * 10) / 10) : '';
        };
        // MAC = mac → mac1 → média de aval1-aval8 → mt1 (nota trimestral lançada directamente) → nf
        const getMac = (nota: any): string => {
          if (!nota) return '';
          const pos = (v: any) => { const n = Number(v); return !isNaN(n) && n > 0 ? n : 0; };
          const m1 = pos(nota.mac);
          if (m1 > 0) return String(Math.round(m1 * 10) / 10);
          const m2 = pos(nota.mac1);
          if (m2 > 0) return String(Math.round(m2 * 10) / 10);
          // Fallback 1: média dos avais brutos (aval1-aval8)
          const avals = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8']
            .map(k => pos(nota[k])).filter(v => v > 0);
          if (avals.length > 0) {
            const avg = avals.reduce((a: number, b: number) => a + b, 0) / avals.length;
            return String(Math.round(avg * 10) / 10);
          }
          // Fallback 2: mt1 (nota trimestral lançada directamente sem separação MAC/NPT)
          const mt = pos(nota.mt1);
          if (mt > 0) return String(Math.round(mt * 10) / 10);
          // Fallback 3: nf (nota final trimestral)
          const nf = pos(nota.nf);
          if (nf > 0) return String(Math.round(nf * 10) / 10);
          return '';
        };
        // NPT = ppt na BD (Nota Prova Trimestral) — NÃO usar pp1 (que é NPP/Prova do Professor)
        // NPT = ppt → pp1 → (fallback quando MAC também não tem valor próprio) mt1 → nf
        const getNpt = (nota: any): string => {
          if (!nota) return '';
          const pos = (v: any) => { const n = Number(v); return !isNaN(n) && n > 0 ? n : 0; };
          const ppt = pos(nota.ppt);
          if (ppt > 0) return String(Math.round(ppt * 10) / 10);
          const pp1 = pos(nota.pp1);
          if (pp1 > 0) return String(Math.round(pp1 * 10) / 10);
          // Fallback: só quando o MAC também não tem valor próprio (nota lançada como mt1/nf único)
          const hasMac = pos(nota.mac) > 0 || pos(nota.mac1) > 0;
          if (!hasMac) {
            const mt = pos(nota.mt1);
            if (mt > 0) return String(Math.round(mt * 10) / 10);
            const nf = pos(nota.nf);
            if (nf > 0) return String(Math.round(nf * 10) / 10);
          }
          return '';
        };
        // MT = mt1 (Nota Trimestral); fallback para nf quando mt1=0
        const getMt = (nota: any): string => {
          if (!nota) return '';
          const mt = Number(nota.mt1);
          if (!isNaN(mt) && mt > 0) return String(Math.round(mt * 10) / 10);
          const nf = Number(nota.nf);
          return (!isNaN(nf) && nf > 0) ? String(Math.round(nf * 10) / 10) : '';
        };
        const thC2 = 'border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;';
        const tdN2 = 'border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;';
        const tdD2 = 'border:1px solid #000;padding:3px 5px;text-align:left;font-size:9pt;';
        const tdV2 = 'border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;min-width:28px;';
        const tdO2 = 'border:1px solid #000;padding:3px 4px;text-align:left;font-size:8pt;';
        if (disciplinas.length === 0) {
          return `<table style="width:100%;border-collapse:collapse;font-size:9pt;"><tbody><tr><td colspan="12" style="border:1px solid #000;padding:8px;text-align:center;color:#666;font-style:italic;">Sem notas registadas neste ano lectivo</td></tr></tbody></table>`;
        }
        // Validação: detectar notas em falta por disciplina e trimestre
        const alertas: string[] = [];
        disciplinas.forEach(disc => {
          [1, 2, 3].forEach(tr => {
            const n = notasTurma.find((x: any) => x.disciplina === disc && Number(x.trimestre) === tr);
            if (!n) {
              alertas.push(`${disc} — ${tr}º Trimestre: sem registo`);
            } else if (getMt(n) === '' && getMac(n) === '') {
              alertas.push(`${disc} — ${tr}º Trimestre: nota em falta (MT e MAC a zero)`);
            } else if (getMac(n) === '' && getMt(n) !== '') {
              alertas.push(`${disc} — ${tr}º Trimestre: MAC em falta`);
            }
          });
        });
        const alertaHtml = alertas.length > 0
          ? `<div style="margin-top:8px;padding:6px 10px;border:1px solid #c0392b;background:#fff5f5;border-radius:3px;font-size:8pt;color:#c0392b;font-family:Arial,sans-serif;">
               <strong>⚠ Notas em falta (${alertas.length}):</strong><br/>${alertas.map(a => `• ${a}`).join('<br/>')}
             </div>`
          : '';
        // Nota mínima de aprovação (configurável; padrão Angola MED = 10)
        const notaMinTable = Number((config as any)?.notaMinimaAprovacao ?? 10) || 10;

        // Calcula OBS por disciplina — norma Angola MED
        function calcObsDisc(mt1Str: string, mt2Str: string, mt3Str: string): { html: string } {
          const vals = [mt1Str, mt2Str, mt3Str].map(s => parseFloat(s)).filter(n => !isNaN(n) && n > 0);
          if (vals.length === 0) return { html: '' };
          const mfd = vals.reduce((a, b) => a + b, 0) / vals.length;
          const mfdArred = Math.round(mfd);
          const definitivo = vals.length === 3;
          const passa = mfdArred >= notaMinTable;
          if (passa) {
            return definitivo
              ? { html: `<span style="color:#1b5e20;font-weight:bold;font-size:7.5pt;letter-spacing:.2px;">TRANSITA</span>` }
              : { html: `<span style="color:#2e7d32;font-style:italic;font-size:7pt;" title="Provisório">TRANSITA*</span>` };
          } else {
            return definitivo
              ? { html: `<span style="color:#b71c1c;font-weight:bold;font-size:7.5pt;letter-spacing:.2px;">NÃO TRANSITA</span>` }
              : { html: `<span style="color:#c62828;font-style:italic;font-size:7pt;" title="Provisório">NÃO TRANSITA*</span>` };
          }
        }

        const linhas = disciplinas.map((disc, i) => {
          const t1 = notasTurma.find((n: any) => n.disciplina === disc && Number(n.trimestre) === 1);
          const t2 = notasTurma.find((n: any) => n.disciplina === disc && Number(n.trimestre) === 2);
          const t3 = notasTurma.find((n: any) => n.disciplina === disc && Number(n.trimestre) === 3);
          const mt1s = getMt(t1); const mt2s = getMt(t2); const mt3s = getMt(t3);
          const obs = calcObsDisc(mt1s, mt2s, mt3s);
          return `<tr><td style="${tdN2}">${i + 1}</td><td style="${tdD2}">${disc}</td><td style="${tdV2}">${getMac(t1)}</td><td style="${tdV2}">${getNpt(t1)}</td><td style="${tdV2}">${mt1s}</td><td style="${tdV2}">${getMac(t2)}</td><td style="${tdV2}">${getNpt(t2)}</td><td style="${tdV2}">${mt2s}</td><td style="${tdV2}">${getMac(t3)}</td><td style="${tdV2}">${getNpt(t3)}</td><td style="${tdV2}">${mt3s}</td><td style="${tdO2};text-align:center;">${obs.html}</td></tr>`;
        }).join('');
        return `<table style="width:100%;border-collapse:collapse;font-size:8.5pt;table-layout:fixed;"><colgroup><col style="width:22px;"/><col style="width:120px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:26px;"/><col style="width:80px;"/></colgroup><thead><tr><th rowspan="2" style="${thC2}">Nº</th><th rowspan="2" style="${thC2}text-align:left;">Disciplinas</th><th colspan="3" style="${thC2}">NOTAS DO Iº TRIMESTRE</th><th colspan="3" style="${thC2}">NOTAS DO IIº TRIMESTRE</th><th colspan="3" style="${thC2}">NOTAS DO IIIº TRIMESTRE</th><th rowspan="2" style="${thC2}background:#1b5e20;color:#fff;">OBSERVAÇÃO</th></tr><tr><th style="${thC2}">MAC</th><th style="${thC2}">NPT</th><th style="${thC2}">MT1</th><th style="${thC2}">MAC</th><th style="${thC2}">NPT</th><th style="${thC2}">MT2</th><th style="${thC2}">MAC</th><th style="${thC2}">NPT</th><th style="${thC2}">MT3</th></tr></thead><tbody>${linhas}</tbody></table>${alertaHtml}`;
      })(),
      '{{TERMOS_DE_FREQUENCIA}}': (() => {
        const CLASSES_TF = ['10', '11', '12'] as const;
        type ClasseTF = typeof CLASSES_TF[number];
        const CLASSE_LABELS: Record<ClasseTF, string> = { '10': '10ª Classe', '11': '11ª Classe', '12': '12ª Classe' };

        // Fallback: mapear anoLetivo → classe por ordem cronológica
        const anoLetivosAll = [...new Set(
          alunoNotas.filter((n: any) => n.disciplina).map((n: any) => String(n.anoLetivo || ''))
        )].filter(Boolean).sort();
        const anoLetivoToClasse: Record<string, ClasseTF> = {};
        {
          const offset = Math.max(0, anoLetivosAll.length - 3);
          anoLetivosAll.slice(offset).forEach((ano, i) => {
            anoLetivoToClasse[ano] = CLASSES_TF[i] as ClasseTF;
          });
        }

        // Estilos
        const bdS = 'border:1px solid #000;';
        const thHdr = `${bdS}padding:2px 3px;text-align:center;font-weight:bold;font-size:8pt;background:#d4d4d4;`;
        const thGrp = `${bdS}padding:2px 5px;text-align:center;font-weight:bold;font-size:8.5pt;color:#c00000;background:#e8e8e8;`;
        const tdDisc = `${bdS}padding:2px 5px;text-align:left;font-size:8.5pt;`;
        const tdVal = `${bdS}padding:2px 2px;text-align:center;font-size:8.5pt;min-width:22px;`;
        const tdObs = `${bdS}padding:2px 3px;text-align:center;font-size:7.5pt;`;

        const notaMinTF = Number((config as any)?.notaMinimaAprovacao ?? 10) || 10;

        const fmtV = (v: any): string => {
          const n = Number(v);
          return (!isNaN(n) && n > 0) ? String(Math.round(n * 10) / 10) : '';
        };

        const FORMACAO_GERAL_TF = [
          'lingua portuguesa', 'l. portuguesa', 'matematica', 'educacao fisica', 'educação física', 'e. fisica',
          'lingua estrangeira', 'língua estrangeira', 'l. estrangeira', 'lingua inglesa', 'língua inglesa',
          'ingles', 'inglês', 'filosofia', 'historia', 'história', 'geografia', 'biologia',
          'fisica', 'física', 'quimica', 'química', 'ciencias naturais', 'ciências naturais',
          'tic', 'informatica', 'informática', 'empreendedorismo', 'sociologia', 'economia',
          'educacao laboral', 'educação laboral', 'formacao moral', 'formação moral',
          'educacao para a cidadania', 'educação para a cidadania',
        ];

        const GROUPS_TF = [
          { key: 'formacao_geral',     label: 'FORMAÇÃO GERAL' },
          { key: 'formacao_especifica', label: 'FORMAÇÃO ESPECÍFICA' },
          { key: 'opcional',           label: 'OPÇÕES' },
        ];

        let allHtml = '';

        for (const classeNum of CLASSES_TF) {
          // Filtrar notas desta classe
          const classeNotas = alunoNotas.filter((nota: any) => {
            if (!nota.disciplina) return false;
            const t = turmas.find((tr: any) => tr.id === nota.turmaId);
            if (t) {
              const cn = (t.classe || '').replace(/[^\d]/g, '').slice(0, 2);
              if (cn === classeNum) return true;
            }
            return anoLetivoToClasse[String(nota.anoLetivo || '')] === classeNum;
          });

          if (classeNotas.length === 0) continue;

          // Info do cabeçalho
          const firstNota: any = classeNotas[0];
          const turmaObj: any = turmas.find((tr: any) => tr.id === firstNota.turmaId);
          const anoLetivoDisp = turmaObj?.anoLetivo || firstNota.anoLetivo || '';
          const turmaNome = turmaObj?.nome || turmaObj?.designacao || '';
          const numMatricula = (aluno as any).numeroMatricula || '';

          // Agrupar por disciplina + trimestre
          const discMap = new Map<string, Record<1|2|3, any>>();
          for (const nota of classeNotas) {
            const disc = nota.disciplina.trim();
            if (!discMap.has(disc)) discMap.set(disc, { 1: null, 2: null, 3: null });
            const tr = Number(nota.trimestre) as 1|2|3;
            if (tr >= 1 && tr <= 3) {
              const existing = discMap.get(disc)![tr];
              if (!existing || (nota.nf || 0) > (existing.nf || 0)) {
                discMap.get(disc)![tr] = nota;
              }
            }
          }

          // Construir linhas com categoria
          type TFRow = { nome: string; mt1: string; f1: string; mt2: string; f2: string; mt3: string; f3: string; mfd: string; obs: string; categoria: string };
          const discRows: TFRow[] = [];

          // Config de faltas (acessível via closure)
          const faltasAtivo = !!(config as any)?.faltasControloAtivo;
          const faltasMax = Number((config as any)?.faltasMaxTrimestre ?? 12) || 12;

          // Helper: buscar faltas injustificadas por disciplina + trimestre
          const getFaltasInj = (discNome: string, trimestreNum: 1|2|3): number => {
            // Procurar primeiro por turmaId que corresponde à classe actual
            const match = emitFaltasData.find(f =>
              f.disciplina.toLowerCase().trim() === discNome.toLowerCase().trim() &&
              f.trimestre === trimestreNum
            );
            return match ? (match.faltasInj || 0) : 0;
          };

          for (const [disc, trimNotas] of discMap.entries()) {
            const n1 = trimNotas[1]; const n2 = trimNotas[2]; const n3 = trimNotas[3];
            const mt1s = fmtV(n1?.mt1);
            const mt2s = fmtV(n2?.mt1);
            const mt3s = fmtV(n3?.mt1);

            // F = Faltas injustificadas por trimestre
            const fInj1 = getFaltasInj(disc, 1);
            const fInj2 = getFaltasInj(disc, 2);
            const fInj3 = getFaltasInj(disc, 3);
            const f1s = emitFaltasData.length > 0 ? String(fInj1) : (fmtV(n1?.nf) || '0');
            const f2s = emitFaltasData.length > 0 ? String(fInj2) : (fmtV(n2?.nf) || '0');
            const f3s = emitFaltasData.length > 0 ? String(fInj3) : (fmtV(n3?.nf) || '0');

            // MFD = média das notas finais (NF) dos 3 trimestres
            const nfVals = [n1?.nf, n2?.nf, n3?.nf].map(v => Number(v)).filter(n => !isNaN(n) && n > 0);
            const mfd = nfVals.length > 0
              ? String(Math.round((nfVals.reduce((a, b) => a + b, 0) / nfVals.length) * 10) / 10)
              : '';

            // OBS — verifica reprovação por faltas (se activo) e depois por notas
            let obsHtml = '';
            const definitivo = nfVals.length === 3;

            // Verificar reprovação por faltas em qualquer trimestre (se controlo activo)
            const reprovadoPorFaltas = faltasAtivo && emitFaltasData.length > 0 &&
              (fInj1 > faltasMax || fInj2 > faltasMax || fInj3 > faltasMax);

            if (reprovadoPorFaltas) {
              const trimFalta = fInj1 > faltasMax ? 'Iº' : fInj2 > faltasMax ? 'IIº' : 'IIIº';
              obsHtml = `<span style="color:#7b1fa2;font-weight:bold;font-size:6.5pt;">REP. POR FALTAS (${trimFalta}T)</span>`;
            } else if (mfd !== '') {
              const mfdN = parseFloat(mfd);
              if (mfdN >= notaMinTF) {
                obsHtml = definitivo
                  ? `<span style="color:#1b5e20;font-weight:bold;font-size:7pt;">TRANSITA</span>`
                  : `<span style="color:#2e7d32;font-style:italic;font-size:6.5pt;">TRANSITA*</span>`;
              } else {
                obsHtml = definitivo
                  ? `<span style="color:#b71c1c;font-weight:bold;font-size:7pt;">NÃO TRANSITA</span>`
                  : `<span style="color:#c62828;font-style:italic;font-size:6.5pt;">NÃO TRANSITA*</span>`;
              }
            }

            // Categoria
            const catalogEntry = disciplinasCatalogo.find(
              (d: any) => (d.nome || '').toLowerCase().trim() === disc.toLowerCase().trim()
            );
            let categoria = (catalogEntry?.categoriaFormacao || '');
            if (!['formacao_geral', 'formacao_especifica', 'opcional'].includes(categoria)) {
              const discNorm = disc.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const isGeral = FORMACAO_GERAL_TF.some(g => {
                const gNorm = g.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return discNorm === gNorm || discNorm.startsWith(gNorm);
              });
              categoria = isGeral ? 'formacao_geral' : 'formacao_especifica';
            }

            discRows.push({ nome: disc, mt1: mt1s, f1: f1s, mt2: mt2s, f2: f2s, mt3: mt3s, f3: f3s, mfd, obs: obsHtml, categoria });
          }

          discRows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

          // Montar tabela
          let tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:14px;table-layout:fixed;">
<colgroup>
  <col style="width:130px;"/>
  <col style="width:28px;"/><col style="width:24px;"/>
  <col style="width:28px;"/><col style="width:24px;"/>
  <col style="width:28px;"/><col style="width:24px;"/>
  <col style="width:32px;"/>
  <col style="width:70px;"/>
</colgroup>
<thead>
<tr>
  <td colspan="8" style="${bdS}padding:3px 6px;font-size:8.5pt;background:#fff;">
    <span style="color:#c00000;font-weight:bold;">${CLASSE_LABELS[classeNum]}</span>
    &nbsp;&nbsp; Nº Matrícula/Aluno: <u>&nbsp;${numMatricula || '_____________'}&nbsp;</u>
    &nbsp;&nbsp; Turma: <u>&nbsp;${turmaNome || '_______'}&nbsp;</u>
    &nbsp;&nbsp; Ano Lectivo: <u>&nbsp;${anoLetivoDisp || '________'}&nbsp;</u>
  </td>
  <td rowspan="3" style="${bdS}padding:2px 3px;text-align:center;font-weight:bold;font-size:8pt;background:#fff;">OBS</td>
</tr>
<tr>
  <th rowspan="2" style="${thHdr}text-align:left;">Disciplinas</th>
  <th colspan="2" style="${thHdr}">IºTrimestre</th>
  <th colspan="2" style="${thHdr}">IIºTrimestre</th>
  <th colspan="2" style="${thHdr}">IIIºTrimestre</th>
  <th rowspan="2" style="${thHdr}">MFD</th>
</tr>
<tr>
  <th style="${thHdr}">MT₁</th><th style="${thHdr}">F.</th>
  <th style="${thHdr}">MT₂</th><th style="${thHdr}">F.</th>
  <th style="${thHdr}">MT₃</th><th style="${thHdr}">F.</th>
</tr>
</thead>
<tbody>`;

          for (const group of GROUPS_TF) {
            const rows = discRows.filter(r => r.categoria === group.key);
            if (rows.length === 0) continue;
            tableHtml += `<tr><td colspan="9" style="${thGrp}">${group.label}</td></tr>`;
            for (const row of rows) {
              tableHtml += `<tr>
<td style="${tdDisc}">${row.nome}</td>
<td style="${tdVal}">${row.mt1}</td><td style="${tdVal}">${row.f1}</td>
<td style="${tdVal}">${row.mt2}</td><td style="${tdVal}">${row.f2}</td>
<td style="${tdVal}">${row.mt3}</td><td style="${tdVal}">${row.f3}</td>
<td style="${tdVal};font-weight:bold;">${row.mfd}</td>
<td style="${tdObs}">${row.obs}</td>
</tr>`;
            }
          }

          tableHtml += '</tbody></table>';
          allHtml += tableHtml;
        }

        return allHtml || '<p style="text-align:center;font-style:italic;color:#666;">[Sem notas das classes 10ª, 11ª ou 12ª registadas para este aluno]</p>';
      })(),
      '{{MAPA_ACADEMICO}}': (() => {
        if (!alunoNotas || alunoNotas.length === 0) {
          return '<p style="text-align:center;font-style:italic;color:#666;">[Sem notas registadas para gerar o Mapa Académico]</p>';
        }

        // ── Estilos ──────────────────────────────────────────────────────────
        const bd = 'border:1px solid #333;';
        const thH = `${bd}padding:3px 4px;text-align:center;font-weight:bold;font-size:8pt;background:#1b3a6b;color:#fff;`;
        const thS = `${bd}padding:2px 4px;text-align:center;font-weight:bold;font-size:7.5pt;background:#d6e4f0;color:#000;`;
        const tdN = `${bd}padding:2px 3px;text-align:center;font-size:8pt;`;
        const tdD = `${bd}padding:2px 5px;text-align:left;font-size:8pt;`;
        const tdV = `${bd}padding:2px 3px;text-align:center;font-size:8pt;`;
        const tdSUM = `${bd}padding:3px 4px;text-align:center;font-size:8pt;font-weight:bold;background:#eef4fb;`;

        const fmtMA = (v: any): string => {
          const n = Number(v);
          return (!isNaN(n) && n > 0) ? String(Math.round(n * 10) / 10) : '—';
        };

        const notaMin = Number((config as any)?.notaMinimaAprovacao ?? 10) || 10;

        // ── Detectar todas as classes disponíveis, ordenadas ─────────────────
        // Mapa: classeKey → { anoLetivo, notas[] }
        const classeMap = new Map<string, { anoLetivo: string; notas: any[] }>();

        const ORDEM_CLASSES = ['1','2','3','4','5','6','7','8','9','10','11','12','13'];

        for (const nota of alunoNotas) {
          if (!nota.disciplina) continue;
          const t = turmas.find((tr: any) => tr.id === nota.turmaId);
          let classeNum = '';
          if (t) {
            classeNum = (t.classe || '').replace(/[^\d]/g, '').slice(0, 2);
          }
          if (!classeNum) {
            // fallback: tentar extrair da nota directamente
            classeNum = String(nota.classe || '').replace(/[^\d]/g, '').slice(0, 2);
          }
          if (!classeNum) continue;
          const anoLetivo = t?.anoLetivo || nota.anoLetivo || '';
          if (!classeMap.has(classeNum)) {
            classeMap.set(classeNum, { anoLetivo: String(anoLetivo), notas: [] });
          }
          classeMap.get(classeNum)!.notas.push(nota);
        }

        if (classeMap.size === 0) {
          return '<p style="text-align:center;font-style:italic;color:#666;">[Sem dados de classe nas notas para gerar o Mapa Académico]</p>';
        }

        // Ordenar classes
        const classesOrdenadas = [...classeMap.keys()].sort((a, b) => {
          return ORDEM_CLASSES.indexOf(a) - ORDEM_CLASSES.indexOf(b);
        });

        let mapaHtml = '';

        for (const classeNum of classesOrdenadas) {
          const { anoLetivo, notas: classeNotas } = classeMap.get(classeNum)!;
          const classeLabel = `${classeNum}ª Classe`;

          // ── Agrupar por disciplina + trimestre ──────────────────────────────
          const discMap2 = new Map<string, Record<1|2|3, any>>();
          for (const nota of classeNotas) {
            const disc = nota.disciplina.trim();
            if (!discMap2.has(disc)) discMap2.set(disc, { 1: null, 2: null, 3: null });
            const tr = Number(nota.trimestre) as 1|2|3;
            if (tr >= 1 && tr <= 3) {
              const ex = discMap2.get(disc)![tr];
              if (!ex || (nota.nf || 0) > (ex.nf || 0)) {
                discMap2.get(disc)![tr] = nota;
              }
            }
          }

          const disciplinasSorted = [...discMap2.keys()].sort((a, b) => a.localeCompare(b, 'pt'));
          const totalDiscs = disciplinasSorted.length;

          let mfdsAcum = 0;
          let mfdsCount = 0;
          let allAprovado = true;

          // ── Linhas da tabela ────────────────────────────────────────────────
          let rowsHtml = '';
          disciplinasSorted.forEach((disc, idx) => {
            const trimNotas = discMap2.get(disc)!;
            const n1 = trimNotas[1]; const n2 = trimNotas[2]; const n3 = trimNotas[3];

            const mt1 = fmtMA(n1?.mt1); const nf1 = fmtMA(n1?.nf);
            const mt2 = fmtMA(n2?.mt1); const nf2 = fmtMA(n2?.nf);
            const mt3 = fmtMA(n3?.mt1); const nf3 = fmtMA(n3?.nf);

            // MFD = média das NF dos trimestres com valor
            const fVals2 = [n1?.nf, n2?.nf, n3?.nf]
              .map(v => Number(v))
              .filter(n => !isNaN(n) && n > 0);
            const mfd2 = fVals2.length > 0
              ? Math.round((fVals2.reduce((a, b) => a + b, 0) / fVals2.length) * 10) / 10
              : null;
            const mfdStr = mfd2 !== null ? String(mfd2) : '—';

            if (mfd2 !== null) {
              mfdsAcum += mfd2;
              mfdsCount++;
              if (mfd2 < notaMin) allAprovado = false;
            }

            // Situação por disciplina
            let situacaoHtml = '';
            if (mfd2 !== null) {
              if (mfd2 >= notaMin) {
                situacaoHtml = `<span style="color:#1b5e20;font-weight:bold;font-size:7pt;">APR.</span>`;
              } else {
                situacaoHtml = `<span style="color:#b71c1c;font-weight:bold;font-size:7pt;">REP.</span>`;
                allAprovado = false;
              }
            }

            rowsHtml += `<tr>
<td style="${tdN}">${idx + 1}</td>
<td style="${tdD}">${disc}</td>
<td style="${tdV}">${mt1}</td><td style="${tdV}">${nf1}</td>
<td style="${tdV}">${mt2}</td><td style="${tdV}">${nf2}</td>
<td style="${tdV}">${mt3}</td><td style="${tdV}">${nf3}</td>
<td style="${tdV};font-weight:bold;">${mfdStr}</td>
<td style="${tdV}">${situacaoHtml}</td>
</tr>`;
          });

          // ── Linha de totais/média ───────────────────────────────────────────
          const mediaGlobal = mfdsCount > 0
            ? String(Math.round((mfdsAcum / mfdsCount) * 10) / 10)
            : '—';
          const situacaoGlobal = mfdsCount > 0
            ? (allAprovado
              ? `<span style="color:#1b5e20;font-weight:bold;">APROVADO(A)</span>`
              : `<span style="color:#b71c1c;font-weight:bold;">REPROVADO(A)</span>`)
            : '';

          rowsHtml += `<tr>
<td colspan="8" style="${tdSUM}text-align:right;">Média Global da Classe:</td>
<td style="${tdSUM}">${mediaGlobal}</td>
<td style="${tdSUM}">${situacaoGlobal}</td>
</tr>`;

          const turmaObj2: any = turmas.find((tr: any) =>
            classeNotas.length > 0 && tr.id === classeNotas[0].turmaId
          );
          const turmaNome2 = turmaObj2?.nome || turmaObj2?.designacao || '';
          const numMat2 = (aluno as any).numeroMatricula || '';

          mapaHtml += `
<table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:16px;table-layout:fixed;">
<colgroup>
  <col style="width:20px;"/>
  <col style="width:140px;"/>
  <col style="width:24px;"/><col style="width:22px;"/>
  <col style="width:24px;"/><col style="width:22px;"/>
  <col style="width:24px;"/><col style="width:22px;"/>
  <col style="width:28px;"/>
  <col style="width:72px;"/>
</colgroup>
<thead>
  <tr>
    <td colspan="10" style="${bd}padding:4px 8px;background:#1b3a6b;color:#fff;font-weight:bold;font-size:9pt;">
      ${classeLabel}
      &nbsp;&nbsp;|&nbsp;&nbsp; Ano Lectivo: ${anoLetivo || '______'}
      ${turmaNome2 ? `&nbsp;&nbsp;|&nbsp;&nbsp; Turma: ${turmaNome2}` : ''}
      ${numMat2 ? `&nbsp;&nbsp;|&nbsp;&nbsp; Nº Matrícula: ${numMat2}` : ''}
    </td>
  </tr>
  <tr>
    <th rowspan="2" style="${thS}">Nº</th>
    <th rowspan="2" style="${thS}text-align:left;">Disciplina</th>
    <th colspan="2" style="${thS}">Iº Trimestre</th>
    <th colspan="2" style="${thS}">IIº Trimestre</th>
    <th colspan="2" style="${thS}">IIIº Trimestre</th>
    <th rowspan="2" style="${thS}">MFD</th>
    <th rowspan="2" style="${thS}">Situação</th>
  </tr>
  <tr>
    <th style="${thS}">MT₁</th><th style="${thS}">NF₁</th>
    <th style="${thS}">MT₂</th><th style="${thS}">NF₂</th>
    <th style="${thS}">MT₃</th><th style="${thS}">NF₃</th>
  </tr>
</thead>
<tbody>${rowsHtml}</tbody>
</table>`;
        }

        return mapaHtml;
      })(),
      '{{TELEFONE_ESCOLA}}': (config as any)?.telefoneEscola || '',
      '{{EMAIL_ESCOLA}}': (config as any)?.emailEscola || '',
      '{{MORADA_ESCOLA}}': (config as any)?.morada || '',
      '{{MEDIA_GERAL}}': mediaGeral !== null ? String(mediaGeral) : '____',
      '{{MEDIA_GERAL_EXTENSO}}': mediaGeral !== null ? `${numExtensoLocal(mediaGeral)} Valores` : '________',
      // ── Aliases para Certificado de Habilitações ────────────────────────────
      '{{NOME_ALUNO}}': `${aluno.nome} ${aluno.apelido}`,
      '{{NOME_PAI}}': (aluno as any).nomePai || '________________________',
      '{{NOME_MAE}}': (aluno as any).nomeMae || '________________________',
      '{{DIA_NASCIMENTO}}': aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getDate()) : '___',
      '{{MES_NASCIMENTO}}': aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '___________',
      '{{ANO_NASCIMENTO}}': aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getFullYear()) : '____',
      '{{NUMERO_BI}}': (aluno as any).numeroBi || '________________________',
      '{{LOCAL_BI}}': (aluno as any).biLocalEmissao || '________________________',
      '{{DATA_BI}}': (aluno as any).biDataEmissao || '________________________',
      '{{MEDIA_FINAL}}': mediaGeral !== null ? String(mediaGeral) : '____',
      '{{NUMERO_TURMA}}': (aluno as any).numeroMatricula || '____',
      '{{DECRETO}}': '____',
      '{{DECRETO_DATA}}': '____',
      '{{LOCALIDADE}}': aluno.municipio || (config as any).municipio || '____',
      '{{DATA_EMISSAO}}': `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`,
      '{{ANO_REG}}': now.getFullYear().toString(),
      // ── Certificado II Ciclo — variáveis adicionais ─────────────────────────
      '{{GENERO_FILHO}}': (aluno as any).genero === 'F' ? 'filha' : 'filho',
      '{{MEDIA_FINAL_EXTENSO}}': mediaGeral !== null ? `${numExtensoLocal(mediaGeral)} valores` : '____',
      '{{LIVRO_REGISTO}}': '________________________',
      '{{FOLHA_REGISTO}}': '________________________',
      '{{NOME_DENOMINACAO}}': (config as any).denominacao || (config as any).nomeDenominacao || '________________________',
      '{{DECRETO_ESCOLA}}': (config as any).decretoEscolaNumero || (config as any).decretoNumero || '________________________',
      '{{NATURALIDADE}}': (aluno as any).municipio || (aluno as any).provincia || '________________________',
    };

    for (const n of alunoNotas) {
      if (n.disciplina && n.nf !== undefined) {
        map[buildNotaTagFromDisciplina(n.disciplina)] = n.nf > 0 ? String(Math.round(n.nf)) : '____';
      }
    }

    // ── Notas por classe (7ª / 8ª / 9ª) — Certificado de Habilitações ─────────
    {
      const CLASSES_CERT = ['7ª', '8ª', '9ª'] as const;
      type ClasseKey = typeof CLASSES_CERT[number];

      // Map each nota to its turma class (7ª, 8ª or 9ª)
      const gradesByClasse: Record<ClasseKey, Map<string, number>> = {
        '7ª': new Map(), '8ª': new Map(), '9ª': new Map(),
      };
      for (const nota of alunoNotas) {
        const t = turmas.find((tr: any) => tr.id === nota.turmaId);
        if (!t) continue;
        const classeKey = CLASSES_CERT.find(c => {
          const num = c.replace('ª', '');
          return t.classe?.startsWith(num) || t.classe === c;
        });
        if (!classeKey) continue;
        const dk = nota.disciplina.toLowerCase().trim();
        const prev = gradesByClasse[classeKey].get(dk);
        if (prev === undefined || nota.nf > prev) gradesByClasse[classeKey].set(dk, nota.nf);
      }

      function notaByClasseDisc(classeKey: ClasseKey, candidates: string[]): string {
        const map2 = gradesByClasse[classeKey];
        for (const [key, val] of map2.entries()) {
          if (candidates.some(c => key.includes(c)) && val > 0) return String(Math.round(val));
        }
        return '___';
      }

      function mediaByDisc(candidates: string[]): number | null {
        const vals: number[] = [];
        for (const c of CLASSES_CERT) {
          const map2 = gradesByClasse[c];
          for (const [key, val] of map2.entries()) {
            if (candidates.some(cand => key.includes(cand)) && val > 0) { vals.push(val); break; }
          }
        }
        if (vals.length === 0) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      }

      const CERT_DISC: Array<{ tag: string; candidates: string[] }> = [
        { tag: 'LP',  candidates: ['língua portuguesa', 'lingua portuguesa', 'português', 'portugues'] },
        { tag: 'LE',  candidates: ['língua estrangeira', 'lingua estrangeira', 'inglês', 'ingles', 'francês', 'frances', 'inglesa', 'francesa'] },
        { tag: 'MAT', candidates: ['matemática', 'matematica'] },
        { tag: 'BIO', candidates: ['biologia'] },
        { tag: 'FIS', candidates: ['física', 'fisica'] },
        { tag: 'QUI', candidates: ['química', 'quimica'] },
        { tag: 'EMP', candidates: ['empreendedorismo', 'emprendedorismo'] },
        { tag: 'GEO', candidates: ['geografia'] },
        { tag: 'HIS', candidates: ['história', 'historia'] },
        { tag: 'EF',  candidates: ['educação física', 'educacao fisica', 'ed. física', 'ed. fisica'] },
        { tag: 'EMC', candidates: ['educação moral', 'educacao moral', 'moral e cívica', 'moral civica', 'moral e civica'] },
        { tag: 'EVP', candidates: ['educação visual', 'educacao visual', 'visual plástica', 'visual plastica', 'visual e plást'] },
        { tag: 'EL',  candidates: ['educação laboral', 'educacao laboral'] },
      ];

      for (const disc of CERT_DISC) {
        const n7 = notaByClasseDisc('7ª', disc.candidates);
        const n8 = notaByClasseDisc('8ª', disc.candidates);
        const n9 = notaByClasseDisc('9ª', disc.candidates);
        const med = mediaByDisc(disc.candidates);
        map[`{{NOTA_${disc.tag}_7}}`] = n7;
        map[`{{NOTA_${disc.tag}_8}}`] = n8;
        map[`{{NOTA_${disc.tag}_9}}`] = n9;
        map[`{{MEDIA_${disc.tag}}}`] = med !== null ? String(med) : '___';
        map[`{{MEDIA_${disc.tag}_EXTENSO}}`] = med !== null ? `${numExtensoLocal(med)} Valores` : '___________';
      }
    }

    // ── Tabela Certificado II Ciclo (10ª / 11ª / 12ª) ────────────────────────
    {
      const CLASSES_II = ['10', '11', '12'] as const;
      type ClasseII = typeof CLASSES_II[number];

      // Build anoLetivo→classeNum fallback (cobre turmas apagadas/não carregadas)
      const anoLetivosII = [...new Set(
        alunoNotas.filter(n => n.nf > 0 && n.disciplina).map(n => n.anoLetivo)
      )].sort();
      const anoLetivoToClasseII: Record<string, ClasseII> = {};
      {
        const classesSeq: ClasseII[] = ['10', '11', '12'];
        const offset = Math.max(0, anoLetivosII.length - 3);
        anoLetivosII.slice(offset).forEach((ano, i) => {
          anoLetivoToClasseII[ano] = classesSeq[i] as ClasseII;
        });
      }

      // Collect per-discipline per-class NFs
      const gradesByDiscII: Map<string, Record<ClasseII, number[]>> = new Map();
      for (const nota of alunoNotas) {
        if (!nota.disciplina || nota.nf <= 0) continue;
        const t = turmas.find((tr: any) => tr.id === nota.turmaId);
        // Determinar classe via turma; fallback por ordem dos anos lectivos
        let classeNum: ClasseII | undefined;
        if (t) {
          const cn = (t.classe || '').replace(/[^\d]/g, '').slice(0, 2) as ClasseII;
          if (CLASSES_II.includes(cn)) classeNum = cn;
        }
        if (!classeNum) classeNum = anoLetivoToClasseII[nota.anoLetivo];
        if (!classeNum) continue;
        const discKey = nota.disciplina.trim();
        if (!gradesByDiscII.has(discKey)) gradesByDiscII.set(discKey, { '10': [], '11': [], '12': [] });
        gradesByDiscII.get(discKey)![classeNum].push(nota.nf);
      }

      if (gradesByDiscII.size > 0) {
        type DiscRowII = { nome: string; n10: number | null; n11: number | null; n12: number | null; media: number | null; categoria: string };
        const discRowsII: DiscRowII[] = [];

        for (const [disc, grades] of gradesByDiscII.entries()) {
          const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
          const n10 = avg(grades['10']);
          const n11 = avg(grades['11']);
          const n12 = avg(grades['12']);
          const vals = ([n10, n11, n12].filter(v => v !== null)) as number[];
          const media = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

          // categoriaFormacao from the disciplinas catalog (loaded in disciplinasCatalogo state)
          const catalogEntry = disciplinasCatalogo.find(
            (d: any) => (d.nome || '').toLowerCase().trim() === disc.toLowerCase().trim()
          );
          let categoria = (catalogEntry?.categoriaFormacao || '');
          if (!['formacao_geral', 'formacao_especifica', 'opcional'].includes(categoria)) {
            // Fallback: classify by known Angola II Ciclo "Formação Geral" discipline names
            const FORMACAO_GERAL_NOMES = [
              'lingua portuguesa', 'matematica', 'educacao fisica', 'educação física',
              'lingua inglesa', 'língua inglesa', 'ingles', 'inglês', 'ingles tecnico', 'inglês técnico',
              'filosofia', 'historia', 'história', 'geografia', 'biologia', 'fisica', 'física',
              'quimica', 'química', 'ciencias naturais', 'ciências naturais', 'educacao visual',
              'formacao moral', 'formação moral', 'tic', 'informatica', 'informática',
              'empreendedorismo', 'educacao para a cidadania', 'educação para a cidadania',
              'ciencias sociais', 'ciências sociais', 'sociologia', 'economia',
              'introducao ao direito', 'introdução ao direito', 'educacao laboral',
              'educação laboral', 'formacao etica', 'formação ética',
            ];
            const discNorm = disc.toLowerCase().trim()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const isGeral = FORMACAO_GERAL_NOMES.some(g => {
              const gNorm = g.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              return discNorm === gNorm || discNorm.startsWith(gNorm);
            });
            categoria = isGeral ? 'formacao_geral' : 'formacao_especifica';
          }

          discRowsII.push({ nome: disc, n10, n11, n12, media, categoria });
        }

        // Sort disciplines alphabetically within each group
        discRowsII.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

        const bdS = 'border:1px solid #000;';
        const thS = `${bdS}padding:2px 4px;font-family:'Times New Roman',serif;font-size:10pt;font-weight:bold;text-align:center;background:#e8e8e8;`;
        const tdS = `${bdS}padding:1px 4px;font-family:'Times New Roman',serif;font-size:10pt;`;

        let tableHtml = `<table style="width:100%;border-collapse:collapse;margin:4px 0;">
<thead><tr>
<th style="${thS}text-align:left;width:34%;">Disciplinas</th>
<th style="${thS}width:10%;">10.ª<br>Classe</th>
<th style="${thS}width:10%;">11.ª<br>Classe</th>
<th style="${thS}width:10%;">12.ª<br>Classe</th>
<th style="${thS}width:10%;">Média<br>Final</th>
<th style="${thS}width:26%;">Média por extenso</th>
</tr></thead><tbody>`;

        const GROUPS: Array<{ key: string; label: string }> = [
          { key: 'formacao_geral', label: 'Formação geral' },
          { key: 'formacao_especifica', label: 'Formação específica' },
          { key: 'opcional', label: 'Disciplina Opcional' },
        ];

        for (const group of GROUPS) {
          const rows = discRowsII.filter(r => r.categoria === group.key);
          if (rows.length === 0) continue;
          tableHtml += `<tr><td colspan="6" style="${bdS}padding:2px 4px;font-family:'Times New Roman',serif;font-size:10pt;font-weight:bold;font-style:italic;background:#e8e8e8;">${group.label}</td></tr>`;
          for (const row of rows) {
            const fmt = (v: number | null) => v !== null ? String(v) : '—';
            const fmtExt = (v: number | null) => v !== null ? `${numExtensoLocal(v)} valores` : '—';
            tableHtml += `<tr>
<td style="${tdS}">${row.nome}</td>
<td style="${tdS}text-align:center;">${fmt(row.n10)}</td>
<td style="${tdS}text-align:center;">${fmt(row.n11)}</td>
<td style="${tdS}text-align:center;">${fmt(row.n12)}</td>
<td style="${tdS}text-align:center;font-weight:bold;">${fmt(row.media)}</td>
<td style="${tdS}text-align:center;">${fmtExt(row.media)}</td>
</tr>`;
          }
        }
        tableHtml += '</tbody></table>';

        map['{{TABELA_CERTIFICADO_II_CICLO}}'] = tableHtml;

        // Override MEDIA_FINAL / MEDIA_FINAL_EXTENSO with the II Ciclo overall average
        const allMediasII = discRowsII.filter(r => r.media !== null).map(r => r.media!);
        if (allMediasII.length > 0) {
          const mediaFinalII = Math.round(allMediasII.reduce((a, b) => a + b, 0) / allMediasII.length);
          map['{{MEDIA_FINAL}}'] = String(mediaFinalII);
          map['{{MEDIA_FINAL_EXTENSO}}'] = `${numExtensoLocal(mediaFinalII)} valores`;
        }
      } else {
        map['{{TABELA_CERTIFICADO_II_CICLO}}'] = '<p style="text-align:center;font-style:italic;color:#666;font-family:\'Times New Roman\',serif;">[Tabela gerada automaticamente ao emitir — sem notas das classes 10ª, 11ª ou 12ª registadas para este aluno]</p>';
      }
    }

    if (template.tipo === 'historico_academico') {
      const TRIM_COLORS: Record<number, string> = { 1: '#3b82f6', 2: '#f59e0b', 3: '#10b981' };
      const alunoNotas = notas.filter(n => n.alunoId === alunoId);
      const anosMap: Record<string, typeof alunoNotas> = {};
      for (const n of alunoNotas) {
        if (!anosMap[n.anoLetivo]) anosMap[n.anoLetivo] = [];
        anosMap[n.anoLetivo].push(n);
      }
      const anosOrdenados = Object.keys(anosMap).sort((a, b) => b.localeCompare(a));
      let anosHTML = '';
      for (const ano of anosOrdenados) {
        const notasAno = anosMap[ano];
        const trims: Record<number, typeof alunoNotas> = { 1: [], 2: [], 3: [] };
        for (const n of notasAno) {
          if (trims[n.trimestre]) trims[n.trimestre].push(n);
        }
        const allNfs = notasAno.filter(n => n.nf > 0).map(n => n.nf);
        const mediaGeralAno = allNfs.length > 0 ? allNfs.reduce((a, b) => a + b, 0) / allNfs.length : null;
        const situacao = mediaGeralAno !== null ? (mediaGeralAno >= 10 ? 'Aprovado' : 'Reprovado') : '—';
        const situacaoCor = situacao === 'Aprovado' ? '#16a34a' : situacao === 'Reprovado' ? '#dc2626' : '#6b7280';
        let tabelasHTML = '';
        for (const tri of [1, 2, 3] as const) {
          const notasTri = trims[tri];
          if (!notasTri.length) continue;
          const mediaTri = notasTri.reduce((s, n) => s + (n.nf > 0 ? n.nf : n.mac ?? 0), 0) / notasTri.length;
          const rows = notasTri.map(n => {
            const nf = n.nf > 0 ? n.nf : (n.mac ?? 0);
            const color = nf >= 10 ? '#16a34a' : nf > 0 ? '#dc2626' : '#9ca3af';
            return `<tr><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;color:#1e293b;">${n.disciplina || '—'}</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">${(n as any).mac1 > 0 ? Number((n as any).mac1).toFixed(1) : '—'}</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">${(n as any).pp1 > 0 ? (n as any).pp1 : '—'}</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">${(n as any).ppt > 0 ? (n as any).ppt : '—'}</td><td style="font-size:8.5pt;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:${color};">${nf > 0 ? Number(nf).toFixed(1) : '—'}</td></tr>`;
          }).join('');
          const tc = TRIM_COLORS[tri];
          tabelasHTML += `<div style="border-bottom:1px solid #f1f5f9;"><div style="padding:5px 10px;font-size:8.5pt;font-weight:600;background:${tc}20;border-left:4px solid ${tc};color:${tc};">${tri}º Trimestre — Média: ${mediaTri.toFixed(1)}</div><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:left;">Disciplina</th><th style="background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">MAC</th><th style="background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">PP</th><th style="background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">PT</th><th style="background:#f1f5f9;font-size:7.5pt;font-weight:700;color:#475569;padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">NF</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        }
        if (!tabelasHTML) tabelasHTML = `<p style="color:#9ca3af;text-align:center;padding:16px;font-style:italic;">Sem notas registadas neste ano lectivo.</p>`;
        anosHTML += `<div style="margin:14px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;page-break-inside:avoid;"><div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#1a2b5f;flex-wrap:wrap;"><span style="font-size:11pt;font-weight:700;color:white;">${ano}</span><span style="font-size:7.5pt;font-weight:700;padding:2px 8px;border-radius:20px;background:${situacaoCor}20;color:${situacaoCor};border:1px solid ${situacaoCor}50;">${situacao}</span><span style="margin-left:auto;font-size:8pt;color:#cbd5e1;">Média: <strong>${mediaGeralAno !== null ? Number(mediaGeralAno).toFixed(1) : '—'}</strong></span></div>${tabelasHTML}</div>`;
      }
      if (!anosHTML) anosHTML = `<p style="color:#9ca3af;text-align:center;padding:16px;font-style:italic;">Sem histórico registado.</p>`;
      map['{{HISTORICO_ANOS}}'] = anosHTML;
    }

    let result = template.conteudo;
    Object.entries(map).forEach(([k, v]) => {
      result = result.split(k).join(v);
    });
    // Substituir brasão de Angola pela insígnia do template se estiver definida
    const tplInsignia = (template as any).insigniaBase64 || editorInsigniaRef.current;
    if (tplInsignia) {
      result = result
        .split('src="/angola-brasao.png"').join(`src="${tplInsignia}"`)
        .split("src='/angola-brasao.png'").join(`src='${tplInsignia}'`)
        .split(`src="${typeof window !== 'undefined' ? window.location.origin : ''}/angola-brasao.png"`).join(`src="${tplInsignia}"`);
    }
    return result;
  }

  function handleSelectAluno(alunoId: string) {
    setEmitAlunoId(alunoId);
    if (emitTemplate && !isExtratoPropinaType(emitTemplate)) {
      setEmitPreview(buildPreview(emitTemplate, alunoId));
    }
  }

  // ─── Extracto de Propinas — build HTML from editor template + real API data ─

  function buildExtratoFromEditorTemplate(template: DocTemplate, data: any): string {
    const { aluno, pagamentos: pags, resumo, filtros } = data;

    function fmtAOA(v: number) {
      return `${Number(v).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
    }
    function fmtDate(d: string) {
      if (!d) return '—';
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d;
    }

    const ts = Date.now().toString(36).toUpperCase();
    const mat = (aluno.numeroMatricula || 'X').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    const docId = `EXTR-${mat}-${ts}`;
    const now = new Date();
    const dataEmissao = now.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
    const hora = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    const periodoInicio = filtros?.dataInicio ? fmtDate(filtros.dataInicio) : `01/01/${now.getFullYear()}`;
    const periodoFim = filtros?.dataFim ? fmtDate(filtros.dataFim) : `31/12/${now.getFullYear()}`;

    const turmaObj = turmas.find(t => t.id === aluno.turmaId);

    const varMap: Record<string, string> = {
      '{{NOME_COMPLETO}}': `${aluno.nome} ${aluno.apelido}`,
      '{{NOME}}': aluno.nome || '',
      '{{APELIDO}}': aluno.apelido || '',
      '{{NUMERO_MATRICULA}}': aluno.numeroMatricula || '',
      '{{NOME_ENCARREGADO}}': aluno.nomeEncarregado || '',
      '{{PAI}}': (aluno as any).nomePai || '________________________',
      '{{MAE}}': (aluno as any).nomeMae || '________________________',
      '{{BI_NUMERO}}': (aluno as any).numeroBi || '________________________',
      '{{BI_DATA_EMISSAO}}': (aluno as any).biDataEmissao || '________________________',
      '{{BI_LOCAL_EMISSAO}}': (aluno as any).biLocalEmissao || '________________________',
      '{{ENCARREGADO_PROFISSAO}}': (aluno as any).encarregadoProfissao || '________________________',
      '{{ENCARREGADO_LOCAL_TRABALHO}}': (aluno as any).encarregadoLocalTrabalho || '________________________',
      '{{ENCARREGADO_RESIDENCIA}}': (aluno as any).encarregadoResidencia || '________________________',
      '{{ENCARREGADO_CONTACTO2}}': (aluno as any).encarregadoContacto2 || '________________________',
      '{{TELEFONE_ENCARREGADO}}': aluno.telefoneEncarregado || '',
      '{{TURMA}}': aluno.turmaNome || turmaObj?.nome || '',
      '{{SALA}}': turmaObj?.sala || '',
      '{{CLASSE}}': turmaObj?.classe || '',
      '{{ANO_LECTIVO}}': turmaObj?.anoLetivo || String(now.getFullYear()),
      '{{TURNO}}': turmaObj?.turno || '',
      '{{NIVEL}}': turmaObj?.nivel || '',
      '{{PROVINCIA}}': aluno.provincia || '',
      '{{MUNICIPIO}}': aluno.municipio || '',
      '{{NOME_ESCOLA}}': config.nomeEscola || '',
      '{{NOME_ESCOLA_CURTA}}': config.nomeEscola || '',
      '{{ANO_LECTIVO_ANO}}': (() => {
        const al = turma?.anoLetivo || String(new Date().getFullYear());
        return al.includes('/') ? al.split('/').pop()!.trim() : al;
      })(),
      '{{NOME_DIRECTOR}}': directorGeral,
      '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
      '{{NOME_DIRECTOR_PEDAGOGICO}}': directorPedagogico,
      '{{NOME_DIRECTOR_PROVINCIAL}}': directorProvincialEducacao,
      '{{CHEFE_SECRETARIA}}': (config as any).chefeSecretaria || '___________________________',
      '{{DATA_ACTUAL}}': dataEmissao,
      '{{MES_ACTUAL}}': MESES[now.getMonth()],
      '{{ANO_ACTUAL}}': String(now.getFullYear()),
      '{{TOTAL_PAGO}}': fmtAOA(resumo.totalPago),
      '{{TOTAL_PENDENTE}}': fmtAOA(resumo.totalPendente),
      '{{TOTAL_CANCELADO}}': fmtAOA(resumo.totalCancelado),
      '{{TOTAL_TRANSACCOES}}': String(resumo.total),
      '{{PERIODO_INICIO}}': periodoInicio,
      '{{PERIODO_FIM}}': periodoFim,
      '{{DOC_REF}}': docId,
    };

    let html = template.conteudo;
    Object.entries(varMap).forEach(([k, v]) => {
      html = html.split(k).join(v);
    });

    const METODO_LABEL: Record<string, string> = {
      dinheiro: 'Dinheiro', transferencia: 'Transferência', multicaixa: 'Multicaixa Express',
    };
    const TIPO_LABEL: Record<string, string> = {
      propina: 'Propina', matricula: 'Matrícula', material: 'Material',
      exame: 'Exame', multa: 'Multa', outro: 'Outro',
    };
    const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    const realRows = (pags || []).map((p: any, idx: number) => {
      const descricao = [
        p.taxaDescricao || TIPO_LABEL[p.taxaTipo || ''] || p.taxaTipo || '',
        p.mes ? (MESES_SHORT[(p.mes - 1) % 12] || '') : '',
        p.ano || '',
      ].filter(Boolean).join(' · ');

      const statusStyle = p.status === 'pago'
        ? 'color:#1a6b2a;background:#d4edda;'
        : p.status === 'pendente'
          ? 'color:#856404;background:#fff3cd;'
          : 'color:#6c757d;background:#e2e3e5;';

      const valor = p.status === 'cancelado'
        ? `<span style="color:#aaa;text-decoration:line-through;">${fmtAOA(Number(p.valor))}</span>`
        : `<strong style="color:${p.status === 'pago' ? '#1a6b2a' : '#856404'};">${fmtAOA(Number(p.valor))}</strong>`;

      const bg = idx % 2 === 0 ? '#fff' : '#f9f9ff';
      const ref = [p.referencia ? `Ref: ${p.referencia}` : '', p.observacao || ''].filter(Boolean).join(' · ');

      return `<tr style="background:${bg};">
        <td style="padding:6px 8px;font-size:10px;color:#555;white-space:nowrap;">${fmtDate(p.data)}</td>
        <td style="padding:6px 8px;font-size:10px;">
          <span style="font-weight:600;color:#1a2540;">${descricao}</span>
          ${ref ? `<br><span style="font-size:9px;color:#888;">${ref}</span>` : ''}
        </td>
        <td style="padding:6px 8px;font-size:10px;color:#555;">${METODO_LABEL[p.metodoPagamento] || p.metodoPagamento}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap;">${valor}</td>
        <td style="padding:4px 8px;text-align:center;">
          <span style="font-size:9px;font-weight:bold;padding:2px 6px;border-radius:4px;${statusStyle}">${p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
        </td>
      </tr>`;
    }).join('');

    const tbodyContent = pags?.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:30px;color:#aaa;font-size:12px;border:1px dashed #ddd;border-radius:8px;">Nenhum pagamento encontrado para o período seleccionado.</td></tr>`
      : realRows;

    html = html.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${tbodyContent}</tbody>`);

    const qrLines = [
      `DOC: ${docId}`,
      `ESCOLA: ${config.nomeEscola || ''}`,
      `ALUNO: ${aluno.nome} ${aluno.apelido}`,
      `MATRICULA: ${aluno.numeroMatricula}`,
      `TOTAL PAGO: ${fmtAOA(resumo.totalPago)}`,
      `TRANSACCOES: ${resumo.total}`,
      `EMITIDO: ${dataEmissao} ${hora}`,
    ].join('\n');
    const newQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrLines)}&bgcolor=ffffff&color=000000&margin=6`;

    html = html.replace(/https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/[^"']*/g, newQrUrl);

    return html;
  }

  // ─── Ficha de Matrícula HTML Builder ──────────────────────────────────────

  function buildFichaMatriculaHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const turma = turmas.find(t => t.id === aluno.turmaId);
    const escola = config.nomeEscola || 'Super Escola';
    const now = new Date();

    const nome = `${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}`;
    const diaNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getDate() : '__';
    const mesNasc = aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '__________';
    const anoNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const municipio = aluno.municipio || '____________________';
    const provincia = aluno.provincia || '____________________';
    const encarregado = aluno.nomeEncarregado || '____________________________________________';
    const telefone = aluno.telefoneEncarregado || '_______________________';
    const classeActual = turma ? turma.classe : '____';
    const turmaNome = turma ? turma.nome : '____';
    const anoLetivo = turma ? turma.anoLetivo : String(now.getFullYear());
    const nomePai = (aluno as any).nomePai || '______________________________________';
    const nomeMae = (aluno as any).nomeMae || '______________________________________';
    const qrData = encodeURIComponent(`MAT|${alunoId}|${nome}|${classeActual}|${turmaNome}|${anoLetivo}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}`;

    // Class history table columns
    const classes = ['Iniciação', '1ª Classe', '2ª Classe', '3ª Classe', '4ª Classe', '5ª Classe', '6ª Classe', '7ª Classe', '8ª Classe', '9ª Classe'];
    const classeHeaders = classes.map(c => `<th>${c.replace(' Classe', '<br/>Classe')}</th>`).join('');
    const classeCells = classes.map(() => `<td>&nbsp;</td>`).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Ficha de Reconfirmação de Matrícula — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 20px 30px; }
    .header { text-align: center; margin-bottom: 16px; }
    .header .escola { font-size: 14px; font-weight: bold; text-transform: uppercase; }
    .header .sub { font-size: 11px; text-transform: uppercase; }
    .titulo { text-align: center; font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 18px 0 20px; letter-spacing: 1px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 8px 0; }
    .field { margin-bottom: 10px; line-height: 1.8; }
    .line { display: inline-block; border-bottom: 1px solid #000; min-width: 200px; vertical-align: bottom; margin: 0 2px; }
    .line-sm { min-width: 60px; }
    .line-md { min-width: 120px; }
    .line-lg { min-width: 260px; }
    .line-xl { min-width: 360px; }
    .row { display: flex; gap: 24px; align-items: flex-end; margin-bottom: 10px; }
    .row > * { flex: 1; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 10px; }
    table th, table td { border: 1px solid #000; padding: 5px 3px; text-align: center; }
    table th { background: #f0f0f0; font-weight: bold; font-size: 9px; }
    .section-title { font-size: 13px; font-weight: bold; text-align: center; text-transform: uppercase; margin: 16px 0 8px; letter-spacing: 2px; }
    .frequencia-box { border: 1px solid #000; min-height: 80px; padding: 8px; margin-bottom: 16px; font-size: 10px; color: #aaa; font-style: italic; }
    .date-line { margin: 16px 0; font-size: 11px; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 28px; }
    .sig-block { text-align: center; min-width: 220px; }
    .sig-label { font-size: 11px; margin-bottom: 28px; }
    .sig-line { width: 200px; border-top: 1px solid #000; margin: 0 auto 4px; }
    .comprovativo { border: 1px solid #aaa; background: #f7f7f7; padding: 8px 12px; margin-top: 20px; font-size: 9px; }
    .comp-title { font-size: 9px; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 1px; }
    .comp-row { display: flex; gap: 16px; flex-wrap: wrap; }
    .comp-field { flex: 1; min-width: 120px; }
    @media print { @page { size: A4; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
    <div class="sub">República de Angola — Ministério da Educação</div>
    <div class="escola">${escola}</div>
    <div class="sub">Ensino Primário, Iº e IIº Ciclo</div>
  </div>

  <div class="titulo">Ficha de Reconfirmação de Matrícula</div>

  <div class="field">Nome do Aluno <span class="line line-xl">${nome}</span></div>

  <div class="field">
    Filho(a) de <span class="line line-lg">${nomePai}</span>
    &nbsp;e de <span class="line line-md">${nomeMae}</span>
  </div>

  <div class="field">
    Nascido(a) aos <span class="line line-sm">${diaNasc}</span>
    de <span class="line line-md">${mesNasc}</span>
    de 20<span class="line line-sm">${String(anoNasc).slice(-2)}</span>
    &nbsp;Natural de <span class="line line-md">${municipio}</span>
    &nbsp;Município de <span class="line line-md">${municipio}</span>
  </div>

  <div class="field">
    Província de <span class="line line-md">${provincia}</span>
    portador(a) do B.I ou Cédula pessoal nº <span class="line line-md">_____________________</span>
    emitido aos <span class="line line-sm">____</span>
    de <span class="line line-md">________________</span>
    de 20<span class="line line-sm">____</span>
    pela direcção nacional de identificação ou conservatória de registo civil de
    <span class="line line-lg">________________________</span>.
  </div>

  <div class="field">Nome do encarregado <span class="line line-xl">${encarregado}</span></div>

  <div class="row">
    <div>Profissão <span class="line line-md">________________________</span></div>
    <div>Local de trabalho <span class="line line-md">_______________________________</span></div>
  </div>

  <div class="row">
    <div>Residência <span class="line line-md">________________________</span></div>
    <div>Contactos <span class="line line-md">${telefone}</span></div>
    <div>ou <span class="line line-md">_______________________</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="min-width:70px;">Classes</th>
        ${classeHeaders}
      </tr>
    </thead>
    <tbody>
      <tr>
        <th>Ano lectivo</th>
        ${classeCells}
      </tr>
    </tbody>
  </table>

  <div class="section-title">Frequência Escolar do Aluno</div>
  <div class="frequencia-box">— espaço para observações —</div>

  <div class="date-line">Luanda aos, ______ de ____________________ de 20____</div>

  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-label">O encarregado de educação</div>
      <div class="sig-line"></div>
      <div>${encarregado}</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">O(a) Responsável da Secretaria</div>
      <div class="sig-line"></div>
      <div>&nbsp;</div>
    </div>
  </div>

  <div class="comprovativo">
    <div class="comp-title">Comprovativo de Matrícula — Ano Lectivo ${anoLetivo}</div>
    <div class="comp-row">
      <div class="comp-field">Nome: <strong>${nome}</strong></div>
      <div class="comp-field">Fez a matrícula na Classe: <strong>${classeActual}</strong> — Turma <strong>${turmaNome}</strong></div>
      <div class="comp-field">Período: __________</div>
    </div>
    <div class="comp-row" style="margin-top:4px;">
      <div class="comp-field">O Encarregado: ______________________</div>
      <div class="comp-field">A Secretária: ________________________</div>
      <div class="comp-field">Luanda aos ______ de ______ de 20____</div>
    </div>
  </div>

  <div style="display:flex;justify-content:flex-end;align-items:flex-end;margin-top:18px;gap:10px;">
    <div style="text-align:center;">
      <img src="${qrUrl}" style="width:90px;height:90px;display:block;" alt="QR Code de verificação" onerror="this.style.display='none'" />
      <div style="font-size:8px;color:#666;margin-top:3px;">Verificação Digital</div>
    </div>
  </div>
</body>
</html>`;
  }

  // ─── Comprovativo de Matrícula HTML Builder ──────────────────────────────

  function buildComprovatvoMatriculaHtml(
    payload: {
      aluno: { nome?: string; apelido?: string; dataNascimento?: string; genero?: string; bi?: string; numeroCedula?: string; numeroMatricula?: string; turmaNome?: string; classe?: string; nivel?: string; turno?: string; anoLetivo?: string; cursoNome?: string; cursoArea?: string } | null;
      config: { nomeEscola?: string; directorGeral?: string; municipio?: string };
      disciplinas: { nome: string; cargaHoraria?: number }[];
      disciplinasComDeficiencia: { nome: string; mfd: number; anoLetivo: string }[];
    },
    tipoDoc: 'matricula' | 'reconfirmacao',
  ): string {
    const { aluno, config: cfg, disciplinas, disciplinasComDeficiencia } = payload;
    const nomeEscola = cfg.nomeEscola || 'ESCOLA';
    const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';
    const classeLabel = aluno?.classe || '—';
    const turmaNome = aluno?.turmaNome || '—';
    const nivel = aluno?.nivel || '—';
    const turno = aluno?.turno || '—';
    const anoLetivo = aluno?.anoLetivo || '—';
    const cursoNome = aluno?.cursoNome || aluno?.cursoArea || '';
    const numeroMatricula = aluno?.numeroMatricula || '—';
    const bi = aluno?.bi || aluno?.numeroCedula || '—';
    const generoLabel = aluno?.genero === 'M' ? 'Masculino' : aluno?.genero === 'F' ? 'Feminino' : (aluno?.genero || '—');
    const tituloDoc = tipoDoc === 'reconfirmacao' ? 'COMPROVATIVO DE RECONFIRMAÇÃO DE MATRÍCULA' : 'COMPROVATIVO DE MATRÍCULA';
    const subtituloDoc = tipoDoc === 'reconfirmacao' ? 'Reconfirmação de Matrícula' : 'Nova Matrícula';

    const now = new Date();
    const MESES_L = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dataHoje = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;

    function fmtDate(val?: string): string {
      if (!val) return '—';
      try { const d = new Date(val); return isNaN(d.getTime()) ? val : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; } catch { return val; }
    }

    const qrData = encodeURIComponent(JSON.stringify({ tipo: 'COMPROVATIVO_MATRICULA', nome: nomeCompleto, mat: numeroMatricula, classe: classeLabel, anoLetivo, emissao: dataHoje }));
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=86x86&data=${qrData}&bgcolor=ffffff&color=000000&margin=4`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const discRows = disciplinas.length > 0
      ? disciplinas.map((d, i) => `<tr style="background:${i%2===0?'#fff':'#f8fafc'};"><td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-size:9pt;color:#666;width:36px;">${i+1}</td><td style="padding:4px 10px;border:1px solid #e2e8f0;font-size:9.5pt;font-weight:600;">${d.nome}</td><td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-size:9pt;color:#555;">${d.cargaHoraria?d.cargaHoraria+' h/sem':'—'}</td></tr>`).join('')
      : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#888;font-size:9pt;border:1px solid #e2e8f0;">Disciplinas a definir pela secretaria após enquadramento na turma.</td></tr>`;

    const defSection = disciplinasComDeficiencia.length > 0 ? `
    <div style="margin-top:12px;border:2px solid #d97706;border-radius:4px;overflow:hidden;">
      <div style="background:#d97706;color:#fff;padding:7px 12px;">
        <div style="font-size:9.5pt;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">D — Disciplinas com Deficiência (Art. 23º §10 — Decreto 04/2026)</div>
        <div style="font-size:8pt;opacity:0.9;margin-top:2px;">Disciplinas em que o aluno transitou condicionalmente — média final entre 7 e 9 valores</div>
      </div>
      <div style="padding:10px 12px;background:#fffbeb;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#fef3c7;">
              <th style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:8.5pt;width:36px;">Nº</th>
              <th style="padding:5px 10px;border:1px solid #fbbf24;text-align:left;font-size:8.5pt;">Disciplina com Deficiência</th>
              <th style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:8.5pt;width:80px;">Média Final</th>
              <th style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:8.5pt;width:90px;">Ano Lectivo</th>
            </tr>
          </thead>
          <tbody>
            ${disciplinasComDeficiencia.map((d,i)=>`<tr style="background:${i%2===0?'#fff':'#fffbeb'};"><td style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:9pt;color:#92400e;">${i+1}</td><td style="padding:5px 10px;border:1px solid #fbbf24;font-size:9.5pt;font-weight:700;color:#78350f;">${d.nome}</td><td style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:10pt;font-weight:800;color:#d97706;">${d.mfd.toFixed(1)} val.</td><td style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:9pt;color:#92400e;">${d.anoLetivo}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

    return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${tituloDoc} — ${nomeCompleto}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4 portrait; margin:14mm 12mm; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:10pt; color:#000; background:#fff; }
  .sec-title { font-weight:800; font-size:9.5pt; padding:4px 10px; background:#f0f4f8; border-left:4px solid #1E3A5F; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>

<!-- CABEÇALHO INSTITUCIONAL -->
<table style="width:100%;border-collapse:collapse;margin-bottom:0;">
  <tr>
    <td style="width:72px;text-align:center;vertical-align:middle;padding:0 8px 0 0;">
      <img src="${origin}/angola-brasao.png" style="height:68px;width:auto;" alt="" onerror="this.style.display='none'" />
    </td>
    <td style="text-align:center;vertical-align:middle;padding:4px 0;">
      <div style="font-size:7.5pt;text-transform:uppercase;color:#555;letter-spacing:1.2px;font-weight:600;">República de Angola &bull; Ministério da Educação &bull; Ensino Geral</div>
      <div style="font-size:15pt;font-weight:900;color:#000;text-transform:uppercase;margin:4px 0;letter-spacing:0.5px;">${nomeEscola}</div>
      <div style="font-size:8pt;color:#555;">${cfg.municipio || 'Angola'}</div>
    </td>
    <td style="width:96px;text-align:center;vertical-align:middle;padding:0 0 0 8px;">
      <div style="border:1.5px solid #1E3A5F;padding:3px;display:inline-block;">
        <img src="${qrUrl}" alt="QR Code" style="width:86px;height:86px;display:block;" />
      </div>
      <div style="font-size:6pt;color:#444;margin-top:2px;font-weight:bold;">${numeroMatricula}</div>
    </td>
  </tr>
</table>
<div style="border-bottom:3px double #1E3A5F;margin:6px 0 10px;"></div>

<!-- TÍTULO DO DOCUMENTO -->
<div style="text-align:center;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;margin-bottom:8px;">
  <div style="font-size:12pt;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;">${tituloDoc}</div>
  <div style="font-size:8.5pt;color:#444;margin-top:2px;">Ano Lectivo ${anoLetivo} &nbsp;&bull;&nbsp; Emitido em: ${dataHoje}</div>
</div>

<div style="display:inline-block;background:${tipoDoc==='reconfirmacao'?'#2563eb':'#16a34a'};color:#fff;font-size:8pt;font-weight:700;padding:3px 14px;border-radius:12px;letter-spacing:0.5px;margin-bottom:12px;text-transform:uppercase;">${subtituloDoc}</div>

${aluno ? `
<!-- A — IDENTIFICAÇÃO DO ALUNO -->
<div class="sec-title">A &mdash; Identificação do Aluno</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #ccc;margin-bottom:10px;">
  <tr><td style="padding:8px 14px;width:40%;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Nome Completo</td><td style="padding:8px 14px;font-size:13pt;font-weight:900;">${nomeCompleto}</td></tr>
  <tr style="background:#f8fafc;"><td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Nº Matrícula</td><td style="padding:6px 14px;font-weight:700;">${numeroMatricula}</td></tr>
  <tr><td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">BI / Cédula</td><td style="padding:6px 14px;">${bi}</td></tr>
  <tr style="background:#f8fafc;"><td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Data de Nascimento</td><td style="padding:6px 14px;">${fmtDate(aluno.dataNascimento)}</td></tr>
  <tr><td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Género</td><td style="padding:6px 14px;">${generoLabel}</td></tr>
</table>

<!-- B — DADOS ACADÉMICOS -->
<div class="sec-title">B &mdash; Dados Académicos</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #ccc;margin-bottom:10px;">
  <tr>
    ${[['Classe',classeLabel],['Turma',turmaNome],['Nível',nivel],['Turno',turno],...(cursoNome?[['Curso / Área',cursoNome]]:[]),['Ano Lectivo',anoLetivo]].map(([l,v],i,arr)=>`<td style="padding:8px 12px;text-align:center;${i<arr.length-1?'border-right:1px solid #e5e7eb;':''}"><div style="font-size:7.5pt;color:#555;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">${l}</div><div style="font-size:11pt;font-weight:800;margin-top:2px;">${v}</div></td>`).join('')}
  </tr>
</table>
` : ''}

<!-- C — PLANO CURRICULAR -->
<div class="sec-title">C &mdash; Plano Curricular &mdash; Disciplinas da Classe ${classeLabel}</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:${defSection?'0':'12px'};">
  <thead>
    <tr style="background:#1E3A5F;color:#fff;">
      <th style="padding:6px 8px;border:1px solid #1E3A5F;text-align:center;font-size:8.5pt;width:36px;">Nº</th>
      <th style="padding:6px 10px;border:1px solid #1E3A5F;text-align:left;font-size:8.5pt;">Disciplina</th>
      <th style="padding:6px 8px;border:1px solid #1E3A5F;text-align:center;font-size:8.5pt;width:110px;">Carga Horária</th>
    </tr>
  </thead>
  <tbody>${discRows}</tbody>
  <tfoot>
    <tr style="background:#f8fafc;">
      <td colspan="2" style="padding:5px 10px;border:1px solid #e2e8f0;font-size:8.5pt;font-weight:700;color:#475569;">Total de Disciplinas</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-size:9pt;font-weight:800;color:#1E3A5F;">${disciplinas.length}</td>
    </tr>
  </tfoot>
</table>

${defSection}

<!-- DECLARAÇÃO E ASSINATURAS -->
<div style="margin-top:14px;border-top:2px solid #000;padding-top:10px;">
  <div style="font-weight:bold;text-align:center;font-size:11pt;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Declaração</div>
  <div style="font-size:9.5pt;line-height:1.7;text-align:justify;margin-bottom:6px;">
    ${aluno
      ? `O(A) aluno(a) <strong>${nomeCompleto}</strong>, portador(a) do BI/Cédula Nº <strong>${bi}</strong>, fica ciente do plano curricular da <strong>${classeLabel} Classe</strong> &mdash; Turma <strong>${turmaNome}</strong>, relativo ao Ano Lectivo <strong>${anoLetivo}</strong>,${disciplinasComDeficiencia.length>0?` e das <strong>${disciplinasComDeficiencia.length} disciplina(s) com deficiência</strong> que necessita de regularizar durante este ano lectivo,`:''} comprometendo-se a cumprir todas as obrigações académicas e o Regulamento Interno da Instituição.`
      : `O(A) candidato(a) fica ciente do plano curricular da <strong>${classeLabel} Classe</strong> para o Ano Lectivo <strong>${anoLetivo}</strong>, comprometendo-se a cumprir todas as obrigações académicas e o Regulamento Interno da Instituição.`
    }
  </div>
  <div style="text-align:center;margin:16px 0 8px;font-size:9.5pt;">
    ${cfg.municipio||'Luanda'},&nbsp;
    <span style="border-bottom:1px solid #000;display:inline-block;min-width:28px;">&nbsp;</span>&nbsp;de&nbsp;
    <span style="border-bottom:1px solid #000;display:inline-block;min-width:90px;">&nbsp;</span>&nbsp;de&nbsp;<strong>${anoLetivo.split('/')[0]||now.getFullYear()}</strong>
  </div>
  <table style="width:100%;margin-top:22px;border-collapse:collapse;">
    <tr>
      <td style="text-align:center;font-size:9pt;padding:0 6px;"><div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div><div>Assinatura do(a) Aluno(a) / Encarregado</div></td>
      <td style="text-align:center;font-size:9pt;padding:0 6px;"><div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div><div>O Funcionário da Secretaria</div></td>
      <td style="text-align:center;font-size:9pt;padding:0 6px;"><div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div><div>O Director(a) da Escola</div></td>
    </tr>
  </table>
</div>

<!-- RODAPÉ -->
<table style="width:100%;margin-top:14px;border-top:1px solid #ccc;border-collapse:collapse;">
  <tr>
    <td style="font-size:7.5pt;color:#555;padding-top:5px;">${nomeEscola}</td>
    <td style="font-size:7.5pt;color:#555;padding-top:5px;text-align:center;">Nº Matrícula: ${numeroMatricula}</td>
    <td style="font-size:7.5pt;color:#555;padding-top:5px;text-align:right;">Emitido em: ${dataHoje}</td>
  </tr>
</table>

</body>
</html>`;
  }

  // ─── Certificado de Habilitações HTML Builder ─────────────────────────────

  function numExtenso(n: number): string {
    const map: Record<number, string> = {
      0: 'Zero', 1: 'Um', 2: 'Dois', 3: 'Três', 4: 'Quatro', 5: 'Cinco',
      6: 'Seis', 7: 'Sete', 8: 'Oito', 9: 'Nove', 10: 'Dez', 11: 'Onze',
      12: 'Doze', 13: 'Treze', 14: 'Catorze', 15: 'Quinze', 16: 'Dezasseis',
      17: 'Dezassete', 18: 'Dezoito', 19: 'Dezanove', 20: 'Vinte',
    };
    return map[Math.round(n)] ?? String(Math.round(n));
  }

  type DisciplinaRow = { nome: string; notaVar: string };

  const DISCIPLINAS_POR_CLASSE: Record<string, DisciplinaRow[]> = {
    '11ª': [
      { nome: 'Língua Portuguesa',   notaVar: '{{NOTA_LP}}' },
      { nome: 'Língua Estrangeira',   notaVar: '{{NOTA_LE}}' },
      { nome: 'Matemática',           notaVar: '{{NOTA_MAT}}' },
      { nome: 'Informática',          notaVar: '{{NOTA_INF}}' },
      { nome: 'Educação Física',      notaVar: '{{NOTA_EF}}' },
      { nome: 'Direito',              notaVar: '{{NOTA_DIR}}' },
      { nome: 'Economia',             notaVar: '{{NOTA_ECO}}' },
      { nome: 'Gestão de Empresas',   notaVar: '{{NOTA_GEST}}' },
      { nome: 'Contabilidade',        notaVar: '{{NOTA_CONT}}' },
    ],
    '12ª': [
      { nome: 'Língua Portuguesa',    notaVar: '{{NOTA_LP}}' },
      { nome: 'Língua Estrangeira',   notaVar: '{{NOTA_LE}}' },
      { nome: 'Matemática',           notaVar: '{{NOTA_MAT}}' },
      { nome: 'Filosofia',            notaVar: '{{NOTA_FIL}}' },
      { nome: 'Educação Física',      notaVar: '{{NOTA_EF}}' },
      { nome: 'Direito Comercial',    notaVar: '{{NOTA_DIR_COM}}' },
      { nome: 'Economia Política',    notaVar: '{{NOTA_ECO_POL}}' },
      { nome: 'Contabilidade e Gestão', notaVar: '{{NOTA_CONT_GEST}}' },
      { nome: 'Empreendedorismo',     notaVar: '{{NOTA_EMPREEND}}' },
    ],
    '13ª': [
      { nome: 'Língua Portuguesa',    notaVar: '{{NOTA_LP}}' },
      { nome: 'Língua Estrangeira',   notaVar: '{{NOTA_LE}}' },
      { nome: 'Matemática',           notaVar: '{{NOTA_MAT}}' },
      { nome: 'Filosofia',            notaVar: '{{NOTA_FIL}}' },
      { nome: 'Educação Física',      notaVar: '{{NOTA_EF}}' },
      { nome: 'Direito Empresarial',  notaVar: '{{NOTA_DIR_EMP}}' },
      { nome: 'Economia Avançada',    notaVar: '{{NOTA_ECO_AV}}' },
      { nome: 'Gestão Financeira',    notaVar: '{{NOTA_GEST_FIN}}' },
      { nome: 'Contabilidade Avançada', notaVar: '{{NOTA_CONT_AV}}' },
    ],
  };

  function buildCertificadoHabilitacoesHtml(alunoId: string, classeAlvo: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const turma = turmas.find(t => t.id === aluno.turmaId);
    const escola = config.nomeEscola || 'Super Escola';
    const director = directorGeral;
    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
    const anoLetivo = turma?.anoLetivo || String(now.getFullYear());

    const nome = `${aluno.nome} ${aluno.apelido}`;
    const diaNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getDate() : '__';
    const mesNasc = aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '__________';
    const anoNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const municipio = aluno.municipio || '______________';
    const provincia = aluno.provincia || '______________';
    const encarregado = aluno.nomeEncarregado || '________________________';

    // Resolve grades for this student
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);
    const notaByDisc: Record<string, number> = {};
    for (const n of alunoNotas) {
      notaByDisc[n.disciplina.toLowerCase().trim()] = n.nf;
    }
    function resolveNota(tag: string): number | null {
      const candidates = DISCIPLINA_NOTA_MAP[tag] || [];
      for (const c of candidates) {
        if (notaByDisc[c] !== undefined) return notaByDisc[c];
      }
      const direct = alunoNotas.find(n => buildNotaTagFromDisciplina(n.disciplina) === tag);
      if (direct?.nf !== undefined) return direct.nf;
      return null;
    }

    const disciplinas = DISCIPLINAS_POR_CLASSE[classeAlvo] || [];
    const resolvedGrades = disciplinas.map(d => ({
      ...d,
      nota: resolveNota(d.notaVar),
    }));

    // Calculate average (only over resolved grades)
    const withGrades = resolvedGrades.filter(g => g.nota !== null);
    const avg = withGrades.length > 0
      ? withGrades.reduce((s, g) => s + (g.nota ?? 0), 0) / withGrades.length
      : null;
    const avgRounded = avg !== null ? Math.round(avg) : null;
    const avgDisplay = avgRounded !== null ? String(avgRounded) : '____';
    const avgExtenso = avgRounded !== null ? numExtenso(avgRounded) : '________';

    const cicloLabel = 'II CICLO DO ENSINO SECUNDÁRIO GERAL';
    const classeLabel = classeAlvo === '13ª'
      ? 'Pré-Universitário — 13ª Classe'
      : `IIº Ciclo — ${classeAlvo} Classe`;

    // Grade table rows
    const tableRows = resolvedGrades.map(g => {
      const nota = g.nota !== null ? Math.round(g.nota) : null;
      const notaStr = nota !== null ? String(nota) : '—';
      const extensoStr = nota !== null ? numExtenso(nota) + ' Valores' : '—';
      return `<tr>
        <td style="text-align:left;padding:4px 8px;">${g.nome}</td>
        <td style="text-align:center;font-weight:bold;">${notaStr}</td>
        <td style="text-align:center;">${notaStr !== '—' ? notaStr : '—'}</td>
        <td style="text-align:right;padding-right:8px;">${extensoStr}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado de Habilitações — ${nome} — ${classeAlvo} Classe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 12px; color: #000; padding: 30px 50px; line-height: 1.7; }
    .header { text-align: center; margin-bottom: 16px; }
    .header p { margin: 2px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .header .escola-nome { font-size: 12px; font-style: italic; font-weight: bold; }
    .header .ensino { font-size: 11px; font-weight: bold; }
    .titulo { text-align: center; font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin: 20px 0 20px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 10px 0; }
    .body { text-align: justify; margin-bottom: 16px; }
    .body p { margin-bottom: 8px; }
    .nome-aluno { color: #c00; font-weight: bold; text-decoration: none; }
    .bold { font-weight: bold; }
    .italic-bold { font-style: italic; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11.5px; }
    table th { background: #eee; border: 1px solid #333; padding: 5px 8px; font-weight: bold; }
    table td { border: 1px solid #555; padding: 4px 6px; }
    .media-row td { font-weight: bold; background: #f5f5f5; border-top: 2px solid #000; }
    .legal { text-align: justify; margin: 16px 0; }
    .date { text-align: center; margin: 24px 0 32px; font-size: 12px; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 20px; }
    .sig-block { text-align: center; min-width: 220px; }
    .sig-label { font-size: 11.5px; font-weight: bold; margin-bottom: 32px; }
    .sig-line { width: 200px; border-top: 1px solid #000; margin: 0 auto 4px; }
    .sig-name { font-size: 11px; }
    @media print { @page { size: A4; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
    <p>República de Angola</p>
    <p>Ministério da Educação</p>
    <p class="escola-nome">${escola}</p>
    <p class="ensino">Ensino Geral</p>
  </div>

  <div class="titulo">Certificado de Habilitações</div>

  <div class="body">
    <p>
      <span class="italic-bold">${director}, Director(a) do <em>${escola}</em></span>,
      criado sob o Decreto Executivo ____/_____ de __ de __________.
    </p>
    <p>
      Certifica que: <span class="nome-aluno">${nome}</span>,
      filho(a) de <span class="bold">${encarregado}</span>,
      e de <span class="bold">________________________</span>,
      nascido(a) aos <span class="bold">${diaNasc}</span> de
      <span class="bold">${mesNasc}</span> de
      <span class="bold">${anoNasc}</span>,
      natural de <span class="bold">______________</span>,
      Município de <span class="bold">${municipio}</span>,
      Província de <span class="bold">${provincia}</span>,
      portador(a) do BI nº <span class="bold">________________________</span>,
      emitido aos <span class="bold">__</span> de
      <span class="bold">______________</span> de
      <span class="bold">____</span>,
      passado pelo Arquivo de Identificação Nacional de
      <span class="bold">${provincia}</span>.
    </p>
    <p>
      Concluiu no Ano Lectivo de <span class="bold">${anoLetivo}</span>
      o <span class="bold">${cicloLabel}</span>,
      conforme o disposto na alínea b) do artigo 109º da LBEE 17/16 de 7 de Outubro,
      ${classeLabel}, com a Média Final de
      (<span class="bold">${avgDisplay}</span>)
      <span class="bold">${avgExtenso} Valores</span>
      obtida nas seguintes classificações por ciclos de aprendizagem:
    </p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left;width:42%;">Disciplina</th>
        <th style="text-align:center;width:14%;">${classeAlvo} Classe</th>
        <th style="text-align:center;width:14%;">Média Final</th>
        <th style="text-align:right;width:30%;">Média por extenso</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="media-row">
        <td style="text-align:left;padding:4px 8px;">Média Geral Final</td>
        <td></td>
        <td style="text-align:center;">${avgDisplay}</td>
        <td style="text-align:right;padding-right:8px;">${avgExtenso} Valores</td>
      </tr>
    </tbody>
  </table>

  <div class="legal">
    <p>
      Por efeitos legais, lhe é passado o presente
      <span class="bold">CERTIFICADO</span>,
      que consta no livro de termos nº <span class="bold">____</span>,
      folha <span class="bold">____</span>,
      assinado por mim e autenticado com carimbo a óleo em uso neste Estabelecimento de Ensino.
    </p>
  </div>

  <div class="date">Luanda aos ${dataActual}</div>

  ${buildSigRow(directorGeral, directorPedagogico, directorProvincialEducacao)}
</body>
</html>`;
  }

  // ─── Mapa de Frequências — Por Curso e Classe ────────────────────────────────

  function buildMapaFrequenciasHtml(cicloFilter?: 'PRIMARIO' | 'I_CICLO' | 'II_CICLO'): string {
    const escola = config.nomeEscola || 'Complexo Escolar';
    const subdirector = directorPedagogico;
    const director = directorGeral;
    const now = new Date();
    const dataLocal = `${config.municipio || 'Luanda'}, ${String(now.getDate()).padStart(2,'0')} / ${String(now.getMonth()+1).padStart(2,'0')} / ${now.getFullYear()}`;

    const sortedTurmasFq = [...turmas].sort((a,b) => b.anoLetivo.localeCompare(a.anoLetivo));
    const anoLetivo = sortedTurmasFq[0]?.anoLetivo || String(now.getFullYear());
    const anoLetivoSlashFq = (anoLetivo.includes('/') || anoLetivo.includes('-'))
      ? anoLetivo.replace(/-/g, '/')
      : `${anoLetivo}/${String(Number(anoLetivo)+1).slice(-2)}`;

    // Classes alvo por ciclo
    const tem13Fq = (config as any).temDecimaTermeira !== false;
    const ciclo = cicloFilter || 'II_CICLO';
    const TARGET_PREFIXES_FQ =
      ciclo === 'PRIMARIO' ? ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'] :
      ciclo === 'I_CICLO'  ? ['7ª', '8ª', '9ª'] :
                             (tem13Fq ? ['10ª', '11ª', '12ª', '13ª'] : ['10ª', '11ª', '12ª']);
    const cicloLabel =
      ciclo === 'PRIMARIO' ? 'Primário' :
      ciclo === 'I_CICLO'  ? 'I Ciclo'  : 'II Ciclo';

    const activeTurmasFq = turmas.filter(t => t.ativo && TARGET_PREFIXES_FQ.some(p => t.classe.startsWith(p)));

    const existingClassesFq = TARGET_PREFIXES_FQ.filter(p =>
      activeTurmasFq.some(t => t.classe.startsWith(p))
    );

    // Estatísticas por grupo de turmaIds
    function fqGroupStats(turmaIds: string[]) {
      const nTurmas = turmaIds.length;
      const grpAlunos = alunos.filter(a => a.ativo && turmaIds.includes(a.turmaId || ''));
      const matM = grpAlunos.filter(a => a.genero !== 'F').length;
      const matF = grpAlunos.filter(a => a.genero === 'F').length;
      return { nTurmas, matM, matF, matTotal: matM + matF };
    }

    // Agrupar por cursoId → nome do curso real; fallback "Ensino Geral (nivel)"
    const cursoMapFq = new Map<string, string[]>();
    for (const t of activeTurmasFq) {
      const key = (t as any).cursoId || `__sem_curso__${t.nivel || 'Ensino'}`;
      if (!cursoMapFq.has(key)) cursoMapFq.set(key, []);
      cursoMapFq.get(key)!.push(t.id);
    }

    type FqCursoRow = { label: string; turmaIds: string[] };
    const cursoRowsFq: FqCursoRow[] = [...cursoMapFq.entries()].map(([key, ids]) => {
      if (key.startsWith('__sem_curso__')) {
        const nivel = key.replace('__sem_curso__', '');
        return { label: `Ensino Geral (${nivel})`, turmaIds: ids };
      }
      const curso = cursos.find(c => c.id === key);
      return { label: curso ? curso.nome : key, turmaIds: ids };
    });

    // Cabeçalhos das colunas por classe
    const BG_HEADER = '#1a6b3c';
    const BG_SUB    = '#a8d5a2';
    const BG_MF     = '#c6efce';

    const classColHeadersFq = existingClassesFq.map(cls =>
      `<th colspan="4" style="border:1px solid #000;background:${BG_HEADER} !important;color:#fff;font-size:8.5px;text-align:center;padding:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${cls} Classe</th>`
    ).join('');

    const classSubHeadersFq = existingClassesFq.map(() =>
      `<th style="border:1px solid #1a3a1a;background:${BG_SUB} !important;color:#1a3a1a;font-size:7.5px;padding:2px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Nº<br/>Turmas</th>
       <th colspan="3" style="border:1px solid #1a3a1a;background:${BG_SUB} !important;color:#1a3a1a;font-size:7.5px;padding:2px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Alunos Matriculados</th>`
    ).join('');

    const mfRowFq = existingClassesFq.map(() =>
      `<th style="border:1px solid #1a3a1a;background:${BG_MF} !important;color:#1a3a1a;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></th>
       <th style="border:1px solid #1a3a1a;background:${BG_MF} !important;color:#1a3a1a;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">M</th>
       <th style="border:1px solid #1a3a1a;background:${BG_MF} !important;color:#1a3a1a;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">F</th>
       <th style="border:1px solid #1a3a1a;background:${BG_MF} !important;color:#1a3a1a;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Total</th>`
    ).join('');

    // Acumuladores totais
    const grandFq = { nTurmas: 0, matM: 0, matF: 0, matTotal: 0 };
    const classGrandFq: Record<string, { nTurmas: number; matM: number; matF: number; matTotal: number }> = {};
    for (const cls of existingClassesFq) classGrandFq[cls] = { nTurmas: 0, matM: 0, matF: 0, matTotal: 0 };

    // Linhas de dados
    const dataRowsFq = cursoRowsFq.map((cr, idx) => {
      let cells = '';
      let rowTurmas = 0, rowM = 0, rowF = 0, rowTotal = 0;
      const rowBg = idx % 2 === 0 ? '#eef9ee' : '#ffffff';

      for (const cls of existingClassesFq) {
        const clsIds = cr.turmaIds.filter(id => {
          const t = turmas.find(t => t.id === id);
          return t && t.classe.startsWith(cls);
        });
        const s = fqGroupStats(clsIds);
        cells += `
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;color:#155724;">${s.nTurmas || 0}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;color:#155724;">${s.matM}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;color:#155724;">${s.matF}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;font-weight:bold;background:#d4edda !important;color:#155724;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${s.matTotal}</td>`;
        rowTurmas += s.nTurmas; rowM += s.matM; rowF += s.matF; rowTotal += s.matTotal;
        classGrandFq[cls].nTurmas += s.nTurmas;
        classGrandFq[cls].matM    += s.matM;
        classGrandFq[cls].matF    += s.matF;
        classGrandFq[cls].matTotal+= s.matTotal;
      }
      grandFq.nTurmas += rowTurmas; grandFq.matM += rowM; grandFq.matF += rowF; grandFq.matTotal += rowTotal;

      return `<tr style="background:${rowBg};">
        <td style="border:1px solid #1a3a1a;padding:2px 5px;font-size:8.5px;font-weight:bold;color:#155724;">${cr.label}</td>
        ${cells}
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;color:#155724;">${rowTurmas}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;color:#155724;">${rowM}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;color:#155724;">${rowF}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;background:#d4edda !important;color:#155724;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${rowTotal}</td>
      </tr>`;
    });

    // Linha de totais
    let totalCells = '';
    for (const cls of existingClassesFq) {
      const cg = classGrandFq[cls];
      totalCells += `
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;font-weight:bold;color:#fff;">${cg.nTurmas}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;font-weight:bold;color:#fff;">${cg.matM}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;font-weight:bold;color:#fff;">${cg.matF}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:9px;font-weight:bold;color:#fff;">${cg.matTotal}</td>`;
    }

    return `<table style="border-collapse:collapse;width:100%;table-layout:auto;font-family:Calibri,Arial,sans-serif;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;">
    <thead>
      <tr>
        <th rowspan="3" style="border:1px solid #000;padding:2px 4px;background:${BG_HEADER} !important;color:#fff;font-size:8px;text-align:center;vertical-align:middle;min-width:130px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Nome do Curso</th>
        ${classColHeadersFq}
        <th colspan="4" rowspan="2" style="border:1px solid #000;background:${BG_HEADER} !important;color:#fff;font-size:8px;text-align:center;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact;">TOTAL GERAL</th>
      </tr>
      <tr>
        ${classSubHeadersFq}
      </tr>
      <tr>
        ${mfRowFq}
        <th style="border:1px solid #000;background:${BG_MF} !important;color:#fff;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Nº T.</th>
        <th style="border:1px solid #000;background:${BG_MF} !important;color:#fff;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">M</th>
        <th style="border:1px solid #000;background:${BG_MF} !important;color:#fff;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">F</th>
        <th style="border:1px solid #000;background:${BG_MF} !important;color:#fff;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${dataRowsFq.join('\n')}
      <tr style="background:${BG_HEADER} !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <td style="border:1px solid #1a3a1a;padding:2px 5px;font-size:8.5px;font-weight:bold;color:#fff;">Total</td>
        ${totalCells}
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;color:#fff;">${grandFq.nTurmas}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;color:#fff;">${grandFq.matM}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;color:#fff;">${grandFq.matF}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;color:#fff;">${grandFq.matTotal}</td>
      </tr>
    </tbody>
  </table>`;
  }

  // ─── Mapa de Aproveitamento — Por Curso e Classe (10ª–13ª) ─────────────────

  function buildMapaPorCursoClasseHtml(trimestre: 1 | 2 | 3, periodoOverride?: string, cicloFilter?: 'PRIMARIO' | 'I_CICLO' | 'II_CICLO'): string {
    const escola = config.nomeEscola || 'Complexo Escolar';
    const subdirector = directorPedagogico;
    const director = directorGeral;
    const now = new Date();
    const dataLocal = `${config.municipio || 'Luanda'}, ${String(now.getDate()).padStart(2,'0')} / ${String(now.getMonth()+1).padStart(2,'0')} / ${now.getFullYear()}`;

    const sortedTurmas3 = [...turmas].sort((a,b) => b.anoLetivo.localeCompare(a.anoLetivo));
    const anoLetivo = sortedTurmas3[0]?.anoLetivo || String(now.getFullYear());
    const anoLetivoSlash3 = (anoLetivo.includes('/') || anoLetivo.includes('-'))
      ? anoLetivo.replace(/-/g, '/')
      : `${anoLetivo}/${String(Number(anoLetivo)+1).slice(-2)}`;

    // Target classes by ciclo
    const tem13Ap = (config as any).temDecimaTermeira !== false;
    const ciclo = cicloFilter || 'II_CICLO';
    const TARGET_PREFIXES =
      ciclo === 'PRIMARIO' ? ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'] :
      ciclo === 'I_CICLO'  ? ['7ª', '8ª', '9ª'] :
                             (tem13Ap ? ['10ª', '11ª', '12ª', '13ª'] : ['10ª', '11ª', '12ª']);
    const cicloLabel =
      ciclo === 'PRIMARIO' ? 'Primário' :
      ciclo === 'I_CICLO'  ? 'I Ciclo'  : 'II Ciclo';

    const activeTurmas = turmas.filter(t => t.ativo && TARGET_PREFIXES.some(p => t.classe.startsWith(p)));

    const existingClasses = TARGET_PREFIXES.filter(p =>
      activeTurmas.some(t => t.classe.startsWith(p))
    );

    // Período/Regime
    let periodoLabel3: string;
    if (periodoOverride && periodoOverride !== 'AUTO') {
      periodoLabel3 = periodoOverride;
    } else {
      const turnosPresentes3 = Array.from(new Set(
        activeTurmas.map(t => (t.turno || '').trim()).filter(Boolean)
      ));
      periodoLabel3 = turnosPresentes3.length === 0
        ? 'Manhã'
        : turnosPresentes3.length === 1
          ? turnosPresentes3[0]
          : turnosPresentes3.join(' / ');
    }

    // Helper: stats for a group of turmaIds
    function groupStats(turmaIds: string[]) {
      const allInGroup = alunos.filter(a => turmaIds.includes(a.turmaId || ''));
      const damteSits = ['desistente', 'anulacao_matricula', 'transferido', 'excluido'];
      const isDamte = (a: any) => {
        const s = (a.situacao || '').toLowerCase();
        if (damteSits.includes(s)) return true;
        // fallback (alunos antigos sem situacao registada)
        return !s && a.ativo === false;
      };
      const damteAlunos = allInGroup.filter(isDamte);
      const groupAlunos = allInGroup.filter(a => !isDamte(a) && a.ativo);

      const notasTri = notas.filter(n => turmaIds.includes(n.turmaId || '') && n.trimestre === trimestre);

      const avaliadosIds = [...new Set(notasTri.map(n => n.alunoId))];
      const aprovadosIds = avaliadosIds.filter(id => {
        const ns = notasTri.filter(n => n.alunoId === id);
        return ns.length > 0 && (ns.reduce((s, n) => s + n.nf, 0) / ns.length) >= 10;
      });
      const reprovadosIds = avaliadosIds.filter(id => !aprovadosIds.includes(id));

      const aprovM = aprovadosIds.filter(id => groupAlunos.find(a => a.id === id)?.genero !== 'F').length;
      const aprovF = aprovadosIds.filter(id => groupAlunos.find(a => a.id === id)?.genero === 'F').length;
      const reprovM = reprovadosIds.filter(id => groupAlunos.find(a => a.id === id)?.genero !== 'F').length;
      const reprovF = reprovadosIds.filter(id => groupAlunos.find(a => a.id === id)?.genero === 'F').length;

      const damteM = damteAlunos.filter(a => a.genero !== 'F').length;
      const damteF = damteAlunos.filter(a => a.genero === 'F').length;
      return {
        aprovM, aprovF, aprovT: aprovM + aprovF,
        reprovM, reprovF, reprovT: reprovM + reprovF,
        damteM, damteF, damteT: damteM + damteF,
      };
    }

    // Build rows: one row per "curso" — since we don't have explicit curso field,
    // we derive groups by turma.nivel or show a single all-school row.
    // Approach: group turmas by nivel within target classes → one row per nivel group.
    type CursoRow = {
      label: string;
      turmaIds: string[];
    };

    // Group turmas by cursoId → show real course name; fallback "Ensino Geral (nivel)"
    const cursoMap = new Map<string, string[]>();
    for (const t of activeTurmas) {
      const key = (t as any).cursoId || `__sem_curso__${t.nivel || 'Ensino'}`;
      if (!cursoMap.has(key)) cursoMap.set(key, []);
      cursoMap.get(key)!.push(t.id);
    }

    const cursoRows: CursoRow[] = [...cursoMap.entries()].map(([key, ids]) => {
      if (key.startsWith('__sem_curso__')) {
        const nivel = key.replace('__sem_curso__', '');
        return { label: `Ensino Geral (${nivel})`, turmaIds: ids };
      }
      const curso = cursos.find(c => c.id === key);
      return { label: curso ? curso.nome : key, turmaIds: ids };
    });

    // Build class-level columns header (same green palette as mini-pauta)
    const classColHeaders = existingClasses.map(cls => `
      <th colspan="9" style="border:1px solid #000;background-color:#1a6b3c !important;color:#fff;font-size:8px;text-align:center;">${cls} Classe</th>`).join('');

    const classSubHeaders = existingClasses.map(() => `
      <th colspan="3" style="border:1px solid #1a3a1a;background-color:#a8d5a2 !important;color:#1a3a1a;font-size:7.5px;text-align:center;">Alunos Aprovados</th>
      <th colspan="3" style="border:1px solid #1a3a1a;background-color:#a8d5a2 !important;color:#1a3a1a;font-size:7.5px;text-align:center;">Alunos Reprovados</th>
      <th colspan="3" style="border:1px solid #1a3a1a;background-color:#a8d5a2 !important;color:#1a3a1a;font-size:7.5px;text-align:center;">Alunos D-AM-T-E</th>`).join('');

    // 3 groups × 3 cols per class
    const mfRow = existingClasses.map(() => `
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">M</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">F</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">Total</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">M</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">F</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">Total</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">M</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">F</th>
      <th style="border:1px solid #1a3a1a;background-color:#c6efce !important;color:#1a3a1a;font-size:7px;padding:1px 2px;">Total</th>`).join('');

    // Build data rows
    const totals = { aprovM: 0, aprovF: 0, aprovT: 0, reprovM: 0, reprovF: 0, reprovT: 0, damteM: 0, damteF: 0, damteT: 0 };

    const dataRows = cursoRows.map((cr, idx) => {
      let rowCells = '';
      let rowAprovT = 0, rowReprovT = 0, rowDamteT = 0;
      const rowBg = idx % 2 === 0 ? '#e8f5e9' : '#ffffff';

      for (const cls of existingClasses) {
        const clsTurmaIds = cr.turmaIds.filter(id => {
          const t = turmas.find(t => t.id === id);
          return t && t.classe.startsWith(cls);
        });
        const s = groupStats(clsTurmaIds);
        rowCells += `
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#155724;">${s.aprovM}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#155724;">${s.aprovF}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;background-color:#d4edda !important;color:#155724;">${s.aprovT}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#cc0000;">${s.reprovM}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#cc0000;">${s.reprovF}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;background-color:#fde2e2 !important;color:#cc0000;">${s.reprovT}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#777;">${s.damteM || 0}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#777;">${s.damteF || 0}</td>
          <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#777;">${s.damteT || 0}</td>`;
        rowAprovT += s.aprovT;
        rowReprovT += s.reprovT;
        rowDamteT += s.damteT;
        totals.aprovM += s.aprovM; totals.aprovF += s.aprovF; totals.aprovT += s.aprovT;
        totals.reprovM += s.reprovM; totals.reprovF += s.reprovF; totals.reprovT += s.reprovT;
        totals.damteM += s.damteM; totals.damteF += s.damteF; totals.damteT += s.damteT;
      }

      return `<tr style="background:${rowBg};">
        <td style="border:1px solid #1a3a1a;padding:2px 5px;font-size:8.5px;font-weight:bold;color:#1a3a1a;">${cr.label}</td>
        ${rowCells}
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;background-color:#c6efce !important;color:#155724;">${rowAprovT}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;font-weight:bold;background-color:#fde2e2 !important;color:#cc0000;">${rowReprovT}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;color:#777;">${rowDamteT}</td>
      </tr>`;
    });

    // Total row
    let totalRowCells = '';
    for (const cls of existingClasses) {
      const clsTurmaIds = activeTurmas.filter(t => t.classe.startsWith(cls)).map(t => t.id);
      const s = groupStats(clsTurmaIds);
      totalRowCells += `
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;color:#155724;">${s.aprovM}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;color:#155724;">${s.aprovF}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;background-color:#a8d5a2 !important;color:#155724;">${s.aprovT}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;color:#cc0000;">${s.reprovM}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;color:#cc0000;">${s.reprovF}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;font-weight:bold;background-color:#fbb6b6 !important;color:#cc0000;">${s.reprovT}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#777;">${s.damteM || 0}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#777;">${s.damteF || 0}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8px;color:#777;">${s.damteT || 0}</td>`;
    }

    const triLabel3 = trimestre === 1 ? 'I' : trimestre === 2 ? 'II' : 'III';

    return `<table style="border-collapse:collapse;width:100%;table-layout:auto;font-family:Calibri,Arial,sans-serif;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;">
    <thead>
      <tr>
        <th rowspan="3" style="border:1px solid #000;padding:2px 4px;background-color:#1a6b3c !important;color:#fff;font-size:8px;text-align:center;vertical-align:middle;min-width:120px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Nome do Curso</th>
        ${classColHeaders}
        <th colspan="3" rowspan="2" style="border:1px solid #000;background-color:#1a6b3c !important;color:#fff;font-size:8px;text-align:center;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact;">TOTAL GERAL</th>
      </tr>
      <tr>
        ${classSubHeaders}
      </tr>
      <tr>
        ${mfRow}
        <th style="border:1px solid #1a3a1a;background-color:#a8d5a2 !important;color:#155724;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Aptos MF</th>
        <th style="border:1px solid #1a3a1a;background-color:#fbb6b6 !important;color:#cc0000;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">N/Apt MF</th>
        <th style="border:1px solid #1a3a1a;background-color:#e0e0e0 !important;color:#555;font-size:7px;padding:1px 2px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">D-AM-T-E MF</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows.join('\n')}
      <tr style="background-color:#c6efce !important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <td style="border:1px solid #1a3a1a;padding:2px 5px;font-size:8.5px;color:#1a3a1a;">Total</td>
        ${totalRowCells}
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;background-color:#a8d5a2 !important;color:#155724;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${totals.aprovT}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;background-color:#fbb6b6 !important;color:#cc0000;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${totals.reprovT}</td>
        <td style="border:1px solid #1a3a1a;text-align:center;font-size:8.5px;color:#555;">${totals.damteT}</td>
      </tr>
    </tbody>
  </table>`;
  }

  // ─── Mapa de Aproveitamento — Oficial MED (Por Nível e Classe) HTML Builder ───

  function buildMapaOficialMEDHtml(trimestre: 1 | 2 | 3, periodoOverride?: string): string {
    const escola = config.nomeEscola || 'Super Escola';
    const municipio = (config as any).municipio || 'Luanda';
    const provincia = (config as any).provincia || 'Luanda';
    const subdirector = directorPedagogico;
    const director = directorGeral;
    const now = new Date();
    const sortedT = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
    const anoLetivo = sortedT[0]?.anoLetivo || String(now.getFullYear());
    const anoLetivoSlash = (anoLetivo.includes('/') || anoLetivo.includes('-'))
      ? anoLetivo.replace(/-/g, '/')
      : `${anoLetivo}/${String(Number(anoLetivo) + 1).slice(-2)}`;

    let periodoLabel: string;
    if (periodoOverride && periodoOverride !== 'AUTO') {
      periodoLabel = periodoOverride;
    } else {
      const allTurnos = [...new Set(turmas.filter(t => t.ativo).map(t => (t.turno || '').trim()).filter(Boolean))];
      periodoLabel = allTurnos.length === 0 ? 'Diurno' : allTurnos.length === 1 ? allTurnos[0] : allTurnos.join(' / ');
    }

    const triLabel = trimestre === 1 ? 'Iº' : trimestre === 2 ? 'IIº' : 'IIIº';
    const dataLocal = `${municipio}, ${String(now.getDate()).padStart(2, '0')} de ${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][now.getMonth()]} de ${now.getFullYear()}`;

    // ── Class groups by NÍVEL ──────────────────────────────────────────────
    const NIVEIS: { label: string; prefixes: string[] }[] = [
      { label: 'ENSINO\nPRIMÁRIO', prefixes: ['Inic', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª'] },
      { label: '1º\nCICLO',        prefixes: ['7ª', '8ª', '9ª'] },
      { label: '2º\nCICLO',        prefixes: ['10ª', '11ª', '12ª'] },
    ];
    const CLASSE_LABELS: Record<string, string> = {
      'Inic': 'Iniciação', '1ª': '1ª Classe', '2ª': '2ª Classe', '3ª': '3ª Classe',
      '4ª': '4ª Classe', '5ª': '5ª Classe', '6ª': '6ª Classe',
      '7ª': '7ª Classe', '8ª': '8ª Classe', '9ª': '9ª Classe',
      '10ª': '10ª Classe', '11ª': '11ª Classe', '12ª': '12ª Classe',
    };

    // ── Helper: compute stats for turmaIds in given classe prefix ─────────
    function classeStats(prefix: string) {
      const classeT = turmas.filter(t => t.ativo && t.classe.startsWith(prefix));
      const classeIds = classeT.map(t => t.id);
      const todosAlunos = alunos.filter(a => classeIds.includes(a.turmaId || ''));
      const isF = (a: any) => a.genero === 'F';
      const isDes = (a: any) => (a.situacao || '').toLowerCase() === 'desistente';

      const matM = todosAlunos.filter(a => !isF(a)).length;
      const matF = todosAlunos.filter(isF).length;
      const desM = todosAlunos.filter(a => isDes(a) && !isF(a)).length;
      const desF = todosAlunos.filter(a => isDes(a) && isF(a)).length;

      const notasTri = notas.filter(n => classeIds.includes(n.turmaId || '') && n.trimestre === trimestre);
      const avalIds = [...new Set(notasTri.map(n => n.alunoId))];
      const avalM = avalIds.filter(id => todosAlunos.find(a => a.id === id && !isF(a))).length;
      const avalF = avalIds.filter(id => todosAlunos.find(a => a.id === id && isF(a))).length;

      const aprovIds = avalIds.filter(id => {
        const ns = notasTri.filter(n => n.alunoId === id);
        return ns.length > 0 && (ns.reduce((s, n) => s + (n.nf || 0), 0) / ns.length) >= 10;
      });
      const aprovM = aprovIds.filter(id => todosAlunos.find(a => a.id === id && !isF(a))).length;
      const aprovF = aprovIds.filter(id => todosAlunos.find(a => a.id === id && isF(a))).length;
      const aprovT = aprovM + aprovF;
      const avalT = avalM + avalF;
      const aprovPct = avalT > 0 ? Math.round((aprovT / avalT) * 100) : 0;

      const reprovIds = avalIds.filter(id => !aprovIds.includes(id));
      const reprovM = reprovIds.filter(id => todosAlunos.find(a => a.id === id && !isF(a))).length;
      const reprovF = reprovIds.filter(id => todosAlunos.find(a => a.id === id && isF(a))).length;
      const reprovT = reprovM + reprovF;
      const reprovPct = avalT > 0 ? Math.round((reprovT / avalT) * 100) : 0;

      // Professors in this classe
      const profIds = [...new Set(classeT.map(t => (t as any).professorId).filter(Boolean))];
      const profsClassE = professores.filter(p => profIds.includes(p.id));
      const profM = profsClassE.filter(p => p.genero !== 'F').length;
      const profF = profsClassE.filter(p => p.genero === 'F').length;

      return { matM, matF, desM, desF, avalM, avalF, aprovM, aprovF, aprovPct, reprovM, reprovF, reprovPct, profM, profF, hasData: classeT.length > 0 };
    }

    // ── Styles (used in bodyRows template strings) ────────────────────────────
    const B = 'border:1px solid #000;';
    const tdC = `${B}text-align:center;padding:1px 2px;font-size:7px;overflow:hidden;`;
    const tdL = `${B}padding:1px 3px;font-size:7px;overflow:hidden;`;

    // ── Build rows ────────────────────────────────────────────────────────────
    let bodyRows = '';
    const grandTot = { matM:0,matF:0, desM:0,desF:0, avalM:0,avalF:0, aprovM:0,aprovF:0, reprovM:0,reprovF:0, profM:0,profF:0 };

    NIVEIS.forEach(nivel => {
      // Only include classes that have at least one active turma
      const activePrefixes = nivel.prefixes.filter(p =>
        turmas.some(t => t.ativo && t.classe.startsWith(p))
      );
      if (activePrefixes.length === 0) {
        // Show greyed-out block for II CICLO when no classes exist
        const rowspan = nivel.prefixes.length + 1;
        bodyRows += `<tr>
          <td rowspan="${rowspan}" style="${tdC}font-weight:bold;background:#e8e8e8;vertical-align:middle;writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);white-space:pre-line;">${nivel.label}</td>
          <td colspan="14" style="${tdC}color:#999;font-style:italic;">Sem turmas activas neste nível</td>
        </tr>`;
        return;
      }

      const nivelTot = { matM:0,matF:0, desM:0,desF:0, avalM:0,avalF:0, aprovM:0,aprovF:0, reprovM:0,reprovF:0, profM:0,profF:0 };
      let dataRowsNivel = '';

      activePrefixes.forEach((prefix, idx) => {
        const s = classeStats(prefix);
        nivelTot.matM += s.matM; nivelTot.matF += s.matF;
        nivelTot.desM += s.desM; nivelTot.desF += s.desF;
        nivelTot.avalM += s.avalM; nivelTot.avalF += s.avalF;
        nivelTot.aprovM += s.aprovM; nivelTot.aprovF += s.aprovF;
        nivelTot.reprovM += s.reprovM; nivelTot.reprovF += s.reprovF;
        nivelTot.profM += s.profM; nivelTot.profF += s.profF;

        const nivelCell = idx === 0
          ? `<td rowspan="${activePrefixes.length + 1}" style="${tdC}font-weight:bold;background:#d0d0d0;vertical-align:middle;writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);white-space:pre-line;">${nivel.label}</td>`
          : '';

        const aprovPct = (s.avalM + s.avalF) > 0 ? Math.round((s.aprovM + s.aprovF) / (s.avalM + s.avalF) * 100) : 0;
        const reprovPct = 100 - aprovPct;

        dataRowsNivel += `<tr style="background:${idx % 2 === 0 ? '#f9f9f9' : '#fff'};">
          ${nivelCell}
          <td style="${tdL}">${CLASSE_LABELS[prefix] || prefix}</td>
          <td style="${tdC}">${s.matM || '-'}</td><td style="${tdC}">${s.matF || '-'}</td>
          <td style="${tdC}">${s.desM || '-'}</td><td style="${tdC}">${s.desF || '-'}</td>
          <td style="${tdC}">${s.avalM || '-'}</td><td style="${tdC}">${s.avalF || '-'}</td>
          <td style="${tdC};color:#155724;">${s.aprovM || '-'}</td><td style="${tdC};color:#155724;">${s.aprovF || '-'}</td>
          <td style="${tdC};font-weight:bold;color:#b91c1c;">${aprovPct}%</td>
          <td style="${tdC};color:#b91c1c;">${s.reprovM || '-'}</td><td style="${tdC};color:#b91c1c;">${s.reprovF || '-'}</td>
          <td style="${tdC};font-weight:bold;color:#b91c1c;">${reprovPct}%</td>
          <td style="${tdC}">${s.profM || '-'}</td><td style="${tdC}">${s.profF || '-'}</td>
        </tr>`;
      });

      // Subtotal row for this nível
      const stAvalT = nivelTot.avalM + nivelTot.avalF;
      const stAprovT = nivelTot.aprovM + nivelTot.aprovF;
      const stReprovT = nivelTot.reprovM + nivelTot.reprovF;
      const stAprovPct = stAvalT > 0 ? Math.round((stAprovT / stAvalT) * 100) : 0;
      const stReprovPct = 100 - stAprovPct;

      dataRowsNivel += `<tr style="background:#e0e0e0;font-weight:bold;">
        <td colspan="2" style="${tdL}font-weight:bold;font-size:8px;">SUB-TOTAL</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.matM}</td><td style="${tdC}font-weight:bold;">${nivelTot.matF}</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.desM}</td><td style="${tdC}font-weight:bold;">${nivelTot.desF}</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.avalM}</td><td style="${tdC}font-weight:bold;">${nivelTot.avalF}</td>
        <td style="${tdC}font-weight:bold;color:#155724;">${nivelTot.aprovM}</td><td style="${tdC}font-weight:bold;color:#155724;">${nivelTot.aprovF}</td>
        <td style="${tdC}font-weight:bold;color:#b91c1c;">${stAprovPct}%</td>
        <td style="${tdC}font-weight:bold;color:#b91c1c;">${nivelTot.reprovM}</td><td style="${tdC}font-weight:bold;color:#b91c1c;">${nivelTot.reprovF}</td>
        <td style="${tdC}font-weight:bold;color:#b91c1c;">${stReprovPct}%</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.profM}</td><td style="${tdC}font-weight:bold;">${nivelTot.profF}</td>
      </tr>`;

      bodyRows += dataRowsNivel;
      grandTot.matM += nivelTot.matM; grandTot.matF += nivelTot.matF;
      grandTot.desM += nivelTot.desM; grandTot.desF += nivelTot.desF;
      grandTot.avalM += nivelTot.avalM; grandTot.avalF += nivelTot.avalF;
      grandTot.aprovM += nivelTot.aprovM; grandTot.aprovF += nivelTot.aprovF;
      grandTot.reprovM += nivelTot.reprovM; grandTot.reprovF += nivelTot.reprovF;
      grandTot.profM += nivelTot.profM; grandTot.profF += nivelTot.profF;
    });

    const gtAvalT = grandTot.avalM + grandTot.avalF;
    const gtAprovT = grandTot.aprovM + grandTot.aprovF;
    const gtReprovT = grandTot.reprovM + grandTot.reprovF;
    const gtAprovPct = gtAvalT > 0 ? Math.round((gtAprovT / gtAvalT) * 100) : 0;
    const gtReprovPct = 100 - gtAprovPct;

    // ── Cell and header style helpers ────────────────────────────────────────
    const cell = (extra = '') => `border:1px solid #000;text-align:center;padding:1px 2px;font-size:7px;overflow:hidden;${extra}`;
    const cellL = (extra = '') => `border:1px solid #000;padding:1px 3px;font-size:7px;overflow:hidden;${extra}`;
    const hG = (extra = '') => `border:1px solid #000;background:#b0b0b0;font-weight:bold;font-size:6.5px;padding:1px 2px;text-align:center;overflow:hidden;${extra}`;
    const hDk = (extra = '') => `border:1px solid #000;background:#606060;color:#fff;font-weight:bold;font-size:6.5px;padding:1px 2px;text-align:center;overflow:hidden;${extra}`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Mapa de Aproveitamento — ${triLabel} Trimestre ${anoLetivoSlash}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    body { font-family:Arial,sans-serif; font-size:7px; color:#000; padding:6px 10px; }
    .top-wrap { position:relative; margin-bottom:6px; }
    .visto-box{position:absolute;top:0;left:0;border:1px solid #1a6b3c;background:#f0f9f1;padding:3px 8px;min-width:140px;text-align:center;border-radius:3px;line-height:1.2;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    .visto-box .visto-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#1a3a1a;letter-spacing:0.5px;}
    .visto-box .visto-data{font-size:7.5px;color:#1a3a1a;}
    .visto-box .visto-name{font-size:8px;font-weight:bold;color:#1a3a1a;margin-top:1px;}
    .visto-box .visto-role{font-size:7px;color:#1a6b3c;text-transform:uppercase;font-weight:bold;}
    .header { text-align:center; padding-left:155px; padding-right:10px; }
    .header p { margin:1px 0; font-size:8px; font-weight:bold; text-transform:uppercase; }
    .header p.sm { font-size:7px; }
    .escola-line { font-size:8px; font-weight:bold; margin:3px 0 2px; }
    .titulo-line { font-size:7.5px; font-weight:bold; margin-bottom:3px; text-align:center; }
    table { border-collapse:collapse; width:100%; table-layout:fixed; margin-bottom:6px; }
    col.c-nivel  { width:26px; }
    col.c-classe { width:64px; }
    col.c-num    { width:22px; }
    col.c-pct    { width:28px; }
    .sig-wrap { display:flex; justify-content:flex-end; margin-top:14px; }
    .sig-block { text-align:center; min-width:190px; }
    .sig-label { font-size:7.5px; font-weight:bold; text-transform:uppercase; margin-bottom:3px; }
    .sig-line  { width:170px; border-top:1px solid #000; margin:0 auto 2px; }
    .sig-name  { font-size:7px; font-weight:bold; }
    .date { font-size:7.5px; margin:6px 0; }
    @media print { @page { size:A3 landscape; margin:7mm 9mm; } body { padding:0; } }
  </style>
</head>
<body>
  <div class="top-wrap">
    <div class="header">
      <img src="${typeof window !== 'undefined' ? window.location.origin : ''}/angola-brasao.png"
           style="width:48px;height:auto;display:block;margin:0 auto 2px;" alt="" onerror="this.style.display='none'" />
      <p>República de Angola</p>
      <p class="sm">Governo da Província de ${provincia}</p>
      <p class="sm">Administração Municipal de ${municipio}</p>
      <p class="sm">Repartição de Educação, Ensino Ciencia e Tecnologia e Inovação</p>
      <p class="sm">Área do Ensino Geral</p>
    </div>
    <div class="visto-box">
      <div class="visto-label">VISTO</div>
      <div class="visto-data">Data ___/___/______</div>
      <div class="visto-name">${director}</div>
      <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
    </div>
  </div>

  <p class="escola-line">ESCOLA: ${escola.toUpperCase()}</p>
  <p class="titulo-line">MAPA DE APROVEITAMENTO DO &nbsp;${triLabel.toUpperCase()} TRIMESTRE&nbsp; DO ANO LECTIVO &nbsp;${anoLetivoSlash} / ESCOLAS PRIVADA</p>

  <table>
    <colgroup>
      <col class="c-nivel"/>
      <col class="c-classe"/>
      <col class="c-num"/><col class="c-num"/><!-- Matr -->
      <col class="c-num"/><col class="c-num"/><!-- Des  -->
      <col class="c-num"/><col class="c-num"/><!-- Aval -->
      <col class="c-num"/><col class="c-num"/><col class="c-pct"/><!-- C/Aprov -->
      <col class="c-num"/><col class="c-num"/><col class="c-pct"/><!-- S/Aprov -->
      <col class="c-num"/><col class="c-num"/><!-- Prof -->
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2" style="${hDk('vertical-align:middle;white-space:pre-line;')}">NÍVEL</th>
        <th rowspan="2" style="${hDk('vertical-align:middle;')}">CLASSE</th>
        <th colspan="2" style="${hG()}">MATRICULADOS</th>
        <th colspan="2" style="${hG()}">DESISTÊNCIA</th>
        <th colspan="2" style="${hG()}">AVALIADOS</th>
        <th colspan="3" style="${hG()}">C/APROVEITAMENTO</th>
        <th colspan="3" style="${hG()}">S/APROVEITAMENTO</th>
        <th colspan="2" style="${hG()}">Nº DE PROFESSORES</th>
      </tr>
      <tr>
        <th style="${hG()}">M</th><th style="${hG()}">F</th>
        <th style="${hG()}">M</th><th style="${hG()}">F</th>
        <th style="${hG()}">M</th><th style="${hG()}">F</th>
        <th style="${hG()}">M</th><th style="${hG()}">F</th><th style="${hG()}">%</th>
        <th style="${hG()}">M</th><th style="${hG()}">F</th><th style="${hG()}">%</th>
        <th style="${hG()}">M</th><th style="${hG()}">F</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr style="background:#a0a0a0;">
        <td colspan="2" style="${cellL('font-weight:bold;font-size:7.5px;')}">TOTAL GERAL</td>
        <td style="${cell('font-weight:bold;')}">${grandTot.matM}</td><td style="${cell('font-weight:bold;')}">${grandTot.matF}</td>
        <td style="${cell('font-weight:bold;')}">${grandTot.desM || '-'}</td><td style="${cell('font-weight:bold;')}">${grandTot.desF || '-'}</td>
        <td style="${cell('font-weight:bold;')}">${grandTot.avalM}</td><td style="${cell('font-weight:bold;')}">${grandTot.avalF}</td>
        <td style="${cell('font-weight:bold;color:#155724;')}">${grandTot.aprovM}</td><td style="${cell('font-weight:bold;color:#155724;')}">${grandTot.aprovF}</td>
        <td style="${cell('font-weight:bold;color:#b91c1c;')}">${gtAprovPct}%</td>
        <td style="${cell('font-weight:bold;color:#b91c1c;')}">${grandTot.reprovM}</td><td style="${cell('font-weight:bold;color:#b91c1c;')}">${grandTot.reprovF}</td>
        <td style="${cell('font-weight:bold;color:#b91c1c;')}">${gtReprovPct}%</td>
        <td style="${cell('font-weight:bold;')}">${grandTot.profM || '-'}</td><td style="${cell('font-weight:bold;')}">${grandTot.profF || '-'}</td>
      </tr>
    </tbody>
  </table>

  <p class="date">${dataLocal}.</p>

  <div class="sig-wrap">
    <div class="sig-block">
      <div class="sig-label">O Subdirector Pedagógico</div>
      <div class="sig-line"></div>
      <div class="sig-name">${subdirector}</div>
    </div>
  </div>
</body>
</html>`;
  }

  // ─── Mapa de Aproveitamento — Tabela Oficial MED (fragmento de tabela) ───────

  function buildMapaAprovNivelTableHtml(trimestre: 1 | 2 | 3, prefixes: string[], nivelLabel: string): string {
    const CLASSE_LABELS: Record<string, string> = {
      'Inic': 'Iniciação', '1ª': '1ª Classe', '2ª': '2ª Classe', '3ª': '3ª Classe',
      '4ª': '4ª Classe', '5ª': '5ª Classe', '6ª': '6ª Classe',
      '7ª': '7ª Classe', '8ª': '8ª Classe', '9ª': '9ª Classe',
      '10ª': '10ª Classe', '11ª': '11ª Classe', '12ª': '12ª Classe',
    };

    function classeStats(prefix: string) {
      const classeT = turmas.filter(t => t.ativo && t.classe.startsWith(prefix));
      const classeIds = classeT.map(t => t.id);
      const todosAlunos = alunos.filter(a => classeIds.includes(a.turmaId || ''));
      const isF = (a: any) => a.genero === 'F';
      const isDes = (a: any) => (a.situacao || '').toLowerCase() === 'desistente';

      const matM = todosAlunos.filter(a => !isF(a)).length;
      const matF = todosAlunos.filter(isF).length;
      const desM = todosAlunos.filter(a => isDes(a) && !isF(a)).length;
      const desF = todosAlunos.filter(a => isDes(a) && isF(a)).length;

      const notasTri = notas.filter(n => classeIds.includes(n.turmaId || '') && n.trimestre === trimestre);
      const avalIds = [...new Set(notasTri.map(n => n.alunoId))];
      const avalM = avalIds.filter(id => todosAlunos.find(a => a.id === id && !isF(a))).length;
      const avalF = avalIds.filter(id => todosAlunos.find(a => a.id === id && isF(a))).length;

      const aprovIds = avalIds.filter(id => {
        const ns = notasTri.filter(n => n.alunoId === id);
        return ns.length > 0 && (ns.reduce((s, n) => s + (n.nf || 0), 0) / ns.length) >= 10;
      });
      const aprovM = aprovIds.filter(id => todosAlunos.find(a => a.id === id && !isF(a))).length;
      const aprovF = aprovIds.filter(id => todosAlunos.find(a => a.id === id && isF(a))).length;
      const aprovT = aprovM + aprovF;
      const avalT = avalM + avalF;
      const aprovPct = avalT > 0 ? Math.round((aprovT / avalT) * 100) : 0;

      const reprovIds = avalIds.filter(id => !aprovIds.includes(id));
      const reprovM = reprovIds.filter(id => todosAlunos.find(a => a.id === id && !isF(a))).length;
      const reprovF = reprovIds.filter(id => todosAlunos.find(a => a.id === id && isF(a))).length;
      const reprovPct = avalT > 0 ? Math.round(((reprovM + reprovF) / avalT) * 100) : 0;

      const profIds = [...new Set(classeT.map(t => (t as any).professorId).filter(Boolean))];
      const profsC = professores.filter(p => profIds.includes(p.id));
      const profM = profsC.filter(p => p.genero !== 'F').length;
      const profF = profsC.filter(p => p.genero === 'F').length;

      return { matM, matF, desM, desF, avalM, avalF, aprovM, aprovF, aprovPct, reprovM, reprovF, reprovPct, profM, profF, hasTurmas: classeT.length > 0 };
    }

    const B = 'border:1px solid #000;';
    const tdC = `${B}text-align:center;padding:2px 3px;font-size:8px;overflow:hidden;`;
    const tdL = `${B}padding:2px 4px;font-size:8px;overflow:hidden;`;
    const hDk = `${B}background:#404040;color:#fff;font-weight:bold;font-size:7.5px;padding:2px 3px;text-align:center;overflow:hidden;`;
    const hG  = `${B}background:#a0a0a0;font-weight:bold;font-size:7.5px;padding:2px 3px;text-align:center;overflow:hidden;`;

    const activePrefixes = prefixes.filter(p => turmas.some(t => t.ativo && t.classe.startsWith(p)));
    const nivelTot = { matM:0,matF:0, desM:0,desF:0, avalM:0,avalF:0, aprovM:0,aprovF:0, reprovM:0,reprovF:0, profM:0,profF:0 };

    let bodyRows = '';

    activePrefixes.forEach((prefix, idx) => {
      const s = classeStats(prefix);
      nivelTot.matM += s.matM; nivelTot.matF += s.matF;
      nivelTot.desM += s.desM; nivelTot.desF += s.desF;
      nivelTot.avalM += s.avalM; nivelTot.avalF += s.avalF;
      nivelTot.aprovM += s.aprovM; nivelTot.aprovF += s.aprovF;
      nivelTot.reprovM += s.reprovM; nivelTot.reprovF += s.reprovF;
      nivelTot.profM += s.profM; nivelTot.profF += s.profF;

      const nivelCell = idx === 0
        ? `<td rowspan="${activePrefixes.length + 1}" style="${tdC}font-weight:bold;background:#c8c8c8;vertical-align:middle;writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);white-space:pre-line;font-size:7.5px;">${nivelLabel}</td>`
        : '';

      const aprovPct = (s.avalM + s.avalF) > 0 ? Math.round((s.aprovM + s.aprovF) / (s.avalM + s.avalF) * 100) : 0;
      const reprovPct = 100 - aprovPct;

      bodyRows += `<tr style="background:${idx % 2 === 0 ? '#f8f8f8' : '#ffffff'};">
        ${nivelCell}
        <td style="${tdL}">${CLASSE_LABELS[prefix] || prefix}</td>
        <td style="${tdC}">${s.matM || '-'}</td><td style="${tdC}">${s.matF || '-'}</td>
        <td style="${tdC}">${s.desM || '-'}</td><td style="${tdC}">${s.desF || '-'}</td>
        <td style="${tdC}">${s.avalM || '-'}</td><td style="${tdC}">${s.avalF || '-'}</td>
        <td style="${tdC}">${s.aprovM || '-'}</td><td style="${tdC}">${s.aprovF || '-'}</td>
        <td style="${tdC};font-weight:bold;">${aprovPct}%</td>
        <td style="${tdC}">${s.reprovM || '-'}</td><td style="${tdC}">${s.reprovF || '-'}</td>
        <td style="${tdC};font-weight:bold;">${reprovPct}%</td>
        <td style="${tdC}">${s.profM || '-'}</td><td style="${tdC}">${s.profF || '-'}</td>
      </tr>`;
    });

    if (activePrefixes.length === 0) {
      bodyRows = `<tr><td colspan="16" style="${tdC}color:#999;font-style:italic;padding:8px;">Sem turmas activas neste nível</td></tr>`;
    } else {
      const stAvalT = nivelTot.avalM + nivelTot.avalF;
      const stAprovT = nivelTot.aprovM + nivelTot.aprovF;
      const stAprovPct = stAvalT > 0 ? Math.round((stAprovT / stAvalT) * 100) : 0;
      const stReprovPct = 100 - stAprovPct;

      bodyRows += `<tr style="background:#d8d8d8;">
        <td colspan="2" style="${tdL}font-weight:bold;font-size:8.5px;">SUB-TOTAL</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.matM}</td><td style="${tdC}font-weight:bold;">${nivelTot.matF}</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.desM || '-'}</td><td style="${tdC}font-weight:bold;">${nivelTot.desF || '-'}</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.avalM}</td><td style="${tdC}font-weight:bold;">${nivelTot.avalF}</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.aprovM}</td><td style="${tdC}font-weight:bold;">${nivelTot.aprovF}</td>
        <td style="${tdC}font-weight:bold;">${stAprovPct}%</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.reprovM}</td><td style="${tdC}font-weight:bold;">${nivelTot.reprovF}</td>
        <td style="${tdC}font-weight:bold;">${stReprovPct}%</td>
        <td style="${tdC}font-weight:bold;">${nivelTot.profM || '-'}</td><td style="${tdC}font-weight:bold;">${nivelTot.profF || '-'}</td>
      </tr>`;
    }

    return `<table style="border-collapse:collapse;width:100%;table-layout:fixed;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <colgroup>
    <col style="width:28px;"/>
    <col style="width:72px;"/>
    <col style="width:22px;"/><col style="width:22px;"/>
    <col style="width:22px;"/><col style="width:22px;"/>
    <col style="width:22px;"/><col style="width:22px;"/>
    <col style="width:22px;"/><col style="width:22px;"/><col style="width:28px;"/>
    <col style="width:22px;"/><col style="width:22px;"/><col style="width:28px;"/>
    <col style="width:22px;"/><col style="width:22px;"/>
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" style="${hDk}vertical-align:middle;">NÍVEL</th>
      <th rowspan="2" style="${hDk}vertical-align:middle;">CLASSE</th>
      <th colspan="2" style="${hG}">MATRICULADOS</th>
      <th colspan="2" style="${hG}">DESISTÊNCIA</th>
      <th colspan="2" style="${hG}">AVALIADOS</th>
      <th colspan="3" style="${hG}">C/APROVEITAMENTO</th>
      <th colspan="3" style="${hG}">S/APROVEITAMENTO</th>
      <th colspan="2" style="${hG}">Nº DE PROFESSORES</th>
    </tr>
    <tr>
      <th style="${hG}">M</th><th style="${hG}">F</th>
      <th style="${hG}">M</th><th style="${hG}">F</th>
      <th style="${hG}">M</th><th style="${hG}">F</th>
      <th style="${hG}">M</th><th style="${hG}">F</th><th style="${hG}">%</th>
      <th style="${hG}">M</th><th style="${hG}">F</th><th style="${hG}">%</th>
      <th style="${hG}">M</th><th style="${hG}">F</th>
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>`;
  }

  // ─── Mapa de Aproveitamento Por Curso Individual — HTML Builder (Oficial MED) ──

  function buildMapaAproveitamentoPorCursoHtml(cursoId: string, trimestre: 1 | 2 | 3, periodoOverride?: string): string {
    const cursoObj = cursos.find(c => c.id === cursoId);
    if (!cursoObj) return '<html><body><p>Curso não encontrado.</p></body></html>';

    const escola = config.nomeEscola || 'Super Escola';
    const subdirector = directorPedagogico;
    const director = directorGeral;
    const municipio = (config as any).municipio || '';
    const now = new Date();
    const sortedT = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
    const anoLetivo = sortedT[0]?.anoLetivo || String(now.getFullYear());
    const anoLetivoSlash = (anoLetivo.includes('/') || anoLetivo.includes('-'))
      ? anoLetivo.replace(/-/g, '/')
      : `${anoLetivo}/${String(Number(anoLetivo) + 1).slice(-2)}`;

    // All turmas for this curso
    const classeOrder = ['Inic', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª', '13ª'];
    const cursoTurmas = turmas
      .filter(t => (t as any).cursoId === cursoId)
      .sort((a, b) => {
        const ai = classeOrder.findIndex(p => a.classe.startsWith(p.replace('ª', '')));
        const bi = classeOrder.findIndex(p => b.classe.startsWith(p.replace('ª', '')));
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return a.nome.localeCompare(b.nome);
      });

    if (cursoTurmas.length === 0) {
      return `<html><body style="font-family:Arial;padding:20px;"><p><strong>Curso: ${cursoObj.nome}</strong></p><p>Nenhuma turma activa encontrada para este curso.</p></body></html>`;
    }

    // Período label
    let periodoLabel: string;
    if (periodoOverride && periodoOverride !== 'AUTO') {
      periodoLabel = periodoOverride;
    } else {
      const turnos = [...new Set(cursoTurmas.map(t => (t.turno || '').trim()).filter(Boolean))];
      periodoLabel = turnos.length === 0 ? 'Diurno' : turnos.length === 1 ? turnos[0] : turnos.join(' / ');
    }

    const triLabel = trimestre === 1 ? 'I' : trimestre === 2 ? 'II' : 'III';
    const dataLocal = `${municipio || escola}, ${String(now.getDate()).padStart(2, '0')} / ${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`;

    // Compute per-turma stats
    const totals = {
      matMF: 0, matF: 0,
      avalMF: 0, avalF: 0,
      aprovMF: 0, aprovF: 0,
      reprovMF: 0, reprovF: 0,
      desMF: 0, desF: 0,
      anulMF: 0, anulF: 0,
      transMF: 0, transF: 0,
      exclMF: 0, exclF: 0,
    };

    function turmaStats(turmaId: string) {
      const todos = alunos.filter(a => a.turmaId === turmaId);
      const isF = (a: any) => a.genero === 'F';

      const matMF = todos.length;
      const matF = todos.filter(isF).length;

      const notasTri = notas.filter(n => n.turmaId === turmaId && n.trimestre === trimestre);
      const avalIds = [...new Set(notasTri.map(n => n.alunoId))];
      const avalMF = avalIds.length;
      const avalF = avalIds.filter(id => todos.find(a => a.id === id && isF(a))).length;

      const aprovIds = avalIds.filter(id => {
        const ns = notasTri.filter(n => n.alunoId === id);
        return ns.length > 0 && (ns.reduce((s, n) => s + (n.nf || 0), 0) / ns.length) >= 10;
      });
      const aprovMF = aprovIds.length;
      const aprovF = aprovIds.filter(id => todos.find(a => a.id === id && isF(a))).length;

      const reprovIds = avalIds.filter(id => !aprovIds.includes(id));
      const reprovMF = reprovIds.length;
      const reprovF = reprovIds.filter(id => todos.find(a => a.id === id && isF(a))).length;

      const bySit = (sit: string) => todos.filter(a => (a.situacao || '').toLowerCase() === sit);
      const des = bySit('desistente');
      const anul = bySit('anulacao_matricula');
      const trans = bySit('transferido');
      const excl = bySit('excluido');

      const pctAptos = matMF > 0 ? Math.round((aprovMF / matMF) * 100) : 0;
      const pctNAptos = 100 - pctAptos;

      return {
        matMF, matF, avalMF, avalF, aprovMF, aprovF, reprovMF, reprovF,
        desMF: des.length, desF: des.filter(isF).length,
        anulMF: anul.length, anulF: anul.filter(isF).length,
        transMF: trans.length, transF: trans.filter(isF).length,
        exclMF: excl.length, exclF: excl.filter(isF).length,
        pctAptos, pctNAptos,
      };
    }

    const tdS = 'border:1px solid #000;text-align:center;padding:2px 3px;font-size:8px;';
    const tdL = 'border:1px solid #000;padding:2px 4px;font-size:8px;';

    let dataRows = '';
    cursoTurmas.forEach((turma, idx) => {
      const s = turmaStats(turma.id);
      totals.matMF += s.matMF; totals.matF += s.matF;
      totals.avalMF += s.avalMF; totals.avalF += s.avalF;
      totals.aprovMF += s.aprovMF; totals.aprovF += s.aprovF;
      totals.reprovMF += s.reprovMF; totals.reprovF += s.reprovF;
      totals.desMF += s.desMF; totals.desF += s.desF;
      totals.anulMF += s.anulMF; totals.anulF += s.anulF;
      totals.transMF += s.transMF; totals.transF += s.transF;
      totals.exclMF += s.exclMF; totals.exclF += s.exclF;

      const rowBg = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
      const cursoCell = idx === 0
        ? `<td rowspan="${cursoTurmas.length}" style="${tdL}font-weight:bold;background:#1a6b3c;color:#fff;text-align:center;vertical-align:middle;writing-mode:vertical-rl;text-orientation:mixed;transform:rotate(180deg);min-width:28px;font-size:7.5px;">${cursoObj.nome}</td>`
        : '';

      dataRows += `<tr style="background:${rowBg};">
        ${cursoCell}
        <td style="${tdL}">${turma.classe}</td>
        <td style="${tdL}">${turma.turno || periodoLabel}</td>
        <td style="${tdS}">${s.matMF}</td><td style="${tdS}">${s.matF}</td>
        <td style="${tdS}">${s.avalMF}</td><td style="${tdS}">${s.avalF}</td>
        <td style="${tdS};color:#155724;">${s.aprovMF}</td><td style="${tdS};color:#155724;">${s.aprovF}</td>
        <td style="${tdS};color:#b91c1c;">${s.reprovMF}</td><td style="${tdS};color:#b91c1c;">${s.reprovF}</td>
        <td style="${tdS}">${s.desMF}</td><td style="${tdS}">${s.desF}</td>
        <td style="${tdS}">${s.anulMF}</td><td style="${tdS}">${s.anulF}</td>
        <td style="${tdS}">${s.transMF}</td><td style="${tdS}">${s.transF}</td>
        <td style="${tdS}">${s.exclMF}</td><td style="${tdS}">${s.exclF}</td>
        <td style="${tdS};font-weight:bold;background:#d4edda;color:#155724;">${s.pctAptos}%</td>
        <td style="${tdS};font-weight:bold;background:#fde2e2;color:#b91c1c;">${s.pctNAptos}%</td>
      </tr>`;
    });

    const totPctAptos = totals.matMF > 0 ? Math.round((totals.aprovMF / totals.matMF) * 100) : 0;
    const totPctNAptos = 100 - totPctAptos;
    const thH = 'border:1px solid #000;background:#1a3a1a;color:#fff;font-size:7.5px;padding:2px 3px;text-align:center;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
    const thTop = 'border:1px solid #000;background:#1a6b3c;color:#fff;font-size:8px;padding:3px 4px;text-align:center;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;';

    return `<table style="border-collapse:collapse;width:100%;table-layout:auto;font-family:Calibri,Arial,sans-serif;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;">
    <thead>
      <tr>
        <th rowspan="2" style="${thTop}vertical-align:middle;min-width:30px;">CURSO</th>
        <th rowspan="2" style="${thTop}vertical-align:middle;min-width:45px;">CLASSE</th>
        <th rowspan="2" style="${thTop}vertical-align:middle;min-width:38px;">Período</th>
        <th colspan="2" style="${thTop}">Alunos Matriculados</th>
        <th colspan="2" style="${thTop}">Alunos Avaliados</th>
        <th colspan="2" style="${thTop}">Alunos Aprovados</th>
        <th colspan="2" style="${thTop}">Alunos Reprovados</th>
        <th colspan="2" style="${thTop}">Alunos Desistentes</th>
        <th colspan="2" style="${thTop}">Alunos Anularam Matrícula</th>
        <th colspan="2" style="${thTop}">Alunos Transferidos</th>
        <th colspan="2" style="${thTop}">Alunos Excluídos</th>
        <th rowspan="2" style="${thTop}vertical-align:middle;">%<br/>Aptos</th>
        <th rowspan="2" style="${thTop}vertical-align:middle;">%<br/>N/Aptos</th>
      </tr>
      <tr>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
        <th style="${thH}">MF</th><th style="${thH}">F</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows}
      <tr style="background:#c6efce;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <td colspan="3" style="border:1px solid #000;padding:2px 5px;font-size:8.5px;font-weight:bold;color:#1a3a1a;">Total</td>
        <td style="${tdS}font-weight:bold;">${totals.matMF}</td><td style="${tdS}font-weight:bold;">${totals.matF}</td>
        <td style="${tdS}font-weight:bold;">${totals.avalMF}</td><td style="${tdS}font-weight:bold;">${totals.avalF}</td>
        <td style="${tdS}font-weight:bold;color:#155724;">${totals.aprovMF}</td><td style="${tdS}font-weight:bold;color:#155724;">${totals.aprovF}</td>
        <td style="${tdS}font-weight:bold;color:#b91c1c;">${totals.reprovMF}</td><td style="${tdS}font-weight:bold;color:#b91c1c;">${totals.reprovF}</td>
        <td style="${tdS}font-weight:bold;">${totals.desMF}</td><td style="${tdS}font-weight:bold;">${totals.desF}</td>
        <td style="${tdS}font-weight:bold;">${totals.anulMF}</td><td style="${tdS}font-weight:bold;">${totals.anulF}</td>
        <td style="${tdS}font-weight:bold;">${totals.transMF}</td><td style="${tdS}font-weight:bold;">${totals.transF}</td>
        <td style="${tdS}font-weight:bold;">${totals.exclMF}</td><td style="${tdS}font-weight:bold;">${totals.exclF}</td>
        <td style="${tdS}font-weight:bold;background:#a8d5a2;color:#155724;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${totPctAptos}%</td>
        <td style="${tdS}font-weight:bold;background:#fbb6b6;color:#b91c1c;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${totPctNAptos}%</td>
      </tr>
    </tbody>
  </table>`;
  }

  // ─── Certificado de Habilitações — I Ciclo (7ª, 8ª, 9ª) HTML Builder ────────

  function buildCertificadoHabilitacoesICicloHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const escola = config.nomeEscola || 'Complexo Escolar';
    const director = directorGeral;
    const now = new Date();
    const nome = `${aluno.nome} ${aluno.apelido}`;
    const diaNasc  = aluno.dataNascimento ? new Date(aluno.dataNascimento).getDate()           : '__';
    const mesNasc  = aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()]   : '__________';
    const anoNasc  = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear()        : '____';
    const municipio  = aluno.municipio || '______________';
    const provincia  = aluno.provincia || '______________';
    const encarregado = aluno.nomeEncarregado || '________________________';

    // ── Group notas by class (7ª, 8ª, 9ª) ─────────────────────────────────
    const CLASSES_ALVO = ['7ª', '8ª', '9ª'];
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);

    const gradesByClasse: Record<string, Map<string, number>> = {};
    for (const c of CLASSES_ALVO) gradesByClasse[c] = new Map();

    for (const nota of alunoNotas) {
      const t = turmas.find(tr => tr.id === nota.turmaId);
      if (!t) continue;
      const classeKey = CLASSES_ALVO.find(c => {
        const num = c.replace('ª', '');
        return t.classe?.startsWith(num) || t.classe === c;
      });
      if (!classeKey) continue;
      const dk = nota.disciplina.toLowerCase().trim();
      const prev = gradesByClasse[classeKey].get(dk);
      if (prev === undefined || nota.nf > prev) gradesByClasse[classeKey].set(dk, nota.nf);
    }

    // Collect unique disciplines (preserve display name from first occurrence)
    const discDisplayMap = new Map<string, string>();
    for (const nota of alunoNotas) {
      const key = nota.disciplina.toLowerCase().trim();
      if (!discDisplayMap.has(key)) discDisplayMap.set(key, nota.disciplina.trim());
    }
    const allDiscs = Array.from(discDisplayMap.entries());

    // Determine ano lectivo from 9ª class turma
    const turmas9 = turmas.filter(t => {
      const c = t.classe || '';
      return c.startsWith('9') || c === '9ª';
    });
    const alunoTurmaIds = new Set(alunoNotas.map(n => n.turmaId));
    const relevantTurma9 = turmas9.find(t => alunoTurmaIds.has(t.id));
    const anoLetivo = relevantTurma9?.anoLetivo || String(now.getFullYear());

    // ── Build table rows ──────────────────────────────────────────────────
    function getGrade(classeKey: string, discKey: string): number | null {
      return gradesByClasse[classeKey]?.get(discKey) ?? null;
    }

    let totalMedia = 0;
    let countMedia = 0;

    const rows = allDiscs.map(([key, display]) => {
      const grades = CLASSES_ALVO.map(c => getGrade(c, key));
      const validGrades = grades.filter(g => g !== null) as number[];
      const mediaFinal = validGrades.length > 0
        ? Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
        : null;
      if (mediaFinal !== null) { totalMedia += mediaFinal; countMedia++; }
      const cols = grades.map(g =>
        g !== null
          ? `<td style="text-align:center;font-weight:bold;">${Math.round(g)}</td>`
          : `<td style="text-align:center;color:#aaa;font-size:9px;">—</td>`
      ).join('');
      const mediaStr  = mediaFinal !== null ? String(mediaFinal)    : '—';
      const extensoStr = mediaFinal !== null ? numExtenso(mediaFinal) + ' Valores' : '—';
      return `<tr>
        <td style="padding:3px 8px;">${display}</td>
        ${cols}
        <td style="text-align:center;font-weight:bold;">${mediaStr}</td>
        <td style="padding:3px 8px;">${extensoStr}</td>
      </tr>`;
    }).join('');

    const mediaGeral        = countMedia > 0 ? Math.round(totalMedia / countMedia) : null;
    const mediaGeralStr     = mediaGeral !== null ? String(mediaGeral)        : '___';
    const mediaGeralExtenso = mediaGeral !== null ? numExtenso(mediaGeral)    : '______';
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado de Habilitações — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 12px; color: #000; padding: 24px 40px; line-height: 1.7; }

    .header { text-align: center; margin-bottom: 14px; }
    .header p { margin: 1px 0; }
    .rep     { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .min     { font-size: 12px; font-weight: bold; text-transform: uppercase; }
    .escola  { font-size: 12px; font-style: italic; font-weight: bold; }
    .ensino  { font-size: 12px; font-weight: bold; text-transform: uppercase; }

    .titulo {
      text-align: center;
      font-size: 22px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin: 14px 0 16px;
    }

    .body-text { text-align: justify; font-size: 12px; line-height: 1.85; margin-bottom: 16px; }
    .body-text p { margin-bottom: 10px; }
    .student-name { color: #c00; font-weight: bold; }
    .bold { font-weight: bold; }
    .bold-italic { font-weight: bold; font-style: italic; }
    .underline { text-decoration: underline; }

    table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 11px; }
    table th {
      border: 1px solid #000;
      padding: 5px 8px;
      background: #fff;
      font-weight: bold;
      text-align: center;
    }
    table th:first-child { text-align: left; }
    table td { border: 1px solid #666; padding: 3px 6px; }
    .total-row td { background: #f2f2f2; font-weight: bold; border-top: 2px solid #000; }

    .legal { text-align: justify; font-size: 11.5px; line-height: 1.75; margin-top: 14px; }
    .date-line { text-align: center; margin: 20px 0 10px; font-size: 12px; }

    .sig-row { display: flex; justify-content: space-between; margin-top: 14px; }
    .sig-block { text-align: center; min-width: 200px; }
    .sig-label { font-size: 12px; font-weight: bold; margin-bottom: 34px; }
    .sig-line  { width: 180px; border-top: 1px solid #000; margin: 0 auto 4px; }
    .sig-name  { font-size: 11.5px; font-weight: bold; }

    .mod-ref { font-size: 10px; margin-top: 24px; font-weight: bold; }

    @media print { @page { size: A4; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" alt="Insígnia da República de Angola" style="height:72px;width:auto;object-fit:contain;margin-bottom:6px;" onerror="this.style.display='none'" />
    <p class="rep">República de Angola</p>
    <p class="min">Ministério da Educação</p>
    <p class="escola">${escola}</p>
    <p class="ensino">Ensino Geral</p>
  </div>

  <!-- TITLE -->
  <div class="titulo">Certificado de Habilitações</div>

  <!-- BODY TEXT -->
  <div class="body-text">
    <p>
      <span class="bold">${director}</span>, Director (a) do
      <span class="bold-italic">${escola}</span>
      em <span class="bold">${municipio}</span>
      criado sob o <span class="bold">Decreto Executivo</span>
      <span class="bold">____/____</span> de ___ de ______________________.
      Certifica que: <span class="student-name">${nome}</span>,
      filho (a) de <span class="bold">${encarregado}</span>,
      e de <span class="bold">________________________________</span>,
      nascido (a) aos <span class="bold">${diaNasc}</span> de
      <span class="bold">${mesNasc}</span> de
      <span class="bold">${anoNasc}</span>,
      natural de <span class="bold">______________</span>,
      Município de <span class="bold">${municipio}</span>,
      Província de <span class="bold">${provincia}</span>,
      portador (a) do BI nº <span class="bold">________________________</span>,
      emitido aos <span class="bold">__</span> de <span class="bold">______________</span>
      de <span class="bold">______</span>,
      passado pelo Arquivo de Identificação Nacional de <span class="bold">${provincia}</span>.
    </p>
    <p>
      Concluiu no Ano Lectivo de <span class="bold">${anoLetivo}</span>
      o <span class="bold">I CICLO DO ENSINO SECUNDÁRIO GERAL</span>,
      conforme o disposto na alínea b) do artigo 109º da LBEE 17/16 de 7 de Outubro,
      com a Média Final de (<span class="bold underline">${mediaGeralStr}</span>)
      <span class="bold underline">${mediaGeralExtenso} Valores</span>
      obtida nas seguintes classificações por ciclos de aprendizagem:
    </p>
  </div>

  <!-- GRADES TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:36%;text-align:left;">Disciplina</th>
        <th style="width:10%;">7ª Classe</th>
        <th style="width:10%;">8ª Classe</th>
        <th style="width:10%;">9ª Classe</th>
        <th style="width:14%;">Media Final</th>
        <th style="width:20%;">Média por extenso</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right;padding:4px 8px;">Média Geral Final:</td>
        <td style="text-align:center;">${mediaGeralStr}</td>
        <td style="padding:4px 8px;">${mediaGeralExtenso} Valores</td>
      </tr>
    </tbody>
  </table>

  <!-- LEGAL TEXT -->
  <div class="legal">
    Por efeitos legais, lhe é passado o presente <strong>CERTIFICADO</strong>,
    que consta no livro de termos nº <strong>____</strong>,
    folha <strong>____</strong>,
    assinado por mim e autenticado com carimbo a óleo em uso neste Estabelecimento de Ensino.
  </div>

  <!-- DATE & SIGNATURES -->
  <div class="date-line">${municipio} aos ${dataActual}</div>

  ${buildSigRow(directorGeral, directorPedagogico, directorProvincialEducacao)}

  <div class="mod-ref">Mod. 01/MED</div>

</body>
</html>`;
  }

  // ─── Certificado Habilitações I Ciclo — Colégio nº 13 do Dundo ──────────────

  function buildCertificadoHabilitacoesICiclo13DundoHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';

    const escola = config.nomeEscola || 'Colégio nº 13 do Dundo';
    const director = directorGeral;
    const now = new Date();
    const nome = `${aluno.nome} ${aluno.apelido}`;
    const diaNasc  = aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getDate()).padStart(2, '0') : '__';
    const mesNasc  = aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '__________';
    const anoNasc  = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const municipio  = aluno.municipio || '______________';
    const provincia  = aluno.provincia || '______________';
    const encarregado = aluno.nomeEncarregado || '________________________';

    const currentTurma = turmas.find(t => t.id === aluno.turmaId);

    const CLASSES_ALVO = ['7ª', '8ª', '9ª'];
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);

    const gradesByClasse: Record<string, Map<string, number>> = {};
    for (const c of CLASSES_ALVO) gradesByClasse[c] = new Map();

    for (const nota of alunoNotas) {
      const t = turmas.find(tr => tr.id === nota.turmaId);
      if (!t) continue;
      const classeKey = CLASSES_ALVO.find(c => {
        const num = c.replace('ª', '');
        return t.classe?.startsWith(num) || t.classe === c;
      });
      if (!classeKey) continue;
      const dk = nota.disciplina.toLowerCase().trim();
      const prev = gradesByClasse[classeKey].get(dk);
      if (prev === undefined || nota.nf > prev) gradesByClasse[classeKey].set(dk, nota.nf);
    }

    const discDisplayMap = new Map<string, string>();
    for (const nota of alunoNotas) {
      const key = nota.disciplina.toLowerCase().trim();
      if (!discDisplayMap.has(key)) discDisplayMap.set(key, nota.disciplina.trim());
    }
    const allDiscs = Array.from(discDisplayMap.entries());

    const turmas9 = turmas.filter(t => {
      const c = t.classe || '';
      return c.startsWith('9') || c === '9ª';
    });
    const alunoTurmaIds = new Set(alunoNotas.map(n => n.turmaId));
    const relevantTurma9 = turmas9.find(t => alunoTurmaIds.has(t.id));
    const anoLetivo = relevantTurma9?.anoLetivo || currentTurma?.anoLetivo || String(now.getFullYear());
    const turmaNome = currentTurma?.nome || '____';

    function getGrade(classeKey: string, discKey: string): number | null {
      return gradesByClasse[classeKey]?.get(discKey) ?? null;
    }

    let totalMedia = 0;
    let countMedia = 0;

    const rows = allDiscs.map(([key, display]) => {
      const grades = CLASSES_ALVO.map(c => getGrade(c, key));
      const validGrades = grades.filter(g => g !== null) as number[];
      const mediaFinal = validGrades.length > 0
        ? Math.round(validGrades.reduce((a, b) => a + b, 0) / validGrades.length)
        : null;
      if (mediaFinal !== null) { totalMedia += mediaFinal; countMedia++; }
      const cols = grades.map(g =>
        g !== null
          ? `<td style="text-align:center;font-weight:bold;">${Math.round(g)}</td>`
          : `<td style="text-align:center;color:#aaa;font-size:9px;">—</td>`
      ).join('');
      const mediaStr   = mediaFinal !== null ? String(mediaFinal) : '—';
      const extensoStr = mediaFinal !== null ? numExtenso(mediaFinal) + ' Valores' : '—';
      return `<tr>
        <td style="padding:3px 8px;">${display}</td>
        ${cols}
        <td style="text-align:center;font-weight:bold;">${mediaStr}</td>
        <td style="padding:3px 8px;">${extensoStr}</td>
      </tr>`;
    }).join('');

    const mediaGeral        = countMedia > 0 ? Math.round(totalMedia / countMedia) : null;
    const mediaGeralStr     = mediaGeral !== null ? String(mediaGeral) : '___';
    const mediaGeralExtenso = mediaGeral !== null ? numExtenso(mediaGeral) : '______';
    const dataActual = `${String(now.getDate()).padStart(2, '0')} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado de Habilitações — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 12px; color: #000; padding: 24px 44px; line-height: 1.75; }

    .header { text-align: center; margin-bottom: 10px; }
    .header p { margin: 1px 0; }
    .rep    { font-size: 12.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .min    { font-size: 12px; font-weight: bold; text-transform: uppercase; }
    .ensino { font-size: 12px; font-weight: bold; text-transform: uppercase; }

    .titulo {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin: 12px 0;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 8px 0;
    }

    .body-text { text-align: justify; font-size: 12px; line-height: 1.85; margin-bottom: 14px; }
    .body-text p { margin-bottom: 10px; }
    .student-name { color: #c00; font-weight: bold; }
    .bold { font-weight: bold; }
    .bold-italic { font-weight: bold; font-style: italic; }
    .underline { text-decoration: underline; }

    table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 11px; }
    table th {
      border: 1px solid #000;
      padding: 5px 8px;
      background: #fff;
      font-weight: bold;
      text-align: center;
    }
    table th:first-child { text-align: left; }
    table td { border: 1px solid #666; padding: 3px 6px; }
    .total-row td { background: #f2f2f2; font-weight: bold; border-top: 2px solid #000; }

    .legal { text-align: justify; font-size: 11.5px; line-height: 1.75; margin-top: 14px; }
    .date-line { text-align: right; margin: 20px 0 10px; font-size: 12px; }

    .sig-area { display: flex; justify-content: space-between; margin-top: 28px; align-items: flex-start; }
    .sig-left { font-size: 11.5px; }
    .sig-right { text-align: center; min-width: 220px; }
    .sig-label { font-size: 12px; font-weight: bold; margin-bottom: 34px; }
    .sig-line  { width: 190px; border-top: 1px solid #000; margin: 0 auto 4px; }
    .sig-name  { font-size: 11.5px; font-weight: bold; }

    @media print { @page { size: A4; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>

  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" alt="Insígnia da República de Angola" style="height:70px;width:auto;object-fit:contain;margin-bottom:6px;" onerror="this.style.display='none'" />
    <p class="rep">República de Angola</p>
    <p class="min">Ministério da Educação</p>
    <p class="ensino">Ensino Geral</p>
  </div>

  <div class="titulo">Certificado de Habilitações</div>

  <div class="body-text">
    <p>
      <span class="bold-italic">${director}</span>, Director do
      <span class="bold-italic">${escola}</span>,
      criado sob <span class="bold">Decreto Executivo nº 114/014 de 4 de Julho</span>,
      Declara que: <span class="student-name">${nome}</span>,
      Filho (a) de <span class="bold">${encarregado}</span>,
      e de <span class="bold">________________________________</span>,
      nascido (a) aos <span class="bold">${diaNasc}</span> de
      <span class="bold">${mesNasc}</span> de
      <span class="bold">${anoNasc}</span>,
      natural de <span class="bold">______________</span>,
      município de <span class="bold">${municipio}</span>,
      Província de <span class="bold">${provincia}</span>,
      portador (a) do B. I. Nº <span class="bold">________________________</span>,
      emitido pelo sector de identificação de
      <span class="bold">${municipio}</span>,
      aos <span class="bold">__</span> de <span class="bold">______________</span>
      de <span class="bold">______</span>.
    </p>
    <p>
      Concluiu no ano lectivo <span class="bold">${anoLetivo}</span>,
      o <span class="bold">Iº CICLO DO ENSINO SECUNDÁRIO GERAL</span>,
      na Turma: <span class="bold">${turmaNome}</span>
      sob o n.º <span class="bold">____</span>,
      conforme o disposto na alínea <span class="bold">c)</span> do artigo 109º
      da Lei de Base da Educação nº 17/16 de 7 de Outubro,
      com a Média Final de
      (<span class="bold underline">${mediaGeralStr}</span>)
      <span class="bold underline">${mediaGeralExtenso} Valores</span>
      obtido nas seguintes classificações por Ciclo de aprendizagem.
    </p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:34%;text-align:left;">Disciplinas</th>
        <th style="width:10%;">7ª Classe</th>
        <th style="width:10%;">8ª Classe</th>
        <th style="width:10%;">9ª Classe</th>
        <th style="width:14%;">Média Final</th>
        <th style="width:22%;">Média Por Extenso</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right;padding:4px 8px;">Média Geral Final:</td>
        <td style="text-align:center;">${mediaGeralStr}</td>
        <td style="padding:4px 8px;">${mediaGeralExtenso} Valores</td>
      </tr>
    </tbody>
  </table>

  <div class="legal">
    Para efeitos legais lhe é passado o presente <strong>CERTIFICADO</strong>,
    que consta no livro de registo n.º <strong>____/____</strong>,
    folha <strong>____</strong>,
    assinado por mim e autenticado com carimbo a óleo em uso neste Estabelecimento do Ensino.
  </div>

  <div class="date-line">${escola} aos ${dataActual}</div>

  <div class="sig-area">
    <div class="sig-left">
      <p><strong>CONFERIDO POR:</strong></p>
    </div>
    <div class="sig-right">
      <div class="sig-label">O DIRECTOR</div>
      <div class="sig-line"></div>
      <div class="sig-name">${director}</div>
    </div>
  </div>

</body>
</html>`;
  }

  // ─── Certificado II Ciclo HTML Builder (10ª, 11ª, 12ª) ───────────────────

  function buildCertificadoIiCicloHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const escola = config.nomeEscola || 'Liceu Público';
    const escolaNome = (config as any).nomeEscolaDenominacao || escola;
    const director = directorGeral;
    const now = new Date();
    const municipioEscola = (config as any).municipioEscola || '';
    const dataActual = `${municipioEscola || escola}, ${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
    const nome = `${aluno.nome} ${aluno.apelido}`;
    const nomePai = (aluno as any).nomePai || '____________________';
    const nomeMae = (aluno as any).nomeMae || '____________________';
    const diaNasc = aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getDate()).padStart(2,'0') : '__';
    const mesNascNum = aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getMonth()+1).padStart(2,'0') : '__';
    const anoNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const municipio = aluno.municipio || '______________';
    const provincia = aluno.provincia || '______________';
    const numeroBi = (aluno as any).numeroBi || '____________________';
    const biLocalEmissao = (aluno as any).biLocalEmissao || provincia;
    const biDataEmissao = (aluno as any).biDataEmissao || '__ / __ / ______';
    const processoNum = aluno.numeroMatricula || '____________________';
    const livroRegisto = (config as any).livroRegistoCertificados || '________';
    const folhaRegisto = (config as any).folhaRegistoCertificados || '________';
    const decretoEscola = (config as any).decretoEscola || '175/21 de 19 de Julho';
    const numeroEscola = (config as any).numeroEscola || '___';

    // ── Gather grades by class year ──────────────────────────────────────────
    const CLASSES_ALVO = ['10ª', '11ª', '12ª'];
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);

    const gradesByClasse: Record<string, Map<string, number>> = {};
    for (const classe of CLASSES_ALVO) gradesByClasse[classe] = new Map();

    // Fallback por anoLetivo quando turma não está carregada
    const _anoLetivosIiCiclo = [...new Set(alunoNotas.map(n => n.anoLetivo))].sort();
    const _anoLetivoToClasseKey: Record<string, string> = {};
    {
      const _classesSeq = ['10ª', '11ª', '12ª'];
      const _off = Math.max(0, _anoLetivosIiCiclo.length - 3);
      _anoLetivosIiCiclo.slice(_off).forEach((ano, i) => { _anoLetivoToClasseKey[ano] = _classesSeq[i]; });
    }

    for (const nota of alunoNotas) {
      const t = turmas.find(tr => tr.id === nota.turmaId);
      let classeKey: string | undefined;
      if (t) classeKey = CLASSES_ALVO.find(c => t.classe?.startsWith(c.replace('ª','')) || t.classe === c);
      if (!classeKey) classeKey = _anoLetivoToClasseKey[nota.anoLetivo];
      if (!classeKey) continue;
      const nfVal = Number(nota.nf) || 0;
      const macVal = Number((nota as any).mac) || 0;
      const pp1Val = Number((nota as any).pp1) || 0;
      const efectiveGrade = nfVal > 0 ? nfVal : (macVal > 0 ? macVal : (pp1Val > 0 ? pp1Val : 0));
      if (efectiveGrade <= 0) continue;
      const discKey = nota.disciplina.toLowerCase().trim();
      const existing = gradesByClasse[classeKey].get(discKey);
      if (existing === undefined || efectiveGrade > existing) gradesByClasse[classeKey].set(discKey, efectiveGrade);
    }

    const discDisplayMap = new Map<string, string>();
    for (const nota of alunoNotas) {
      if (!nota.disciplina) continue;
      const key = nota.disciplina.toLowerCase().trim();
      if (!discDisplayMap.has(key)) discDisplayMap.set(key, nota.disciplina.trim());
    }
    const allDiscs = Array.from(discDisplayMap.entries());

    // ── Determine ano lectivo from 12ª turma (latest) ──────────────────────
    const alunoTurmaIds = new Set(alunoNotas.map(n => n.turmaId));
    const relevantTurma12 = turmas.filter(t => { const c = t.classe || ''; return c.startsWith('12') || c === '12ª'; }).find(t => alunoTurmaIds.has(t.id));
    const anoLetivo = relevantTurma12?.anoLetivo || String(now.getFullYear());

    // ── Agrupar disciplinas por categoria (Formação Geral / Específica / Opcional) ─
    const FORMACAO_GERAL_KEYS = ['língua portuguesa','lingua portuguesa','francês','frances','matemática','matematica','informática','informatica','educação física','educacao fisica','física','fisica','filosofia','empreendedorismo','história','historia','geografia','biologia','química','quimica','física e química','fisica e quimica'];
    const FORMACAO_ESPECIFICA_KEYS = ['língua estrangeira','lingua estrangeira','inglês','ingles','espanhol','historia','história','geografia','literatura','psicologia','economia','direito','contabilidade','gestão','gestao','sociologia','educação visual','educacao visual','cultura','religião','religiao'];
    // Disciplinas que estão apenas na Geral não vão para a Específica
    type DiscEntry = [string, string];
    const geralDiscs: DiscEntry[] = [];
    const especificaDiscs: DiscEntry[] = [];
    const opcionalDiscs: DiscEntry[] = [];

    for (const [key, display] of allDiscs) {
      const isGeral = FORMACAO_GERAL_KEYS.some(k => key.includes(k) || k.includes(key));
      if (isGeral) { geralDiscs.push([key, display]); }
      else { especificaDiscs.push([key, display]); }
    }
    // Última disciplina da específica vai para opcional se houver só uma
    if (especificaDiscs.length === 1) { opcionalDiscs.push(especificaDiscs.pop()!); }
    else if (especificaDiscs.length > 0) {
      opcionalDiscs.push(especificaDiscs.pop()!);
    }

    function getGrade(classeKey: string, discKey: string): number | null {
      return gradesByClasse[classeKey]?.get(discKey) ?? null;
    }

    let totalMedia = 0;
    let countMedia = 0;

    const tdStyle = 'border:1px solid #999;padding:2px 5px;text-align:center;';
    const tdFirstStyle = 'border:1px solid #999;padding:2px 6px;';
    const emDash = `<span style="color:#aaa;font-size:9px;">-</span>`;

    function buildRows(discs: DiscEntry[]): string {
      return discs.map(([key, display]) => {
        const grades = CLASSES_ALVO.map(c => getGrade(c, key));
        const validGrades = grades.filter(g => g !== null && g > 0) as number[];
        const mediaFinal = validGrades.length > 0 ? Math.round(validGrades.reduce((a,b)=>a+b,0)/validGrades.length) : null;
        if (mediaFinal !== null) { totalMedia += mediaFinal; countMedia++; }
        const cols = grades.map(g => `<td style="${tdStyle}">${(g !== null && g > 0) ? Math.round(g) : emDash}</td>`).join('');
        const mediaStr = mediaFinal !== null ? String(mediaFinal) : emDash;
        const extensoStr = mediaFinal !== null ? numExtenso(mediaFinal) : emDash;
        return `<tr><td style="${tdFirstStyle}">${display}</td>${cols}<td style="${tdStyle}font-weight:bold;">${mediaStr}</td><td style="${tdStyle}font-style:italic;">${extensoStr}</td></tr>`;
      }).join('');
    }

    const groupHeaderStyle = 'background:#f0f0f0;font-weight:bold;font-size:9.5px;padding:3px 6px;border:1px solid #999;';
    const tableRows = `
      <tr><td colspan="6" style="${groupHeaderStyle}">Formação geral</td></tr>
      ${buildRows(geralDiscs)}
      ${especificaDiscs.length > 0 ? `<tr><td colspan="6" style="${groupHeaderStyle}">Formação específica</td></tr>${buildRows(especificaDiscs)}` : ''}
      ${opcionalDiscs.length > 0 ? `<tr><td colspan="6" style="${groupHeaderStyle}">Disciplina Opcional</td></tr>${buildRows(opcionalDiscs)}` : ''}
    `;

    const mediaGeral = countMedia > 0 ? Math.round(totalMedia / countMedia) : null;
    const mediaGeralStr = mediaGeral !== null ? String(mediaGeral) : '___';
    const mediaGeralExtenso = mediaGeral !== null ? numExtenso(mediaGeral) : '______';

    // ── QR Code SVG (inline, sem internet) ───────────────────────────────────
    // Gera um QR code simples com os dados do processo usando módulos SVG
    const qrData = processoNum;
    // QR simplificado: matriz de pontos representando o número de processo como pattern visual
    // Usamos Code39 barcode que já temos implementado + wrapper visual tipo QR para compatibilidade
    const mat = aluno.numeroMatricula || aluno.id?.slice(0,10) || '';
    const barcodeSvg = mat ? generateCode39Svg(mat, 80, 18) : '';

    // ── Assinatura: 2 blocos (Conferiu | O Director) ──────────────────────
    const sigHtml = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px;">
      <div style="text-align:left;min-width:160px;">
        <div style="font-size:10px;margin-bottom:24px;">Conferido por:</div>
        <div style="width:180px;border-top:1px solid #000;margin-bottom:3px;"></div>
        <div style="font-size:10px;font-weight:bold;">&nbsp;</div>
      </div>
      <div style="text-align:right;min-width:160px;">
        ${barcodeSvg ? `<div style="text-align:center;margin-bottom:4px;"><div style="font-size:7.5px;color:#555;margin-bottom:1px;">Proc. Nº ${mat}</div>${barcodeSvg}</div>` : ''}
      </div>
      <div style="text-align:center;min-width:160px;">
        <div style="font-size:10px;margin-bottom:24px;">O Director</div>
        <div style="width:180px;border-top:1px solid #000;margin:0 auto 3px;"></div>
        <div style="font-size:10px;font-weight:bold;">${director}</div>
      </div>
    </div>`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado II Ciclo — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: auto; overflow: visible; }
    body { font-family: Arial, sans-serif; font-size: 10.5px; color: #000; padding: 12px 28px 8px; line-height: 1.45; }
    .header { text-align: center; margin-bottom: 6px; }
    .header img { width: 52px; height: auto; display: block; margin: 0 auto 3px; }
    .header p { margin: 0; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; }
    .titulo { text-align: center; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 6px; margin: 8px 0 7px; }
    .body { text-align: justify; margin-bottom: 6px; font-size: 10.5px; line-height: 1.5; }
    .nome-aluno { color: #c00; font-weight: bold; text-decoration: underline; }
    .bold-underline { font-weight: bold; text-decoration: underline; }
    table { border-collapse: collapse; width: 100%; margin-top: 5px; font-size: 10px; }
    table th { border: 1px solid #000; padding: 3px 5px; text-align: center; background: #f2f2f2; font-weight: bold; font-size: 9.5px; }
    table th:first-child { text-align: left; }
    .legal { font-size: 10px; margin-top: 6px; text-align: justify; line-height: 1.45; }
    .date-footer { font-weight: bold; margin: 8px 0 4px; font-size: 10.5px; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { padding: 10mm 14mm; font-size: 10px; }
      .titulo { font-size: 17px; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" alt="Brasão de Angola" onerror="this.style.display='none'" />
    <p>República de Angola</p>
    <p>Ministério da Educação</p>
  </div>

  <div class="titulo">C E R T I F I C A D O</div>

  <div class="body">
    <strong>${director}</strong>, Director d${escola.match(/^[AEIOU]/i) ? 'a' : 'o'} ${escola},
    denominado <strong>${escolaNome}</strong>, criado sob o Decreto Executivo n.º <strong>${decretoEscola}</strong>,
    ao abrigo do disposto na alínea e) do artigo 109.º da Lei n.º 32/20 de 12 de Agosto,
    certifica que <span class="nome-aluno">${nome}</span>,
    filho de <strong>${nomePai}</strong> e de <strong>${nomeMae}</strong>,
    nascida aos ${diaNasc}/${mesNascNum}/${anoNasc},
    natural do Município de <strong>${municipio}</strong>, Província de <strong>${provincia}</strong>,
    portador do B.I n.º <strong>${numeroBi}</strong>,
    passado pelo Arquivo de Identificação de ${biLocalEmissao} aos ${biDataEmissao},
    concluiu no ano lectivo <strong>${anoLetivo}</strong> o <strong>II Ciclo do Ensino Secundário Geral</strong>,
    na área de <strong>____________________________</strong>,
    conforme consta do processo individual n.º <span class="bold-underline">${processoNum}</span>,
    com a média final de <span class="bold-underline">${mediaGeralStr}</span> valores,
    obtida nas seguintes classificações por disciplina:
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40%;text-align:left;">Disciplinas</th>
        <th style="width:10%;">10.ª<br/>Classe</th>
        <th style="width:10%;">11.ª<br/>Classe</th>
        <th style="width:10%;">12.ª<br/>Classe</th>
        <th style="width:15%;">Média<br/>Final</th>
        <th style="width:15%;">Média<br/>por extenso</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="legal">
    Para efeitos legais, é passado o presente <strong>CERTIFICADO</strong>,
    que consta no livro de registo n.º <strong>${livroRegisto}</strong>
    folha <strong>${folhaRegisto}</strong>,
    assinado por mim e autenticado com carimbo a óleo / selo branco em uso neste estabelecimento de ensino.
  </div>

  <div class="date-footer">${dataActual}.</div>

  ${sigHtml}
</body>
</html>`;
  }

  // ─── Certificado ITAQ HTML Builder ────────────────────────────────────────

  function buildCertificadoItaqHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const turma = turmas.find(t => t.id === aluno.turmaId);
    const escola = config.nomeEscola || 'Instituto Técnico';
    const director = directorGeral;
    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
    const anoLetivo = turma?.anoLetivo || String(now.getFullYear());

    const nome = `${aluno.nome} ${aluno.apelido}`;
    const diaNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getDate() : '__';
    const anoNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const mesNascNum = aluno.dataNascimento ? String(new Date(aluno.dataNascimento).getMonth() + 1).padStart(2, '0') : '__';
    const municipio = aluno.municipio || '______________';
    const provincia = aluno.provincia || '______________';
    const encarregado = aluno.nomeEncarregado || '________________________';

    // Resolve grades directly from notas by discipline name fuzzy match
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);
    function getNota(names: string[]): number | null {
      for (const nota of alunoNotas) {
        const d = nota.disciplina.toLowerCase().trim();
        for (const name of names) {
          if (d.includes(name) || name.includes(d)) return nota.nf;
        }
      }
      return null;
    }

    type ItaqRow = { nome: string; lookup: string[]; isHeader?: boolean };
    const sociocultural: ItaqRow[] = [
      { nome: 'Língua Portuguesa',              lookup: ['língua portuguesa', 'lingua portuguesa', 'português'] },
      { nome: 'Língua Estrangeira',             lookup: ['língua estrangeira', 'lingua estrangeira', 'inglês', 'ingles'] },
      { nome: 'Formação de Actitudes Integradoras', lookup: ['formação de actitudes', 'formacao de actitudes', 'actitudes integradoras'] },
      { nome: 'Educação Física',                lookup: ['educação física', 'educacao fisica', 'ed. física'] },
    ];
    const cientifica: ItaqRow[] = [
      { nome: 'Matemática',  lookup: ['matemática', 'matematica'] },
      { nome: 'Física',      lookup: ['física', 'fisica'] },
      { nome: 'Química',     lookup: ['química', 'quimica'] },
      { nome: 'Biologia',    lookup: ['biologia'] },
    ];
    const tecnica: ItaqRow[] = [
      { nome: 'Informática',                              lookup: ['informática', 'informatica'] },
      { nome: 'Empreendedorismo',                        lookup: ['empreendedorismo'] },
      { nome: 'Agricultura Geral',                       lookup: ['agricultura geral'] },
      { nome: 'Mecanização Agrícola',                    lookup: ['mecanização agrícola', 'mecanizacao agricola'] },
      { nome: 'Topografia, Hidráulica e Construções Rurais', lookup: ['topografia', 'hidráulica', 'construções rurais'] },
      { nome: 'Economia e Gestão',                       lookup: ['economia e gestão', 'economia e gestao'] },
      { nome: 'Transformação e Conservação de Produtos', lookup: ['transformação e conservação', 'transformacao e conservacao'] },
      { nome: 'Horto-Fruticultura',                      lookup: ['horto-fruticultura', 'hortofruticultura', 'horto fruticultura'] },
      { nome: 'Fitossanidade',                           lookup: ['fitossanidade'] },
      { nome: 'Culturas Arvenses e Industriais',         lookup: ['culturas arvenses'] },
      { nome: 'Extensão e Desenvolvimento Rural',        lookup: ['extensão e desenvolvimento', 'extensao e desenvolvimento'] },
      { nome: 'Trabalho de Campo',                       lookup: ['trabalho de campo'] },
      { nome: 'Projecto Tecnológico',                    lookup: ['projecto tecnológico', 'projeto tecnologico', 'projecto tecnologico'] },
    ];

    const allDiscs = [...sociocultural, ...cientifica, ...tecnica];
    const resolvedAll = allDiscs.map(d => ({ ...d, nota: getNota(d.lookup) }));

    // MPC = average of all disciplines
    const withGrades = resolvedAll.filter(g => g.nota !== null);
    const mpc = withGrades.length > 0
      ? withGrades.reduce((s, g) => s + (g.nota ?? 0), 0) / withGrades.length
      : null;
    const mpcRounded = mpc !== null ? Math.round(mpc) : null;
    const mpcDisplay = mpcRounded !== null ? String(mpcRounded) : '___';
    const mpcExtenso = mpcRounded !== null ? numExtenso(mpcRounded) : '______';

    // Final = (2×MPC + PAP) / 3  → PAP left blank
    const finalExtenso = mpcRounded !== null ? numExtenso(mpcRounded) : '______';

    function buildRows(rows: ItaqRow[], component: string): string {
      const header = `<tr style="background:#2c4a1e;">
        <td colspan="3" style="font-weight:bold;color:#fff;padding:5px 8px;">${component}</td>
      </tr>`;
      const body = rows.map(d => {
        const nota = getNota(d.lookup);
        const notaStr = nota !== null ? Math.round(nota).toString() : '___';
        const extensoStr = nota !== null ? `(${numExtenso(Math.round(nota))})` : '(___)';
        return `<tr>
          <td style="padding:4px 8px;">${d.nome}</td>
          <td style="text-align:center;color:#1a5276;font-weight:bold;">${notaStr}</td>
          <td style="text-align:center;color:#1a5276;">${extensoStr}</td>
        </tr>`;
      }).join('');
      return header + body;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado ITAQ — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 24px 40px; line-height: 1.65; }
    .header { text-align: center; margin-bottom: 14px; }
    .header p { margin: 2px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .header .sub { font-size: 12px; font-weight: bold; letter-spacing: 1px; }
    .border-box { border: 2px solid #2c4a1e; padding: 12px 16px; }
    .titulo { text-align: center; font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 14px; }
    .body { text-align: justify; margin-bottom: 12px; font-size: 11.5px; line-height: 1.75; }
    .bold { font-weight: bold; }
    .nome-aluno { color: #c00; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 11px; }
    table th { background: #2c4a1e; color: #fff; border: 1px solid #2c4a1e; padding: 6px 8px; text-align: center; }
    table th:first-child { text-align: left; }
    table td { border: 1px solid #999; padding: 4px 6px; }
    .summary-row td { background: #f0f4ec; font-weight: bold; border-top: 2px solid #2c4a1e; font-size: 11px; }
    .final-row td { background: #2c4a1e; color: #fff; font-weight: bold; border-top: 2px solid #1a3c10; font-size: 11px; }
    .legal { font-size: 11px; margin-top: 14px; text-align: justify; line-height: 1.7; }
    .date { text-align: center; margin: 18px 0 28px; font-size: 11px; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 10px; }
    .sig-block { text-align: center; min-width: 200px; }
    .sig-label { font-size: 11px; font-weight: bold; margin-bottom: 28px; }
    .sig-line { width: 180px; border-top: 1px solid #000; margin: 0 auto 4px; }
    .sig-name { font-size: 10.5px; font-style: italic; }
    @media print { @page { size: A4; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
    <p>República de Angola</p>
    <p>Ministério da Educação</p>
    <p class="sub">Ensino Secundário Técnico-Profissional</p>
  </div>

  <div class="border-box">
    <div class="titulo">Certificado</div>

    <div class="body">
      <span class="bold">${director}</span>, Director do <span class="bold">${escola}</span>,
      criado sob o Decreto Executivo nº __________ de __ de __________,
      certifica que <span class="nome-aluno">${nome}</span>,
      filho de <span class="bold">${encarregado}</span>
      e de <span class="bold">________________________</span>,
      natural de <span class="bold">______________</span>,
      Município de <span class="bold">${municipio}</span>,
      Província de <span class="bold">${provincia}</span>,
      nascido aos <span class="bold">${diaNasc}/${mesNascNum}/${anoNasc}</span>,
      portador do Bilhete de Identidade, nº <span class="bold">________________________</span>,
      passado pelo Arquivo de Identificação de <span class="bold">${provincia}</span>,
      aos __ / __ / ______,
      concluiu no ano lectivo <span class="bold">${anoLetivo}</span>,
      o Curso do IIº CICLO DO ENSINO SECUNDÁRIO TÉCNICO,
      na especialidade de <span class="bold">____________________________</span>,
      conforme o disposto na alínea f) do artigo 109º da LBSEE 17/16 de 7 de Outubro,
      com a Média Final de <span class="bold">${mpcDisplay}</span> valores
      obtida nas seguintes classificações por disciplinas:
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:58%;">Componente de Formação</th>
          <th style="width:21%;">Média Final</th>
          <th style="width:21%;">Média por Extenso</th>
        </tr>
      </thead>
      <tbody>
        ${buildRows(sociocultural, 'Componente Sociocultural')}
        ${buildRows(cientifica, 'Componente Científica')}
        ${buildRows(tecnica, 'Componente Técnica, Tecnológica e Prática')}
        <tr class="summary-row">
          <td style="padding:5px 8px;">Média por Plano Curricular</td>
          <td style="text-align:center;">${mpcDisplay}</td>
          <td style="text-align:center;font-style:italic;">(${mpcExtenso})</td>
        </tr>
        <tr class="summary-row">
          <td style="padding:5px 8px;">Prova de Aptidão Profissional</td>
          <td style="text-align:center;">___</td>
          <td style="text-align:center;font-style:italic;">(___)</td>
        </tr>
        <tr class="final-row">
          <td style="padding:5px 8px;">Classificação Final por Curso =(2XPC+PAP)/3</td>
          <td style="text-align:center;">___</td>
          <td style="text-align:center;font-style:italic;">(${finalExtenso})</td>
        </tr>
      </tbody>
    </table>

    <div class="legal">
      Para efeitos legais lhe é passado o presente <strong>CERTIFICADO</strong>,
      que consta do livro de registo nº 1, &nbsp; folha____,
      assinado por mim e autenticado com selo branco em uso neste estabelecimento de ensino.
    </div>
  </div>

  <div class="date">${escola}, aos ${dataActual}</div>

  ${buildSigRow(directorGeral, directorPedagogico, directorProvincialEducacao)}
</body>
</html>`;
  }

  // ─── Certificado de Habilitações Literárias — IIº Ciclo Pedagógico ──────────

  function buildCertificadoHabilitacoesLiterariasHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const escola = config.nomeEscola || 'Super Escola';
    const director = directorGeral;
    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;

    const nome = `${aluno.nome} ${aluno.apelido}`;
    const diaNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getDate() : '__';
    const mesNasc = aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '__________';
    const anoNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const municipio = aluno.municipio || '______________';
    const provincia = aluno.provincia || '______________';
    const encarregado = aluno.nomeEncarregado || '________________________';

    const alunoNotas = notas.filter(n => n.alunoId === alunoId);

    function getGradesByClasse(classePrefix: string): Map<string, number> {
      const map = new Map<string, number>();
      const classTurmaIds = new Set(
        turmas.filter(t => (t.classe || '').trim().startsWith(classePrefix)).map(t => t.id)
      );
      for (const n of alunoNotas) {
        if (classTurmaIds.has(n.turmaId)) {
          map.set(n.disciplina.toLowerCase().trim(), n.nf);
        }
      }
      return map;
    }

    function getTurmaInfo(classePrefix: string): { nome: string; anoLetivo: string } {
      const classTurmas = turmas.filter(t => (t.classe || '').trim().startsWith(classePrefix));
      for (const t of classTurmas) {
        if (alunoNotas.some(n => n.turmaId === t.id)) {
          return { nome: t.nome, anoLetivo: t.anoLetivo };
        }
      }
      return { nome: '—', anoLetivo: '—' };
    }

    const g10 = getGradesByClasse('10');
    const g11 = getGradesByClasse('11');
    const g12 = getGradesByClasse('12');
    const g13 = getGradesByClasse('13');

    const t10 = getTurmaInfo('10');
    const t11 = getTurmaInfo('11');
    const t12 = getTurmaInfo('12');
    const t13 = getTurmaInfo('13');

    function resolveGrade(grades: Map<string, number>, ...searches: string[]): string {
      for (const s of searches) {
        const sl = s.toLowerCase();
        for (const [k, v] of grades) {
          if (k.includes(sl) || sl.includes(k)) return String(Math.round(v));
        }
      }
      return '—';
    }

    function classAvgDisplay(grades: Map<string, number>): { val: number | null; str: string; extenso: string } {
      if (grades.size === 0) return { val: null, str: '—', extenso: '—' };
      const vals = [...grades.values()];
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      return { val: avg, str: String(avg), extenso: numExtenso(avg) };
    }

    const ca10 = classAvgDisplay(g10);
    const ca11 = classAvgDisplay(g11);
    const ca12 = classAvgDisplay(g12);
    const ca13 = classAvgDisplay(g13);

    const anoLetivo = t13.anoLetivo !== '—' ? t13.anoLetivo
      : t12.anoLetivo !== '—' ? t12.anoLetivo
      : t11.anoLetivo !== '—' ? t11.anoLetivo
      : String(now.getFullYear());

    const mediaFinal = ca13.val ?? ca12.val ?? ca11.val ?? null;
    const mediaFinalDisplay = mediaFinal !== null ? String(mediaFinal) : '—';
    const mediaFinalExtenso = mediaFinal !== null ? numExtenso(mediaFinal) : '________';

    function dRow(label: string, grade: string): string {
      return `<tr><td class="disc-name">${label}</td><td class="disc-grade">${grade}</td></tr>`;
    }
    function gHeader(label: string): string {
      return `<tr><td colspan="2" class="group-hdr">${label}</td></tr>`;
    }

    const table10 = `<table class="class-table">
      <tr><td colspan="2" class="class-head">10ª CLASSE</td></tr>
      <tr><td colspan="2" class="turma-info">TURMA: ${t10.nome}</td></tr>
      <tr><td colspan="2" class="turma-info">ANO LECTIVO: ${t10.anoLetivo}</td></tr>
      ${gHeader('Formação Geral')}
      ${dRow('Francês', resolveGrade(g10, 'francês', 'frances'))}
      ${dRow('Inglês', resolveGrade(g10, 'inglês', 'ingles'))}
      ${dRow('História', resolveGrade(g10, 'história', 'historia'))}
      ${dRow('Matemática', resolveGrade(g10, 'matemática', 'matematica'))}
      ${dRow('Informática', resolveGrade(g10, 'informática', 'informatica'))}
      ${dRow('Empreend.', resolveGrade(g10, 'empreend'))}
      ${dRow('Ed.Física', resolveGrade(g10, 'ed.física', 'educação física', 'educacao fisica'))}
      ${gHeader('Formação Educacional')}
      ${dRow('Psicologia', resolveGrade(g10, 'psicologia'))}
      ${gHeader('Formação Específica')}
      ${dRow('Língua Portuguesa', resolveGrade(g10, 'língua portuguesa', 'lingua portuguesa'))}
      ${dRow('Deontologia', resolveGrade(g10, 'deontologia'))}
      ${dRow('Literactura', resolveGrade(g10, 'literactura', 'literatura'))}
    </table>`;

    const table11 = `<table class="class-table">
      <tr><td colspan="2" class="class-head">11ª CLASSE</td></tr>
      <tr><td colspan="2" class="turma-info">TURMA: ${t11.nome}</td></tr>
      <tr><td colspan="2" class="turma-info">ANO LECTIVO: ${t11.anoLetivo}</td></tr>
      ${gHeader('Formação Geral')}
      ${dRow('Francês', resolveGrade(g11, 'francês', 'frances'))}
      ${dRow('Inglês', resolveGrade(g11, 'inglês', 'ingles'))}
      ${dRow('Ed.Física', resolveGrade(g11, 'ed.física', 'educação física', 'educacao fisica'))}
      ${gHeader('Formação Educacional')}
      ${dRow('A.S.E.A.G.E', resolveGrade(g11, 'a.s.e.a.g.e', 'aseage'))}
      ${dRow('T.E.D.C', resolveGrade(g11, 't.e.d.c', 'tedc'))}
      ${gHeader('Formação Específica')}
      ${dRow('Língua Portuguesa', resolveGrade(g11, 'língua portuguesa', 'lingua portuguesa'))}
      ${dRow('Met. L. Portuguesa', resolveGrade(g11, 'met. l. portuguesa', 'metodologia lingua'))}
      ${dRow('PSEP L. Portuguesa', resolveGrade(g11, 'psep l. portuguesa', 'psep língua'))}
      ${dRow('Met. E.M.C', resolveGrade(g11, 'met. e.m.c', 'metodologia emc', 'met.e.m.c'))}
      ${dRow('PSEP E.M.C', resolveGrade(g11, 'psep e.m.c', 'psep emc'))}
      ${dRow('Deontologia', resolveGrade(g11, 'deontologia'))}
      ${dRow('Literactura', resolveGrade(g11, 'literactura', 'literatura'))}
    </table>`;

    const table12 = `<table class="class-table">
      <tr><td colspan="2" class="class-head">12ª CLASSE</td></tr>
      <tr><td colspan="2" class="turma-info">TURMA: ${t12.nome}</td></tr>
      <tr><td colspan="2" class="turma-info">ANO LECTIVO: ${t12.anoLetivo}</td></tr>
      ${gHeader('Formação Geral')}
      ${dRow('Filosofia', resolveGrade(g12, 'filosofia'))}
      ${dRow('Empreend.', resolveGrade(g12, 'empreend'))}
      ${dRow('Ed.Física', resolveGrade(g12, 'ed.física', 'educação física', 'educacao fisica'))}
      ${gHeader('Formação Educacional')}
      ${dRow('H.\\ Saúde escolar', resolveGrade(g12, 'saúde escolar', 'saude escolar', 'higiene'))}
      ${dRow('Ética', resolveGrade(g12, 'ética', 'etica'))}
      ${gHeader('Formação Específica')}
      ${dRow('Língua Portuguesa', resolveGrade(g12, 'língua portuguesa', 'lingua portuguesa'))}
      ${dRow('Deontologia', resolveGrade(g12, 'deontologia'))}
      ${dRow('Met. L. Portuguesa', resolveGrade(g12, 'met. l. portuguesa', 'metodologia lingua'))}
      ${dRow('PSEP L. Portuguesa', resolveGrade(g12, 'psep l. portuguesa', 'psep língua'))}
      ${dRow('Met. E.M.C', resolveGrade(g12, 'met. e.m.c', 'metodologia emc'))}
      ${dRow('PSEP DE E.M.C', resolveGrade(g12, 'psep de e.m.c', 'psep de emc'))}
    </table>`;

    const table13 = `<table class="class-table">
      <tr><td colspan="2" class="class-head">13ª CLASSE</td></tr>
      <tr><td colspan="2" class="turma-info">TURMA: ${t13.nome}</td></tr>
      <tr><td colspan="2" class="turma-info">ANO LECTIVO: ${t13.anoLetivo}</td></tr>
      ${gHeader('Formação Específica')}
      ${dRow('MÉDIA ANUAL', resolveGrade(g13, 'média anual', 'media anual'))}
      ${dRow('P.A. PROFISSIONAL', resolveGrade(g13, 'p.a. profissional', 'aptidão profissional', 'pa profissional'))}
      ${dRow('N. EST. CURRICULAR', resolveGrade(g13, 'n. est. curricular', 'estágio curricular'))}
      <tr><td colspan="2" class="group-hdr" style="background:#1a2540;color:#fff;font-size:9px;text-align:center;padding:4px;">MÉDIAS GERAIS POR CLASSES</td></tr>
      <tr><td colspan="2" class="group-hdr" style="font-size:8.5px;background:#e8e8e8;">MÉDIAS GERAIS POR CLASSES</td></tr>
      <tr style="background:#f9f9f9;"><td class="disc-name" style="font-size:9px;">10ª CLASSE</td><td class="disc-grade">${ca10.str}</td></tr>
      <tr><td class="disc-name" style="font-size:9px;">11ª CLASSE</td><td class="disc-grade">${ca11.str}</td></tr>
      <tr style="background:#f9f9f9;"><td class="disc-name" style="font-size:9px;">12ª CLASSE</td><td class="disc-grade">${ca12.str}</td></tr>
      <tr><td class="disc-name" style="font-size:9px;">13ª CLASSE</td><td class="disc-grade">${ca13.str}</td></tr>
      <tr><td colspan="2" style="font-size:8.5px;padding:4px;text-align:justify;line-height:1.5;border-top:1px solid #aaa;">
        Para efeitos legais lhe é passado o presente <strong>CERTIFICADO</strong>, que consta no livro de registo nº <strong>___</strong>, folha <strong>___</strong>, assinado por mim e autenticado com o selo branco em uso neste estabelecimento de ensino.
      </td></tr>
    </table>`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado de Habilitações Literárias — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 11px; color: #000; background: #fff; }
    .page1 {
      padding: 20px 28px;
      border: 8px double #8B6914;
      min-height: 260mm;
      page-break-after: always;
      position: relative;
    }
    .coat-arms { text-align: center; margin-bottom: 6px; }
    .header-block { text-align: center; margin-bottom: 14px; line-height: 1.6; }
    .rep-angola { font-size: 11px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; }
    .gov-prov { font-size: 10.5px; font-weight: bold; text-transform: uppercase; }
    .escola-nome { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
    .ensino-nivel { font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .decorative-title {
      text-align: center;
      font-family: 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
      font-style: italic;
      font-size: 26px;
      color: #8B0000;
      margin: 14px 0 18px;
      letter-spacing: 1px;
    }
    .decorative-title .initial { font-size: 36px; font-weight: bold; }
    .body-text { text-align: justify; line-height: 1.85; font-size: 11.5px; }
    .body-text p { margin-bottom: 12px; }
    .student-name { color: #8B0000; font-weight: bold; }
    .bold { font-weight: bold; }
    .page2 { padding: 14px 18px; }
    .grades-section { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid #555; }
    .class-table { width: 100%; border-collapse: collapse; border-right: 1px solid #555; }
    .class-table:last-child { border-right: none; }
    .class-head { background: #1a2540; color: #fff; font-size: 11px; font-weight: bold; text-align: center; padding: 5px 4px; border-bottom: 1px solid #555; }
    .turma-info { font-size: 9px; padding: 2px 4px; background: #f0f0f0; border-bottom: 1px solid #ddd; font-weight: bold; }
    .group-hdr { font-weight: bold; font-size: 9.5px; background: #ddd; padding: 3px 4px; border-top: 1px solid #aaa; border-bottom: 1px solid #ccc; }
    .disc-name { font-size: 9.5px; padding: 2px 4px; border-bottom: 1px solid #eee; }
    .disc-grade { font-size: 9.5px; font-weight: bold; text-align: center; padding: 2px 4px; border-bottom: 1px solid #eee; width: 22px; border-left: 1px solid #ccc; color: #1a2540; }
    .legal-text { margin-top: 12px; font-size: 10px; text-align: justify; line-height: 1.7; }
    .date-footer { margin-top: 10px; font-size: 10px; font-weight: bold; text-transform: uppercase; line-height: 1.7; }
    .sig-section { display: flex; justify-content: space-between; margin-top: 12px; }
    .sig-block { text-align: center; min-width: 150px; }
    .sig-label { font-size: 10px; font-weight: bold; }
    .sig-line { width: 140px; border-top: 1px solid #000; margin: 28px auto 4px; }
    .sig-name { font-size: 10px; font-style: italic; }
    @media print {
      @page { size: A4; margin: 0; }
      body { margin: 0; }
      .page1 { page-break-after: always; }
    }
  </style>
</head>
<body>

  <!-- PAGE 1: Header and introduction -->
  <div class="page1">
    <div class="coat-arms">
      <img src="/icons/icon-192.png" alt="Brasão" style="height:56px;width:56px;object-fit:contain;" onerror="this.style.display='none'" />
    </div>
    <div class="header-block">
      <p class="rep-angola">República de Angola</p>
      <p class="gov-prov">Governo Provincial de ${provincia}</p>
      <p class="escola-nome">${escola}</p>
      <p class="ensino-nivel">Ensino Secundário Pedagógico</p>
    </div>

    <div class="decorative-title">
      <span class="initial">C</span>ertificado de <span class="initial">H</span>abilitações <span class="initial">L</span>iterárias
    </div>

    <div class="body-text">
      <p>
        <span class="bold">${director}</span>, Director(a) da ${escola}, criada sob o
        Decreto Executivo Conjunto nº <span class="bold">____/____</span> de ___ de ____________,
        certifica que, <span class="student-name">${nome}</span>,
        filho(a) de <span class="bold">${encarregado}</span>
        e de <span class="bold">________________________________</span>,
        nascido(a) aos <span class="bold">${diaNasc}</span> de
        <span class="bold">${mesNasc}</span> de
        <span class="bold">${anoNasc}</span>,
        natural do <span class="bold">${municipio}</span>,
        Município do <span class="bold">${municipio}</span>,
        Província do <span class="bold">${provincia}</span>,
        titular do B.I nº <span class="bold">________________________________</span>,
        emitido aos <span class="bold">___</span> de <span class="bold">_______________</span>
        de <span class="bold">______</span>,
        pelo Departamento de Identificação Civil e Criminal do <span class="bold">${provincia}</span>.
      </p>
      <p>
        Concluiu no ano lectivo <span class="bold">${anoLetivo}</span>,
        o Curso do <span class="bold">II CICLO DO ENSINO SECUNDÁRIO PEDAGÓGICO</span>,
        na especialidade de <span class="bold" style="text-decoration:underline;font-style:italic;">________________________________</span>,
        o disposto na alínea f) do artigo 109º da LBSEE 17/16 de 7 de Outubro,
        com a Média Curricular de <span class="bold">${mediaFinalDisplay}</span>
        (<span class="bold">${mediaFinalExtenso} valores</span>)
        obtida nas seguintes classificações por disciplinas:
      </p>
    </div>
  </div>

  <!-- PAGE 2: Grades table -->
  <div class="page2">
    <div class="grades-section">
      ${table10}
      ${table11}
      ${table12}
      ${table13}
    </div>

    <p class="date-footer">
      ${escola.toUpperCase()} em ${municipio.toUpperCase()}, ${dataActual.toUpperCase()}.
    </p>

    ${buildSigRow(directorGeral, directorPedagogico, directorProvincialEducacao)}

    <p style="text-align:center;font-size:10px;color:#c00;margin-top:14px;font-style:italic;">
      Só é válido o Original
    </p>
  </div>

</body>
</html>`;
  }

  // ─── Certificado Ensino Secundário Técnico-Profissional ──────────────────────

  function buildCertificadoTecnicoProfissionalHtml(alunoId: string): string {
    const aluno = alunos.find(a => a.id === alunoId);
    if (!aluno) return '';
    const turma = turmas.find(t => t.id === aluno.turmaId);
    const escola = config.nomeEscola || 'Instituto Técnico';
    const director = directorGeral;
    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
    const anoLetivo = turma?.anoLetivo || String(now.getFullYear());

    const nome = `${aluno.nome} ${aluno.apelido}`;
    const diaNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getDate() : '__';
    const mesNasc = aluno.dataNascimento ? MESES[new Date(aluno.dataNascimento).getMonth()] : '__________';
    const anoNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento).getFullYear() : '____';
    const municipio = aluno.municipio || '______________';
    const provincia = aluno.provincia || '______________';
    const encarregado = aluno.nomeEncarregado || '________________________';

    // All notas for this student
    const alunoNotas = notas.filter(n => n.alunoId === alunoId);

    // Track which disciplinas are already matched (to avoid double-counting)
    const matchedKeys = new Set<string>();

    type DiscDef = { nome: string; lookup: string[] };
    type ResolvedRow = { nome: string; nota: number | null };

    function resolveRows(defs: DiscDef[]): ResolvedRow[] {
      return defs.map(d => {
        for (const n of alunoNotas) {
          const dk = n.disciplina.toLowerCase().trim();
          for (const s of d.lookup) {
            const sl = s.toLowerCase();
            if (dk.includes(sl) || sl.includes(dk)) {
              matchedKeys.add(dk);
              return { nome: d.nome, nota: n.nf };
            }
          }
        }
        return { nome: d.nome, nota: null };
      });
    }

    // ── Componente Sócio-cultural ──────────────────────────────────────────────
    const defsS: DiscDef[] = [
      { nome: 'L. Portuguesa',                    lookup: ['língua portuguesa', 'l. portuguesa', 'lingua portuguesa', 'português', 'portugues'] },
      { nome: 'L. Estrangeira',                   lookup: ['língua estrangeira', 'l. estrangeira', 'lingua estrangeira', 'inglês', 'ingles', 'francês', 'frances'] },
      { nome: 'Formação de Atitudes Integradoras', lookup: ['atitudes integradoras', 'formação de atitudes', 'formacao de atitudes'] },
      { nome: 'Educação Física',                  lookup: ['educação física', 'educacao fisica', 'ed. física', 'ed.física'] },
    ];

    // ── Componente Científica ─────────────────────────────────────────────────
    const defsC: DiscDef[] = [
      { nome: 'Matemática',     lookup: ['matemática', 'matematica'] },
      { nome: 'Biologia',       lookup: ['biologia'] },
      { nome: 'Física',         lookup: ['física', 'fisica'] },
      { nome: 'Química',        lookup: ['química', 'quimica'] },
      { nome: 'Informática',    lookup: ['informática', 'informatica'] },
      { nome: 'Psicologia Geral', lookup: ['psicologia geral', 'psicologia'] },
    ];

    const rowsS = resolveRows(defsS);
    const rowsC = resolveRows(defsC);

    // ── Componente Técnica — all remaining notas (dynamic, specialty-specific) ─
    // PAP lookup first (before technical block)
    const papSearches = ['pap', 'prova de aptidão', 'aptidão profissional', 'prova aptidão', 'prova de aptidao'];
    let papNota: number | null = null;
    for (const n of alunoNotas) {
      const dk = n.disciplina.toLowerCase().trim();
      for (const s of papSearches) {
        if (dk.includes(s) || s.includes(dk)) {
          papNota = n.nf;
          matchedKeys.add(dk);
          break;
        }
      }
      if (papNota !== null) break;
    }

    // Everything else goes into the technical component
    const rowsT: ResolvedRow[] = alunoNotas
      .filter(n => !matchedKeys.has(n.disciplina.toLowerCase().trim()))
      .map(n => ({ nome: n.disciplina, nota: n.nf }));

    // ── Statistics ────────────────────────────────────────────────────────────
    const allRows = [...rowsS, ...rowsC, ...rowsT].filter(r => r.nota !== null);
    const mpc = allRows.length > 0
      ? allRows.reduce((s, r) => s + (r.nota ?? 0), 0) / allRows.length
      : null;
    const mpcRounded  = mpc !== null ? Math.round(mpc) : null;
    const mpcDisplay  = mpcRounded  !== null ? String(mpcRounded)  : '—';
    const mpcExtenso  = mpcRounded  !== null ? numExtenso(mpcRounded)  : '________';

    const papRounded  = papNota !== null ? Math.round(papNota) : null;
    const papDisplay  = papRounded  !== null ? String(papRounded)  : '___';
    const papExtenso  = papRounded  !== null ? numExtenso(papRounded)  : '________';

    const finalCalc   = mpcRounded !== null && papRounded !== null
      ? Math.round((2 * mpcRounded + papRounded) / 3)
      : mpcRounded;
    const finalDisplay = finalCalc !== null ? String(finalCalc) : '—';
    const finalExtenso = finalCalc !== null ? numExtenso(finalCalc) : '________';

    // ── HTML row helpers ──────────────────────────────────────────────────────
    function sectionHeader(label: string): string {
      return `<tr style="background:#f0f0f0;">
        <td colspan="3" style="font-weight:bold;padding:5px 10px;border:1px solid #999;">${label}</td>
      </tr>`;
    }
    function discRow(r: ResolvedRow): string {
      const val = r.nota !== null ? Math.round(r.nota) : null;
      const valStr    = val !== null ? String(val)              : '—';
      const extensoStr = val !== null ? `(${numExtenso(val)}) Valores` : '—';
      return `<tr>
        <td style="padding:4px 10px;border:1px solid #ccc;">${r.nome}</td>
        <td style="text-align:center;font-weight:bold;border:1px solid #ccc;">${valStr}</td>
        <td style="text-align:center;border:1px solid #ccc;">${extensoStr}</td>
      </tr>`;
    }
    function summaryRow(label: string, val: string, extenso: string, isFinal = false): string {
      const bg = isFinal ? '#1a2540' : '#f5f5f5';
      const fg = isFinal ? '#fff'    : '#000';
      const fw = 'bold';
      return `<tr style="background:${bg};color:${fg};font-weight:${fw};">
        <td style="padding:5px 10px;border:1px solid ${isFinal ? '#1a2540' : '#999'};">${label}</td>
        <td style="text-align:center;border:1px solid ${isFinal ? '#1a2540' : '#999'};">${val}</td>
        <td style="text-align:center;border:1px solid ${isFinal ? '#1a2540' : '#999'};">${extenso.startsWith('(') ? extenso : `(${extenso}) Valores`}</td>
      </tr>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Certificado — ${nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 12px; color: #000; padding: 20px 36px; line-height: 1.65; }

    .top-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .visto-box { width: 180px; border: 1px solid #999; padding: 6px 10px; font-size: 10px; text-align: center; min-height: 80px; }
    .visto-title { font-weight: bold; font-size: 10px; margin-bottom: 4px; }
    .visto-sig-line { width: 120px; border-top: 1px solid #000; margin: 30px auto 4px; }
    .stamp-box { width: 180px; border: 2px solid #333; padding: 8px 10px; font-size: 10px; text-align: center; min-height: 60px; display: flex; align-items: center; justify-content: center; }
    .stamp-text { font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; text-align: center; }

    .header-block { text-align: center; margin-bottom: 12px; }
    .header-block p { margin: 2px 0; }
    .rep { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .ministerio { font-size: 11.5px; font-weight: bold; text-transform: uppercase; }
    .nivel-ensino { font-size: 11px; font-weight: bold; text-transform: uppercase; margin-top: 4px; }
    .titulo-cert { font-size: 26px; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; margin: 8px 0 14px; }

    .body-text { text-align: justify; font-size: 12px; line-height: 1.85; margin-bottom: 14px; }
    .director-name { color: #c00; font-weight: bold; }
    .student-name  { color: #c00; font-weight: bold; font-style: italic; }
    .especialidade { font-weight: bold; text-transform: uppercase; }
    .bold { font-weight: bold; }

    table { border-collapse: collapse; width: 100%; margin-bottom: 6px; font-size: 11.5px; }
    table th { background: #ddd; border: 1px solid #999; padding: 5px 10px; font-weight: bold; text-align: center; }
    table th:first-child { text-align: left; }

    .legal { text-align: justify; font-size: 11.5px; line-height: 1.7; margin-top: 10px; }
    .date-line { text-align: center; margin: 18px 0 8px; font-size: 12px; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 10px; }
    .sig-block { text-align: center; min-width: 190px; }
    .sig-label { font-size: 11px; font-weight: bold; margin-bottom: 32px; }
    .sig-line  { width: 170px; border-top: 1px solid #000; margin: 0 auto 4px; }
    .sig-name  { font-size: 11px; }

    @media print { @page { size: A4; margin: 0; } body { padding: 0; } }
  </style>
</head>
<body>

  <!-- TOP ROW: Visto | Coat of Arms | Stamp -->
  <div class="top-row">
    <div class="visto-box">
      <div class="visto-title">Visto</div>
      <div style="font-size:10px;">Director Provincial da Educação</div>
      <div class="visto-sig-line"></div>
      <div style="font-size:10px;">${directorProvincialEducacao}</div>
    </div>
    <div style="text-align:center;">
      <img src="/icons/icon-192.png" alt="Armas" style="height:70px;width:70px;object-fit:contain;" onerror="this.style.display='none'" />
    </div>
    <div class="stamp-box">
      <div class="stamp-text">Inspecção da Educação<br>${provincia}</div>
    </div>
  </div>

  <!-- INSTITUTION HEADER -->
  <div class="header-block">
    <p class="rep">República de Angola</p>
    <p class="ministerio">Ministério da Educação</p>
    <p class="nivel-ensino">Ensino Secundário Técnico-Professional</p>
    <p class="titulo-cert">Certificado</p>
  </div>

  <!-- BODY TEXT -->
  <div class="body-text">
    <span class="director-name">${director}</span>, Director(a) do
    <span class="bold">${escola}</span>,
    criado sob o Decreto Executivo n.º <span class="bold">_____</span>
    de ___ de ____________________,
    certifica que <span class="student-name">${nome}</span>,
    filho(a) de <span class="bold">${encarregado}</span>
    e de <span class="bold">________________________________</span>,
    natural de <span class="bold">${municipio}</span>,
    Província de <span class="bold">${provincia}</span>,
    nascido(a) aos <span class="bold">${diaNasc} de ${mesNasc} de ${anoNasc}</span>,
    portador(a) do Bilhete de Identificação n.º <span class="bold">________________________</span>,
    passado pelo arquivo de identificação de <span class="bold">${provincia}</span>
    aos ___ de _______________ de ______,
    concluiu no ano lectivo <span class="bold">${anoLetivo}</span>
    o Curso do <span class="bold">II CICLO DO ENSINO SECUNDÁRIO TÉCNICO</span>,
    na especialidade de <span class="especialidade">________________________________</span>,
    conforme o disposto na alínea f) do artigo 109.º da LBSEE 17/16, de 7 de Outubro,
    com Média de <span class="bold">${mpcDisplay}</span> valores
    obtida nas seguintes classificações por disciplinas:
  </div>

  <!-- GRADES TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:55%;text-align:left;">Componentes da Formação</th>
        <th style="width:22%;">Média Final</th>
        <th style="width:23%;">Média por Extenso</th>
      </tr>
    </thead>
    <tbody>
      ${sectionHeader('Componente Sócio-cultural')}
      ${rowsS.map(discRow).join('')}
      ${sectionHeader('Componente Científica')}
      ${rowsC.filter(r => r.nota !== null).map(discRow).join('')}
      ${rowsT.length > 0 ? sectionHeader('Componente Técnica, Tecnológica e Prática') : ''}
      ${rowsT.map(discRow).join('')}
      ${summaryRow('Média por Plano Curricular (PC)', mpcDisplay, mpcExtenso)}
      ${summaryRow('Prova de Aptidão Profissional (PAP)', papDisplay, papExtenso)}
      ${summaryRow('Classificação Final por Curso = (2×PC+PAP)/3', finalDisplay, finalExtenso, true)}
    </tbody>
  </table>

  <!-- LEGAL TEXT -->
  <div class="legal">
    Para efeitos legais lhe é passado o presente <strong>CERTIFICADO</strong>,
    que consta no livro de registo n.º <strong>____</strong>, folha <strong>____</strong>,
    assinado por mim e autenticado com carimbo a selo branco em uso neste estabelecimento de ensino.
  </div>

  <!-- DATE & SIGNATURES -->
  <div class="date-line">${municipio}, aos ${dataActual}</div>

  ${buildSigRow(directorGeral, directorPedagogico, directorProvincialEducacao)}

</body>
</html>`;
  }

  function saveDocumentoEmitido(alunoId: string, tipoNome: string) {
    if (!alunoId) return;
    const al = alunos.find(a => a.id === alunoId);
    if (!al) return;
    const turma = turmas.find(t => t.id === al.turmaId);
    fetch('/api/documentos-emitidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alunoId: al.id,
        alunoNome: `${al.nome} ${al.apelido}`,
        alunoNum: al.numeroMatricula,
        alunoTurma: turma ? `${turma.classe} ${turma.nome}` : '',
        tipo: tipoNome,
        anoAcademico: turma?.anoLetivo || '',
        emitidoPor: user?.nome || 'Sistema',
      }),
    }).catch(() => {});
  }

  const KEYWORDS_REQUER_NOTAS = ['nota', 'habilitaç', 'frequênc', 'frequenc', 'conclus', 'históri', 'histori', 'certific', 'diploma', 'primário', 'primario', 'aproveit'];

  function templateRequiresNotas(t: DocTemplate | null): boolean {
    if (!t) return false;
    if (t.tipo === 'historico_academico' || t.tipo === 'certificado_primario' || t.tipo === 'certificado') return true;
    if (t.tipo !== 'declaracao') return false;
    const nome = t.nome.toLowerCase();
    return KEYWORDS_REQUER_NOTAS.some(kw => nome.includes(kw));
  }

  // Builds the document HTML for the currently-selected template.
  // Returns { html, trackEmitido } or null when validation fails / data missing.
  async function buildEmitDocHtml(): Promise<{ html: string; trackEmitido?: { alunoId: string; nome: string } } | null> {
    if (templateRequiresNotas(emitTemplate) && emitAlunoId) {
      const alunoNotas = notas.filter(n => n.alunoId === emitAlunoId);
      if (alunoNotas.length === 0) {
        const al = alunos.find(a => a.id === emitAlunoId);
        webAlert(
          'Sem Notas Registadas',
          `${al ? `${al.nome} ${al.apelido}` : 'Este aluno'} não tem notas registadas em nenhum trimestre.\n\nEste tipo de documento só pode ser emitido após o aluno ter concluído pelo menos um trimestre com notas lançadas (positiva ou negativa).`
        );
        return null;
      }
    }

    if (emitTemplate?.tipo === 'mapa_aproveitamento' && emitTemplate?.classeAlvo === 'MAPA_OFICIAL_MED_GERAL') {
      const html = buildMapaOficialMEDHtml(emitTrimestre, emitPeriodo);
      return { html };
    }

    if (emitTemplate?.tipo === 'mapa_aproveitamento' &&
        (emitTemplate?.classeAlvo === 'MAPA_PRIMARIO_TABELA' || emitTemplate?.classeAlvo === 'MAPA_I_CICLO_TABELA')) {
      const isPrimario = emitTemplate.classeAlvo === 'MAPA_PRIMARIO_TABELA';
      const prefixes = isPrimario
        ? ['Inic', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª']
        : ['7ª', '8ª', '9ª'];
      const nivelLabel = isPrimario ? 'ENSINO\nPRIMÁRIO' : '1º\nCICLO';
      const tabelaHtml = buildMapaAprovNivelTableHtml(emitTrimestre, prefixes, nivelLabel);

      const now = new Date();
      const sortedT = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
      const anoLetivo = sortedT[0]?.anoLetivo || String(now.getFullYear());
      const anoLetivoSlash = (anoLetivo.includes('/') || anoLetivo.includes('-'))
        ? anoLetivo.replace(/-/g, '/')
        : `${anoLetivo}/${String(Number(anoLetivo) + 1).slice(-2)}`;
      const allTurnos = [...new Set(turmas.filter(t => t.ativo).map(t => (t.turno || '').trim()).filter(Boolean))];
      const periodoLabel = emitPeriodo && emitPeriodo !== 'AUTO'
        ? emitPeriodo
        : allTurnos.length === 0 ? 'Diurno' : allTurnos.length === 1 ? allTurnos[0] : allTurnos.join(' / ');
      const triLabel = emitTrimestre === 1 ? '1' : emitTrimestre === 2 ? '2' : '3';
      const municipio = (config as any).municipio || 'Luanda';
      const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      const dataActual = `${String(now.getDate()).padStart(2,'0')} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
      const escola = config.nomeEscola || 'Super Escola';

      const varMap: Record<string, string> = {
        '{{NOME_ESCOLA}}': escola,
        '{{ANO_LECTIVO}}': anoLetivoSlash,
        '{{TRIMESTRE}}': triLabel,
        '{{REGIME}}': periodoLabel,
        '{{MUNICIPIO}}': municipio,
        '{{DATA_ACTUAL}}': dataActual,
        '{{NOME_DIRECTOR}}': directorGeral,
        '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
        '{{TABELA_MAPA_APROV_PRIMARIO}}': isPrimario ? tabelaHtml : '',
        '{{TABELA_MAPA_APROV_I_CICLO}}': !isPrimario ? tabelaHtml : '',
      };

      let processedConteudo = emitTemplate.conteudo;
      Object.entries(varMap).forEach(([k, v]) => {
        processedConteudo = processedConteudo.split(k).join(v);
      });

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${emitTemplate.nome}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family:'Arial',sans-serif; font-size:11px; line-height:1.7; color:#000; padding:12mm 14mm; position:relative; }
    table { border-collapse:collapse; }
    .visto-box{position:absolute;top:5mm;left:8mm;z-index:9999;border:1.5px solid #1a6b3c;background:#f0f9f1;padding:3px 8px;min-width:140px;text-align:center;border-radius:3px;line-height:1.2;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    .visto-box .visto-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#1a3a1a;letter-spacing:0.5px;}
    .visto-box .visto-data{font-size:7.5px;color:#1a3a1a;}
    .visto-box .visto-name{font-size:8px;font-weight:bold;color:#1a3a1a;margin-top:1px;}
    .visto-box .visto-role{font-size:7px;color:#1a6b3c;text-transform:uppercase;font-weight:bold;}
    @media print { @page { size:A3 landscape; margin:8mm 10mm; } body { padding:0; } }
  </style>
</head>
<body>
  <div class="visto-box">
    <div class="visto-label">VISTO</div>
    <div class="visto-data">Data ___/___/______</div>
    <div class="visto-name">${directorGeral}</div>
    <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
  </div>
  ${processedConteudo}
</body>
</html>`;
      return { html };
    }

    if (emitTemplate?.tipo === 'mapa_aproveitamento' && emitTemplate?.classeAlvo === 'MAPA_POR_CURSO_INDIVIDUAL') {
      if (!emitCursoId) {
        showToast('Seleccione um curso para gerar o mapa', 'error');
        return null;
      }
      const tabelaCursoHtml = buildMapaAproveitamentoPorCursoHtml(emitCursoId, emitTrimestre, emitPeriodo);
      {
        const now = new Date();
        const sortedT = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
        const anoLetivo = sortedT[0]?.anoLetivo || String(now.getFullYear());
        const anoLetivoSlash = (anoLetivo.includes('/') || anoLetivo.includes('-'))
          ? anoLetivo.replace(/-/g, '/')
          : `${anoLetivo}/${String(Number(anoLetivo) + 1).slice(-2)}`;
        const allTurnos = [...new Set(turmas.filter(t => t.ativo).map(t => (t.turno || '').trim()).filter(Boolean))];
        const periodoLabel = emitPeriodo && emitPeriodo !== 'AUTO'
          ? emitPeriodo
          : allTurnos.length === 0 ? 'Diurno' : allTurnos.length === 1 ? allTurnos[0] : allTurnos.join(' / ');
        const municipio = (config as any).municipio || 'Luanda';
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const dataActual = `${String(now.getDate()).padStart(2,'0')} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
        const cursoNome = cursos.find(c => c.id === emitCursoId)?.nome || '';
        const varMap: Record<string, string> = {
          '{{NOME_ESCOLA}}': config.nomeEscola || 'Super Escola',
          '{{ANO_LECTIVO}}': anoLetivoSlash,
          '{{TRIMESTRE}}': String(emitTrimestre),
          '{{REGIME}}': periodoLabel,
          '{{MUNICIPIO}}': municipio,
          '{{DATA_ACTUAL}}': dataActual,
          '{{NOME_CURSO}}': cursoNome,
          '{{NOME_DIRECTOR}}': directorGeral,
          '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
          '{{TABELA_MAPA_APROVEITAMENTO_CURSO}}': tabelaCursoHtml,
        };
        let processedConteudo = emitTemplate.conteudo;
        Object.entries(varMap).forEach(([k, v]) => {
          processedConteudo = processedConteudo.split(k).join(v);
        });
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${emitTemplate.nome}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family:'Arial',sans-serif; font-size:11px; line-height:1.7; color:#000; padding:12mm 14mm; position:relative; }
    table { border-collapse:collapse; }
    .visto-box{position:absolute;top:5mm;left:8mm;z-index:9999;border:1.5px solid #1a6b3c;background:#f0f9f1;padding:3px 8px;min-width:140px;text-align:center;border-radius:3px;line-height:1.2;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    .visto-box .visto-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#1a3a1a;letter-spacing:0.5px;}
    .visto-box .visto-data{font-size:7.5px;color:#1a3a1a;}
    .visto-box .visto-name{font-size:8px;font-weight:bold;color:#1a3a1a;margin-top:1px;}
    .visto-box .visto-role{font-size:7px;color:#1a6b3c;text-transform:uppercase;font-weight:bold;}
    @media print { @page { size:A4 landscape; margin:8mm 10mm; } body { padding:0; } }
  </style>
</head>
<body>
  <div class="visto-box">
    <div class="visto-label">VISTO</div>
    <div class="visto-data">Data ___/___/______</div>
    <div class="visto-name">${directorGeral}</div>
    <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
  </div>
  ${processedConteudo}
</body>
</html>`;
        return { html };
      }
    }

    if (emitTemplate?.tipo === 'mapa_aproveitamento') {
      const tabelaAprovHtml = buildMapaPorCursoClasseHtml(emitTrimestre, emitPeriodo, emitCiclo);
      {
        const now = new Date();
        const sortedT = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
        const anoLetivo = sortedT[0]?.anoLetivo || String(now.getFullYear());
        const anoLetivoSlash = (anoLetivo.includes('/') || anoLetivo.includes('-'))
          ? anoLetivo.replace(/-/g, '/')
          : `${anoLetivo}/${String(Number(anoLetivo) + 1).slice(-2)}`;
        const allTurnos = [...new Set(turmas.filter(t => t.ativo).map(t => (t.turno || '').trim()).filter(Boolean))];
        const periodoLabel = emitPeriodo && emitPeriodo !== 'AUTO'
          ? emitPeriodo
          : allTurnos.length === 0 ? 'Diurno' : allTurnos.length === 1 ? allTurnos[0] : allTurnos.join(' / ');
        const municipio = (config as any).municipio || 'Luanda';
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const dataActual = `${String(now.getDate()).padStart(2,'0')} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
        const varMap: Record<string, string> = {
          '{{NOME_ESCOLA}}': config.nomeEscola || 'Super Escola',
          '{{ANO_LECTIVO}}': anoLetivoSlash,
          '{{TRIMESTRE}}': String(emitTrimestre),
          '{{REGIME}}': periodoLabel,
          '{{MUNICIPIO}}': municipio,
          '{{DATA_ACTUAL}}': dataActual,
          '{{NOME_DIRECTOR}}': directorGeral,
          '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
          '{{TABELA_MAPA_APROVEITAMENTO}}': tabelaAprovHtml,
        };
        let processedConteudo = emitTemplate.conteudo;
        Object.entries(varMap).forEach(([k, v]) => {
          processedConteudo = processedConteudo.split(k).join(v);
        });
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${emitTemplate.nome}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family:'Arial',sans-serif; font-size:11px; line-height:1.7; color:#000; padding:12mm 14mm; position:relative; }
    table { border-collapse:collapse; }
    .visto-box{position:absolute;top:5mm;left:8mm;z-index:9999;border:1.5px solid #1a6b3c;background:#f0f9f1;padding:3px 8px;min-width:140px;text-align:center;border-radius:3px;line-height:1.2;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    .visto-box .visto-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#1a3a1a;letter-spacing:0.5px;}
    .visto-box .visto-data{font-size:7.5px;color:#1a3a1a;}
    .visto-box .visto-name{font-size:8px;font-weight:bold;color:#1a3a1a;margin-top:1px;}
    .visto-box .visto-role{font-size:7px;color:#1a6b3c;text-transform:uppercase;font-weight:bold;}
    @media print { @page { size:A3 landscape; margin:8mm 10mm; } body { padding:0; } }
  </style>
</head>
<body>
  <div class="visto-box">
    <div class="visto-label">VISTO</div>
    <div class="visto-data">Data ___/___/______</div>
    <div class="visto-name">${directorGeral}</div>
    <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
  </div>
  ${processedConteudo}
</body>
</html>`;
        return { html };
      }
    }

    if (emitTemplate?.tipo === 'mapa_frequencias') {
      const tabelaFqHtml = buildMapaFrequenciasHtml(emitCiclo);
      {
        const now = new Date();
        const sortedT = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
        const anoLetivo = sortedT[0]?.anoLetivo || String(now.getFullYear());
        const anoLetivoSlash = (anoLetivo.includes('/') || anoLetivo.includes('-'))
          ? anoLetivo.replace(/-/g, '/')
          : `${anoLetivo}/${String(Number(anoLetivo) + 1).slice(-2)}`;
        const allTurnos = [...new Set(turmas.filter(t => t.ativo).map(t => (t.turno || '').trim()).filter(Boolean))];
        const periodoLabel = emitPeriodo && emitPeriodo !== 'AUTO'
          ? emitPeriodo
          : allTurnos.length === 0 ? 'Diurno' : allTurnos.length === 1 ? allTurnos[0] : allTurnos.join(' / ');
        const municipio = (config as any).municipio || 'Luanda';
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const dataActual = `${String(now.getDate()).padStart(2,'0')} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;
        const varMap: Record<string, string> = {
          '{{NOME_ESCOLA}}': config.nomeEscola || 'Super Escola',
          '{{ANO_LECTIVO}}': anoLetivoSlash,
          '{{TRIMESTRE}}': String(emitTrimestre),
          '{{REGIME}}': periodoLabel,
          '{{MUNICIPIO}}': municipio,
          '{{DATA_ACTUAL}}': dataActual,
          '{{NOME_DIRECTOR}}': directorGeral,
          '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': directorPedagogico,
          '{{TABELA_MAPA_FREQUENCIAS}}': tabelaFqHtml,
        };
        let processedConteudo = emitTemplate.conteudo;
        Object.entries(varMap).forEach(([k, v]) => {
          processedConteudo = processedConteudo.split(k).join(v);
        });
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${emitTemplate.nome}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family:'Arial',sans-serif; font-size:11px; line-height:1.7; color:#000; padding:12mm 14mm; position:relative; }
    table { border-collapse:collapse; }
    .visto-box{position:absolute;top:5mm;left:8mm;z-index:9999;border:1.5px solid #1a6b3c;background:#f0f9f1;padding:3px 8px;min-width:140px;text-align:center;border-radius:3px;line-height:1.2;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    .visto-box .visto-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#1a3a1a;letter-spacing:0.5px;}
    .visto-box .visto-data{font-size:7.5px;color:#1a3a1a;}
    .visto-box .visto-name{font-size:8px;font-weight:bold;color:#1a3a1a;margin-top:1px;}
    .visto-box .visto-role{font-size:7px;color:#1a6b3c;text-transform:uppercase;font-weight:bold;}
    @media print { @page { size:A3 landscape; margin:8mm 10mm; } body { padding:0; } }
  </style>
</head>
<body>
  <div class="visto-box">
    <div class="visto-label">VISTO</div>
    <div class="visto-data">Data ___/___/______</div>
    <div class="visto-name">${directorGeral}</div>
    <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
  </div>
  ${processedConteudo}
</body>
</html>`;
        return { html };
      }
    }

    if (emitTemplate?.tipo === 'certificado_primario' && emitAlunoId) {
      return { html: buildCertificadoPrimarioHtml(emitAlunoId), trackEmitido: { alunoId: emitAlunoId, nome: emitTemplate.nome } };
    }

    if (emitTemplate?.tipo === 'extrato_propina' && emitAlunoId) {
      try {
        const params = new URLSearchParams({ alunoId: emitAlunoId });
        if (emitExtratoDataInicio) params.append('dataInicio', emitExtratoDataInicio);
        if (emitExtratoDataFim) params.append('dataFim', emitExtratoDataFim);
        const extratoData = await api.get(`/api/extrato-propinas?${params}`);
        return { html: buildExtratoFromEditorTemplate(emitTemplate, extratoData), trackEmitido: { alunoId: emitAlunoId, nome: emitTemplate.nome } };
      } catch (e) {
        console.error('[buildEmitDocHtml:extrato_propina]', e);
        showToast('Erro ao gerar o extracto de propinas', 'error');
        return null;
      }
    }

    if (emitTemplate?.tipo === 'lista_turma' && emitTurmaId) {
      return { html: buildListaTurmaHtml(emitTurmaId) };
    }

    // Validação para todos os tipos de pauta
    if (
      (emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta' ||
       emitTemplate?.tipo === 'pauta_disciplina' || emitTemplate?.tipo === 'pauta_final') &&
      emitTurmaId
    ) {
      const turmaValidacao = turmas.find(t => t.id === emitTurmaId);
      if (!turmaValidacao) {
        webAlert('Turma Inválida', 'A turma seleccionada não foi encontrada. Por favor, seleccione uma turma válida.');
        return null;
      }
      // Para mini-pautas e pautas, permitir turmas inactivas (re-emissão de anos/trimestres anteriores)
      const isMiniPautaTipo = emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta';
      if (!isMiniPautaTipo && !turmaValidacao.ativo) {
        webAlert(
          'Turma Inactiva',
          `A turma "${turmaValidacao.nome}" está marcada como inactiva.\n\nApenas turmas activas do ano lectivo em curso podem ser usadas para emissão de pautas finais.`
        );
        return null;
      }
      // Para turmas inactivas de mini-pauta, verificar alunos também nas notas históricas
      const alunosActivos = alunos.filter(a => a.ativo && a.turmaId === emitTurmaId);
      const notasDaTurma = notas.filter(n => n.turmaId === emitTurmaId);
      const idsNasNotas = [...new Set(notasDaTurma.map((n: any) => n.alunoId).filter(Boolean))];
      const temAlunosHistorico = idsNasNotas.length > 0;
      if (alunosActivos.length === 0 && !temAlunosHistorico) {
        webAlert(
          'Turma Sem Alunos',
          `A turma "${turmaValidacao.nome}" não tem alunos nem notas registadas.\n\nNão é possível emitir uma pauta para uma turma sem dados.`
        );
        return null;
      }
    }

    if ((emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') && emitTurmaId) {
      const pautaReg = pautas.find(p =>
        p.turmaId === emitTurmaId &&
        (!emitDisciplina || p.disciplina === emitDisciplina) &&
        (!emitMiniPautaTrimestre || Number(p.trimestre) === Number(emitMiniPautaTrimestre))
      );
      const numStr = pautaReg?.numero ? String(pautaReg.numero).padStart(3, '0') : undefined;
      const turmaObj = turmas.find(t => t.id === emitTurmaId);
      return {
        html: buildMiniPautaHtml(emitTurmaId, emitDisciplina || undefined, (emitMiniPautaTrimestre || undefined) as 1 | 2 | 3 | undefined, emitTemplate?.insigniaBase64 || undefined, emitTemplate?.marcaAguaBase64 || undefined, numStr),
        trackPauta: {
          turmaId: emitTurmaId,
          turmaNome: turmaObj?.nome || '',
          turmaClasse: turmaObj?.classe || '',
          anoLetivo: turmaObj?.anoLetivo || emitMiniPautaAnoLetivo || '',
          trimestre: emitMiniPautaTrimestre || null,
          disciplina: emitDisciplina || null,
          templateId: emitTemplate?.id || null,
          templateNome: emitTemplate?.nome || null,
        },
      };
    }

    if (emitTemplate?.tipo === 'pauta_disciplina' && emitTurmaId && emitDisciplina) {
      return { html: buildMiniPautaDisciplinaHtml(emitTurmaId, emitDisciplina, emitTemplate?.insigniaBase64 || undefined, emitTemplate?.marcaAguaBase64 || undefined) };
    }

    if (emitTemplate?.tipo === 'pauta_final' && emitTurmaId) {
      const pautaFinalReg = pautas.filter(p => p.turmaId === emitTurmaId).sort((a: any, b: any) => (a.numero || 0) - (b.numero || 0))[0];
      const numFinalStr = pautaFinalReg?.numero ? String(pautaFinalReg.numero).padStart(3, '0') : undefined;
      return { html: buildPautaFinalHtml(emitTurmaId, emitPaperSize, emitTemplate?.insigniaBase64 || undefined, emitTemplate?.marcaAguaBase64 || undefined, numFinalStr) };
    }

    if (emitTemplate?.tipo === 'ficha_matricula' && emitAlunoId) {
      return { html: buildFichaMatriculaHtml(emitAlunoId), trackEmitido: { alunoId: emitAlunoId, nome: emitTemplate.nome } };
    }

    if (emitTemplate?.tipo === 'comprovativo_matricula' && emitAlunoId) {
      try {
        const tipoDoc = (emitTemplate as any).classeAlvo === 'reconfirmacao' ? 'reconfirmacao' : 'matricula';
        const payload = await api.get(`/api/comprovativo-matricula?alunoId=${encodeURIComponent(emitAlunoId)}`);
        return { html: buildComprovatvoMatriculaHtml(payload as any, tipoDoc), trackEmitido: { alunoId: emitAlunoId, nome: emitTemplate.nome } };
      } catch (e) {
        console.error('[buildEmitDocHtml:comprovativo_matricula]', e);
        showToast('Erro ao gerar o comprovativo de matrícula', 'error');
        return null;
      }
    }

    if (emitTemplate?.tipo === 'certificado' && emitTemplate?.classeAlvo && emitAlunoId) {
      const classe = emitTemplate.classeAlvo;
      let html = '';
      if (classe === 'I-CICLO-GERAL') html = buildCertificadoHabilitacoesICicloHtml(emitAlunoId);
      else if (classe === 'I-CICLO-13-DUNDO') html = buildCertificadoHabilitacoesICiclo13DundoHtml(emitAlunoId);
      else if (classe === '12ª-II-CICLO') {
        // ── Validação: o aluno deve ter notas preenchidas até à 12ª Classe ───
        const alunoNotasII = notas.filter(n => n.alunoId === emitAlunoId);
        // Mapa anoLetivo → classe (mesmo algoritmo do buildCertificadoIiCicloHtml)
        const _anosUniq = [...new Set(alunoNotasII.map(n => n.anoLetivo))].sort();
        const _anoToClasse: Record<string, string> = {};
        { const _seq = ['10ª', '11ª', '12ª']; const _off = Math.max(0, _anosUniq.length - 3); _anosUniq.slice(_off).forEach((a, i) => { _anoToClasse[a] = _seq[i]; }); }
        // Verificar se existe pelo menos uma nota positiva para cada classe (10ª, 11ª, 12ª)
        const classesComNotas = new Set<string>();
        for (const nota of alunoNotasII) {
          const nfVal = Number(nota.nf) || 0;
          const macVal = Number((nota as any).mac) || 0;
          const pp1Val = Number((nota as any).pp1) || 0;
          if (nfVal <= 0 && macVal <= 0 && pp1Val <= 0) continue;
          const t = turmas.find(tr => tr.id === nota.turmaId);
          let classeKey: string | undefined;
          if (t) classeKey = ['10ª', '11ª', '12ª'].find(c => t.classe?.startsWith(c.replace('ª', '')) || t.classe === c);
          if (!classeKey) classeKey = _anoToClasse[nota.anoLetivo];
          if (classeKey) classesComNotas.add(classeKey);
        }
        const classesEmFalta = ['10ª', '11ª', '12ª'].filter(c => !classesComNotas.has(c));
        if (classesEmFalta.length > 0) {
          const al = alunos.find(a => a.id === emitAlunoId);
          const nomeAluno = al ? `${al.nome} ${al.apelido}` : 'Este aluno';
          webAlert(
            '⚠️ Certificado Não Pode Ser Emitido',
            `${nomeAluno} não tem notas preenchidas para: ${classesEmFalta.join(', ')}.\n\nO Certificado de Habilitações — IIº Ciclo só pode ser emitido quando o aluno possuir notas lançadas para as três classes: 10ª, 11ª e 12ª.`
          );
          return null;
        }
        html = buildCertificadoIiCicloHtml(emitAlunoId);
      }
      else if (classe === '13ª-ITAQ') html = buildCertificadoItaqHtml(emitAlunoId);
      else if (classe === 'PEDAGOGICO-II-CICLO') html = buildCertificadoHabilitacoesLiterariasHtml(emitAlunoId);
      else if (classe === 'TECNICO-PROFISSIONAL') html = buildCertificadoTecnicoProfissionalHtml(emitAlunoId);
      else html = buildCertificadoHabilitacoesHtml(emitAlunoId, classe);
      return { html, trackEmitido: { alunoId: emitAlunoId, nome: emitTemplate.nome } };
    }

    // Standard document: use template preview text
    const tplMarcaAgua = emitTemplate?.marcaAguaBase64;
    const watermarkHtml = tplMarcaAgua
      ? `<img src="${tplMarcaAgua}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;opacity:0.05;pointer-events:none;z-index:0;" />`
      : '';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>${emitTemplate?.nome || 'Documento'}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          body { font-family: 'Times New Roman', serif; margin: 0; padding: 18mm 22mm; font-size: 14px; line-height: 1.8; color: #000; position: relative; }
          .content { position: relative; z-index: 1; }
          pre { white-space: pre-wrap; font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.9; text-align: justify; }
          @media print {
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 14mm 18mm; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        ${watermarkHtml}
        <div class="content">
          ${isHtmlContent(emitPreview) ? `<div style="line-height:1.9;font-family:'Times New Roman',serif;font-size:14px;">${emitPreview}</div>` : `<pre>${emitPreview}</pre>`}
        </div>
      </body>
      </html>
    `;
    return {
      html,
      trackEmitido: emitAlunoId && emitTemplate ? { alunoId: emitAlunoId, nome: emitTemplate.nome } : undefined,
    };
  }

  async function handlePrint() {
    if (Platform.OS !== 'web') return;
    const result = await buildEmitDocHtml();
    if (!result) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(result.html);
    win.document.close();
    // Pautas use a brief delay so the DOM is fully laid out before print
    if (emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta' || emitTemplate?.tipo === 'pauta_disciplina' || emitTemplate?.tipo === 'pauta_final') {
      setTimeout(() => { win.focus(); win.print(); }, 800);
    } else {
      win.print();
    }
    if (result.trackEmitido) {
      saveDocumentoEmitido(result.trackEmitido.alunoId, result.trackEmitido.nome);
    }
    if ((result as any).trackPauta) {
      void fetch('/api/mini-pauta-emissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...(result as any).trackPauta, formato: 'impressao' }),
      }).catch(() => {});
    }
  }

  async function handlePreviewHtml() {
    if (Platform.OS !== 'web') return;
    const result = await buildEmitDocHtml();
    if (!result) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(result.html);
    win.document.close();
    win.focus();
  }

  async function handleSavePdf() {
    if (Platform.OS !== 'web') return;
    const result = await buildEmitDocHtml();
    if (!result) return;
    try {
      showToast('A gerar PDF…', 'info');
      const aluno = emitAlunoId ? alunos.find(a => a.id === emitAlunoId) : null;
      const filenameBase = [
        emitTemplate?.nome || 'documento',
        aluno ? `${aluno.nome}_${aluno.apelido}` : null,
      ].filter(Boolean).join(' - ');
      const landscape = emitTemplate?.tipo === 'mapa_aproveitamento'
        || emitTemplate?.tipo === 'mapa_frequencias'
        || emitTemplate?.tipo === 'pauta_final'
        || emitTemplate?.tipo === 'lista_turma';
      const usesPaperSizeToggle = emitTemplate?.tipo === 'pauta_final';
      const pdfFormat = usesPaperSizeToggle ? emitPaperSize : 'A4';
      const resp = await fetch('/api/render-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: result.html, filename: filenameBase, landscape, format: pdfFormat }),
      });
      if (!resp.ok) {
        showToast('Erro ao gerar PDF no servidor', 'error');
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('PDF descarregado', 'success');
      if (result.trackEmitido) {
        saveDocumentoEmitido(result.trackEmitido.alunoId, result.trackEmitido.nome);
      }
      if ((result as any).trackPauta) {
        void fetch('/api/mini-pauta-emissoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...(result as any).trackPauta, formato: 'pdf' }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[handleSavePdf]', e);
      showToast('Erro ao gerar PDF', 'error');
    }
  }

  function handleExportExcel() {
    if (Platform.OS !== 'web') return;
    if (emitTemplate?.tipo === 'pauta_final' && emitTurmaId) {
      void buildPautaFinalExcel(emitTurmaId, emitPaperSize);
      return;
    }
    if ((emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta' || emitTemplate?.tipo === 'pauta_disciplina') && emitTurmaId) {
      const token = (typeof window !== 'undefined' && (window as any).localStorage)
        ? (window as any).localStorage.getItem('@siga_token') || ''
        : '';
      const params = new URLSearchParams({ turmaId: emitTurmaId, token, trimestre: String(emitMiniPautaTrimestre || 0) });
      if (emitDisciplina) params.set('disciplina', emitDisciplina);
      const a = document.createElement('a');
      a.href = `/api/mini-pauta/excel?${params.toString()}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 200);
      return;
    }
  }

  const screenWidth = Dimensions.get('window').width;
  const isWide = screenWidth >= 768;

  // ─── RENDER ───────────────────────────────────────────────────────────────

  const toastColors = {
    success: { bg: '#064E3B', border: '#10B981', icon: 'checkmark-circle' as const, iconColor: '#10B981' },
    error:   { bg: '#4C0519', border: '#F43F5E', icon: 'close-circle'     as const, iconColor: '#F43F5E' },
    info:    { bg: '#0C1A6B', border: '#818CF8', icon: 'information-circle' as const, iconColor: '#818CF8' },
  };
  const tc = toastColors[toastType];

  return (
    <View style={{ flex: 1 }}>
      {mode === 'list' && ListScreen()}
      {mode === 'editor' && EditorScreen()}
      {mode === 'emit' && EmitScreen()}

      {/* ── Toast notification overlay ── */}
      <Animated.View
        style={[
          styles.toastContainer,
          { pointerEvents: 'none', opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
        ] as any}
      >
        <View style={[styles.toastInner, { backgroundColor: tc.bg, borderColor: tc.border }]}>
          <Ionicons name={tc.icon} size={18} color={tc.iconColor} />
          <Text style={[styles.toastText, { color: tc.iconColor }]}>{toastMsg}</Text>
        </View>
      </Animated.View>
    </View>
  );

  // ─── LIST ─────────────────────────────────────────────────────────────────

  function ListScreen() {
    const filtro = listFiltro;
    const setFiltro = setListFiltro;
    const pesquisa = listPesquisa;
    const setPesquisa = setListPesquisa;

    const tem13 = (config as any).temDecimaTermeira !== false;
    // Ocultar templates exclusivos da 13ª Classe quando a escola não tem 13ª
    const CLASSES_ALVO_13 = ['13ª', '13ª-ITAQ'];
    const templatesVisiveis = tem13
      ? templates
      : templates.filter(t => {
          if (CLASSES_ALVO_13.includes(t.classeAlvo ?? '')) return false;
          if ((t.grupo ?? '').includes('13ª')) return false;
          if (t.nome?.includes('13ª') && !t.nome?.includes('10ª') && !t.nome?.includes('11ª') && !t.nome?.includes('12ª')) return false;
          return true;
        });

    const totalBloqueados = templatesVisiveis.filter(t => t.bloqueado).length;
    const totalAtivos = templatesVisiveis.filter(t => !t.bloqueado).length;

    const byFiltro = canManageLocks
      ? (filtro === 'ativos'
          ? templatesVisiveis.filter(t => !t.bloqueado)
          : filtro === 'bloqueados'
            ? templatesVisiveis.filter(t => t.bloqueado)
            : templatesVisiveis)
      : templatesVisiveis.filter(t => !t.bloqueado);

    const visibleTemplates = pesquisa.trim()
      ? byFiltro.filter(t => {
          const q = pesquisa.toLowerCase();
          return (
            t.nome.toLowerCase().includes(q) ||
            (TIPO_LABELS[t.tipo] ?? t.tipo).toLowerCase().includes(q)
          );
        })
      : byFiltro;

    const listTotalPages = Math.ceil(visibleTemplates.length / LIST_PAGE_SIZE) || 1;
    const pagedTemplates = visibleTemplates.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);

    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Editor de Documentos</Text>
            <Text style={styles.headerSub}>
              {canManageLocks
                ? `${totalAtivos} activo${totalAtivos !== 1 ? 's' : ''} · ${totalBloqueados} bloqueado${totalBloqueados !== 1 ? 's' : ''}`
                : `${totalAtivos} modelo${totalAtivos !== 1 ? 's' : ''} disponíve${totalAtivos !== 1 ? 'is' : 'l'}`}
            </Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={openNew} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnText}>Novo</Text>
          </TouchableOpacity>
        </View>

        {/* Cartões de filtro — apenas para gestores, após carregamento */}
        {canManageLocks && !isLoading && (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            {([
              { key: 'todos',     count: templates.length,        label: 'Total',      icon: 'documents-outline' as const,  color: Colors.gold },
              { key: 'ativos',    count: totalAtivos,              label: 'Activos',    icon: 'lock-open-outline' as const,  color: Colors.success },
              { key: 'bloqueados',count: totalBloqueados,          label: 'Bloqueados', icon: 'lock-closed-outline' as const, color: Colors.danger },
              { key: 'eliminados',count: deletedTemplates.length,  label: 'Lixo',       icon: 'trash-outline' as const,      color: '#6B7280' },
            ] as const).map(f => {
              const active = filtro === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { setFiltro(f.key); if (f.key === 'eliminados') fetchDeletedTemplates(); }}
                  activeOpacity={0.75}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 8,
                    paddingHorizontal: 6,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: active ? f.color : Colors.border,
                    backgroundColor: active ? f.color + '18' : Colors.surface,
                  }}
                >
                  <Ionicons name={f.icon} size={14} color={active ? f.color : Colors.textMuted} />
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: active ? f.color : Colors.text, lineHeight: 20, marginTop: 2 }}>
                    {f.count}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: active ? f.color : Colors.textMuted, lineHeight: 13 }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ─── Vista do Lixo (Reciclagem) ─────────────────────────────── */}
        {filtro === 'eliminados' ? (
          <View style={{ flex: 1 }}>
            {/* Barra de acções do lixo */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>
                  {loadingDeleted ? 'A carregar...' : `${deletedTemplates.length} item${deletedTemplates.length !== 1 ? 's' : ''} no lixo`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={fetchDeletedTemplates}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Actualizar</Text>
                </TouchableOpacity>
                {deletedTemplates.length > 0 && (
                  <TouchableOpacity
                    onPress={esvaziarLixo}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.danger + '18', borderWidth: 1, borderColor: Colors.danger + '44' }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="trash" size={14} color={Colors.danger} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>Esvaziar Lixo</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {loadingDeleted ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                <AppLoader color={Colors.textMuted} />
                <Text style={{ marginTop: 12, fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>A carregar o lixo...</Text>
              </View>
            ) : deletedTemplates.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="trash-outline" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Lixo vazio</Text>
                <Text style={styles.emptyDesc}>Não existem modelos eliminados. Os modelos movidos para o lixo aparecerão aqui.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
                {deletedTemplates.map(t => {
                  const eliminadoDate = t.eliminadoEm ? new Date(t.eliminadoEm) : null;
                  const dataFormatada = eliminadoDate
                    ? `${eliminadoDate.getDate().toString().padStart(2, '0')}/${(eliminadoDate.getMonth() + 1).toString().padStart(2, '0')}/${eliminadoDate.getFullYear()} ${eliminadoDate.getHours().toString().padStart(2, '0')}:${eliminadoDate.getMinutes().toString().padStart(2, '0')}`
                    : '—';
                  return (
                    <View key={t.id} style={{ backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.danger + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="document-outline" size={18} color={Colors.danger} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={2}>{t.nome}</Text>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                            {TIPO_LABELS[t.tipo] ?? t.tipo}
                            {t.classeAlvo ? ` · ${t.classeAlvo}` : ''}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Eliminado em {dataFormatada}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
                        <TouchableOpacity
                          onPress={() => restaurarTemplate(t.id)}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '44' }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="arrow-undo-outline" size={15} color={Colors.success} />
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>Restaurar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => eliminarPermanente(t.id)}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.danger + '12', borderWidth: 1, borderColor: Colors.danger + '40' }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>Eliminar Sempre</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : (
        <>
        {/* Barra de pesquisa */}
        <View style={listStyles.searchWrap}>
          <StableSearchInput
            value={pesquisa}
            onChangeText={setPesquisa}
            inputStyle={listStyles.searchInput}
            placeholder="Pesquisar modelo por nome ou tipo..."
            iconSize={16}
            clearIconSize={18}
          />
        </View>


        {visibleTemplates.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name={pesquisa ? 'search' : 'file-alt'} size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {pesquisa
                ? 'Nenhum modelo encontrado'
                : filtro === 'bloqueados' ? 'Sem modelos bloqueados' : filtro === 'ativos' ? 'Sem modelos activos' : 'Nenhum modelo criado'}
            </Text>
            <Text style={styles.emptyDesc}>
              {pesquisa
                ? `Não foi encontrado nenhum modelo com "${pesquisa}". Tente outro termo.`
                : filtro === 'bloqueados' ? 'Nenhum modelo foi bloqueado.' : filtro === 'ativos' ? 'Todos os modelos estão bloqueados.' : 'Crie o primeiro modelo de documento para a sua escola.'}
            </Text>
            {pesquisa ? (
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setPesquisa('')}>
                <Ionicons name="close-circle-outline" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Limpar pesquisa</Text>
              </TouchableOpacity>
            ) : filtro === 'todos' ? (
              <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Criar primeiro modelo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {pagedTemplates.map(item => (
              <TemplateCard
                key={item.id}
                template={item}
                canManageLocks={canManageLocks}
                canDelete={canDelete}
                onToggleBloqueio={toggleBloqueio}
                onToggleDisponivelAluno={toggleDisponivelAluno}
                onPreview={previewTemplate}
                onEmitir={openEmit}
                onEdit={openEdit}
                onDelete={deleteTemplate}
                atribuicoesDeste={atribuicoesMiniPauta.filter(a => a.templateId === item.id)}
                onAtribuir={t => { setAtribuirTemplateAlvo(t); setAtribuirPesquisa(''); setShowAtribuirModal(true); }}
                onDesatribuir={handleDesatribuirTemplate}
              />
            ))}

            {/* ─── Planos de Aula Section ─────────────────────────────── */}
            {planosAulaDoc.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '44' }}>
                    <Ionicons name="book-outline" size={14} color={Colors.gold} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold }}>Planos de Aula</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted }}>({planosAulaDoc.filter((p: any) => p.status !== 'rascunho').length})</Text>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                </View>

                {planosAulaLoading ? (
                  <AppLoader color={Colors.gold} />
                ) : (
                  planosAulaDoc
                    .filter((p: any) => p.status !== 'rascunho')
                    .map((plano: any) => {
                      const statusColors: Record<string, string> = { submetido: '#f59e0b', aprovado: Colors.success, rejeitado: Colors.danger };
                      const statusLabels: Record<string, string> = { submetido: 'Submetido', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
                      const sc = statusColors[plano.status] || Colors.textMuted;
                      const sl = statusLabels[plano.status] || plano.status;
                      return (
                        <TouchableOpacity
                          key={plano.id}
                          style={[styles.card, { marginBottom: 10 }]}
                          onPress={() => setPreviewPlanoDoc(plano)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.cardHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>Plano de Aula</Text>
                              </View>
                              <View style={{ backgroundColor: sc + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: sc + '44' }}>
                                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: sc }}>{sl.toUpperCase()}</Text>
                              </View>
                            </View>
                            <Ionicons name="eye-outline" size={18} color={Colors.info} />
                          </View>
                          <Text style={styles.cardNome}>{plano.disciplina} — {plano.sumario || plano.unidade || '—'}</Text>
                          <Text style={styles.cardPreview} numberOfLines={1}>
                            {plano.professorNome} · {plano.turmaNome || '—'} · {plano.classe}ª · {plano.data || '—'}
                          </Text>
                          <View style={styles.cardFooter}>
                            <Text style={styles.cardDate}>Ano Lectivo: {plano.anoLetivo}</Text>
                            <View style={styles.cardActions}>
                              <TouchableOpacity
                                style={styles.cardActionBtn}
                                onPress={() => setPreviewPlanoDoc(plano)}
                              >
                                <Ionicons name="print-outline" size={14} color={Colors.info} />
                                <Text style={[styles.cardActionText, { color: Colors.info }]}>Abrir / Imprimir</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                )}
              </View>
            )}
          </ScrollView>
        )}

        {/* Pagination bar — only when not in trash and more than 1 page */}
        {filtro !== 'eliminados' && listTotalPages > 1 && (
          <View style={listStyles.pagination}>
            <TouchableOpacity
              style={[listStyles.pageBtn, listPage === 0 && listStyles.pageBtnDisabled]}
              onPress={() => setListPage(p => Math.max(0, p - 1))}
              disabled={listPage === 0}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={13} color={listPage === 0 ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>

            {Array.from({ length: listTotalPages }, (_, i) => {
              const show = i === 0 || i === listTotalPages - 1 || Math.abs(i - listPage) <= 1;
              if (!show) return null;
              const ellipsisBefore = i === listTotalPages - 1 && listPage < listTotalPages - 3;
              const ellipsisAfter  = i === 0 && listPage > 2;
              return (
                <React.Fragment key={i}>
                  {ellipsisAfter  && <Text style={listStyles.pageEllipsis}>…</Text>}
                  <TouchableOpacity
                    style={[listStyles.pageBtn, listPage === i && listStyles.pageBtnActive]}
                    onPress={() => setListPage(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[listStyles.pageBtnText, listPage === i && listStyles.pageBtnTextActive]}>{i + 1}</Text>
                  </TouchableOpacity>
                  {ellipsisBefore && <Text style={listStyles.pageEllipsis}>…</Text>}
                </React.Fragment>
              );
            })}

            <TouchableOpacity
              style={[listStyles.pageBtn, listPage === listTotalPages - 1 && listStyles.pageBtnDisabled]}
              onPress={() => setListPage(p => Math.min(listTotalPages - 1, p + 1))}
              disabled={listPage === listTotalPages - 1}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={13} color={listPage === listTotalPages - 1 ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>

            <Text style={listStyles.pageLabel}>Página {listPage + 1} de {listTotalPages}</Text>
          </View>
        )}
        </>
        )}

        {/* Modal: Atribuir Mini-Pauta ao Professor (por disciplina) */}
        {showAtribuirModal && atribuirTemplateAlvo && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowAtribuirModal(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
              <View style={{ backgroundColor: Colors.surface, borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '80%', overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                {/* Cabeçalho */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a6b3c20', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-add-outline" size={17} color="#1a6b3c" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Atribuir por Professor / Disciplina</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>{atribuirTemplateAlvo.nome}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowAtribuirModal(false)} style={{ padding: 6 }}>
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {/* Pesquisa */}
                <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <TextInput
                    value={atribuirPesquisa}
                    onChangeText={setAtribuirPesquisa}
                    placeholder="Pesquisar professor ou disciplina..."
                    placeholderTextColor={Colors.textMuted}
                    style={{ backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular' }}
                  />
                </View>
                {/* Lista Professor × Disciplina */}
                <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                  {(() => {
                    const q = atribuirPesquisa.toLowerCase();
                    // Expandir cada professor pelas suas disciplinas
                    const rows: { professorId: string; nomeProfessor: string; disciplinaId: string; disciplinaNome: string }[] = [];
                    for (const p of professores) {
                      const discs: string[] = Array.isArray((p as any).disciplinas)
                        ? (p as any).disciplinas
                        : typeof (p as any).disciplinas === 'string'
                          ? ((p as any).disciplinas ? [(p as any).disciplinas] : [])
                          : [];
                      if (discs.length === 0) {
                        rows.push({ professorId: p.id, nomeProfessor: `${p.nome} ${p.apelido}`.trim(), disciplinaId: '', disciplinaNome: '' });
                      } else {
                        for (const disc of discs) {
                          rows.push({ professorId: p.id, nomeProfessor: `${p.nome} ${p.apelido}`.trim(), disciplinaId: disc, disciplinaNome: disc });
                        }
                      }
                    }
                    const filtered = rows.filter(r =>
                      !q || r.nomeProfessor.toLowerCase().includes(q) || r.disciplinaNome.toLowerCase().includes(q)
                    );
                    if (filtered.length === 0) {
                      return (
                        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                          <Ionicons name="person-outline" size={38} color={Colors.textMuted} />
                          <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center' }}>Nenhum resultado encontrado</Text>
                        </View>
                      );
                    }
                    return filtered.map((r, idx) => {
                      const jaAtribuido = atribuicoesMiniPauta.find(a =>
                        a.professorId === r.professorId &&
                        (a.disciplinaId === r.disciplinaId || (!a.disciplinaId && !r.disciplinaId))
                      );
                      const isAtribuido = !!jaAtribuido;
                      return (
                        <TouchableOpacity
                          key={`${r.professorId}-${r.disciplinaId}-${idx}`}
                          style={{ backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5, borderColor: isAtribuido ? '#1a6b3c' : Colors.border, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                          onPress={() => handleAtribuirTemplate(atribuirTemplateAlvo.id, r.professorId, r.disciplinaId, r.disciplinaNome)}
                        >
                          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isAtribuido ? '#1a6b3c20' : Colors.textMuted + '18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Ionicons name="person" size={16} color={isAtribuido ? '#1a6b3c' : Colors.textMuted} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }} numberOfLines={1}>{r.nomeProfessor}</Text>
                            {r.disciplinaNome ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <Ionicons name="book-outline" size={11} color={Colors.accent} />
                                <Text style={{ fontSize: 11, color: Colors.accent, fontFamily: 'Inter_500Medium' }} numberOfLines={1}>{r.disciplinaNome}</Text>
                              </View>
                            ) : (
                              <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 1 }}>Sem disciplina definida</Text>
                            )}
                          </View>
                          {isAtribuido ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#1a6b3c18', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Ionicons name="checkmark-circle" size={13} color="#1a6b3c" />
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#1a6b3c' }}>ATRIBUÍDO</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.accent + '18', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Ionicons name="add-circle-outline" size={13} color={Colors.accent} />
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.accent }}>Atribuir</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

        {/* Preview plano modal */}
        {previewPlanoDoc && Platform.OS === 'web' && (
          <Modal visible animationType="slide" onRequestClose={() => setPreviewPlanoDoc(null)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flex: 1, backgroundColor: Colors.background }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface }}>
                <TouchableOpacity onPress={() => setPreviewPlanoDoc(null)} style={{ padding: 4 }}>
                  <Ionicons name="arrow-back" size={22} color={Colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>
                    Plano de Aula — {previewPlanoDoc.disciplina}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                    {previewPlanoDoc.professorNome} · {previewPlanoDoc.turmaNome} · {previewPlanoDoc.data}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={() => {
                    const iframe = document.getElementById('plano-doc-iframe') as HTMLIFrameElement;
                    if (iframe?.contentWindow) iframe.contentWindow.print();
                  }}
                >
                  <Ionicons name="print" size={16} color="#fff" />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Imprimir</Text>
                </TouchableOpacity>
              </View>
              <iframe
                id="plano-doc-iframe"
                srcDoc={buildPlanoHTMLDoc(previewPlanoDoc)}
                style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 600 } as any}
                title="Plano de Aula"
              />
            </View>
                      </KeyboardAvoidingView>
</Modal>
        )}
      </View>
    );
  }

  // TemplateCard foi movido para nível de módulo (acima de EditorDocumentos)
  // para garantir referência estável e evitar desmontagem/remontagem dos cartões.


  // ─── EDITOR ───────────────────────────────────────────────────────────────

  function EditorScreen() {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        {/* Editor Header */}
        <View style={styles.editorHeader}>
          <TouchableOpacity onPress={() => setMode('list')} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <TextInput
            style={styles.editorNomeInput}
            value={editorNome}
            onChangeText={updateEditorNome}
            placeholder="Nome do modelo..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={saveTemplate}
          />
          {Platform.OS === 'web' && editingTemplate && (
            <TouchableOpacity
              style={{ marginRight: 6, backgroundColor: '#dc262622', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={reporOriginal}
            >
              <Ionicons name="refresh-outline" size={15} color={'#ef4444'} />
              <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Repor Original</Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={{ marginRight: 8, backgroundColor: '#8b5cf622', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => {
                const c = Platform.OS === 'web' ? webEditorContentRef.current : editorContent;
                const fakeTpl: DocTemplate = { id: editingTemplate?.id || 'preview', nome: editorNome, tipo: editorTipo, conteudo: c, criadoEm: '', atualizadoEm: '', insigniaBase64: editorInsignia, marcaAguaBase64: editorMarcaAgua, cabecalhoNome: editorCabecalhoNome || undefined, cabecalhoExtra: editorCabecalhoExtra || undefined, cabecalhoAlign: editorCabecalhoAlign };
                previewTemplate(fakeTpl, c);
              }}
            >
              <Ionicons name="eye-outline" size={16} color={'#8b5cf6'} />
              <Text style={{ color: '#8b5cf6', fontSize: 13, fontWeight: '600' }}>Pré-ver</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
            onPress={saveTemplate}
            disabled={isSaving}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{isSaving ? 'A guardar...' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>

        {/* Aviso: variáveis usadas neste modelo que estão por preencher em Admin → Escola */}
        {referencedMissingVars.length > 0 && (
          <View style={{
            marginHorizontal: 12,
            marginTop: 8,
            backgroundColor: '#FEF3C7',
            borderWidth: 1,
            borderColor: '#F59E0B',
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 10,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <Ionicons name="alert-circle" size={18} color="#B45309" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E', fontFamily: 'Inter_600SemiBold', marginBottom: 3 }}>
                {referencedMissingVars.length === 1
                  ? '1 variável usada neste modelo está por preencher'
                  : `${referencedMissingVars.length} variáveis usadas neste modelo estão por preencher`}
              </Text>
              <Text style={{ fontSize: 11, color: '#78350F', lineHeight: 16 }}>
                {referencedMissingVars.map(v => v.tag).join(', ')}
              </Text>
              <Text style={{ fontSize: 10, color: '#92400E', marginTop: 4, fontStyle: 'italic' }}>
                Configure em {Array.from(new Set(referencedMissingVars.map(v => v.source))).join(' / ')} — caso contrário sairá vazio na impressão.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(main)/admin' as any)}
              style={{
                backgroundColor: '#F59E0B',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={12} color="#fff" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff', fontFamily: 'Inter_600SemiBold' }}>
                Configurar
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={isEditorExpanded ? { flex: 1 } : { paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
        {/* Tipo selector — dropdown moderno (hidden when expanded) */}
        {!isEditorExpanded && (() => {
          const PAUTA_TIPOS: DocTipo[] = ['pauta', 'mini_pauta', 'pauta_disciplina', 'pauta_final'];
          const isPautaEditor = PAUTA_TIPOS.includes(editorTipo as DocTipo);
          const allTipos = Object.keys(TIPO_LABELS) as DocTipo[];
          const visibleTipos = isPautaEditor
            ? allTipos.filter(t => PAUTA_TIPOS.includes(t) || t === 'outro')
            : allTipos;
          const visibleSet = new Set(visibleTipos);
          const grupos = TIPO_GRUPOS.map(g => ({ ...g, tipos: g.tipos.filter(t => visibleSet.has(t)) })).filter(g => g.tipos.length > 0);
          const q = tipoSearch.trim().toLowerCase();
          const filteredTipos = q ? visibleTipos.filter(t => TIPO_LABELS[t].toLowerCase().includes(q)) : visibleTipos;
          const activeColor = TIPO_COLORS[editorTipo] ?? Colors.gold;

          if (Platform.OS === 'web') {
            return (
              <View style={styles.tipoSelectWrap}>
                <View style={styles.tipoSelectLabelRow}>
                  <View style={[styles.tipoSelectDot, { backgroundColor: activeColor }]} />
                  <Text style={styles.tipoSelectLabel}>TIPO DE DOCUMENTO</Text>
                </View>
                <View style={styles.tipoSelectInner}>
                  <View style={styles.tipoSelectChevron} pointerEvents="none">
                    <Ionicons name="chevron-down" size={13} color="#7a92a8" />
                  </View>
                  <select
                    value={editorTipo}
                    onChange={(e: any) => handleTipoChange(e.target.value as DocTipo)}
                    style={{
                      appearance: 'none' as any,
                      WebkitAppearance: 'none' as any,
                      MozAppearance: 'none' as any,
                      width: '100%',
                      height: 40,
                      backgroundColor: '#0a1929',
                      color: '#f4e9c8',
                      border: `1.5px solid ${activeColor}66`,
                      borderRadius: 10,
                      paddingLeft: 12,
                      paddingRight: 32,
                      fontSize: 13,
                      fontFamily: 'Inter_600SemiBold, system-ui, sans-serif',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.18s, box-shadow 0.18s',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
                    } as any}
                    onFocus={(e: any) => {
                      e.target.style.borderColor = activeColor;
                      e.target.style.boxShadow = `0 0 0 3px ${activeColor}22, inset 0 1px 3px rgba(0,0,0,0.3)`;
                    }}
                    onBlur={(e: any) => {
                      e.target.style.borderColor = `${activeColor}66`;
                      e.target.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.3)';
                    }}
                  >
                    {grupos.map(g => (
                      <optgroup
                        key={g.label}
                        label={`── ${g.label} ──`}
                        style={{ color: '#D4AF37', backgroundColor: '#091929' } as any}
                      >
                        {g.tipos.map(t => (
                          <option key={t} value={t} style={{ backgroundColor: '#0a1929', color: '#f4e9c8' }}>
                            {TIPO_LABELS[t]}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </View>
              </View>
            );
          }

          return (
            <>
              <TouchableOpacity
                style={styles.tipoSelectWrap}
                onPress={() => { setTipoSearch(''); setTipoSelectOpen(true); }}
                activeOpacity={0.8}
              >
                <View style={styles.tipoSelectLabelRow}>
                  <View style={[styles.tipoSelectDot, { backgroundColor: activeColor }]} />
                  <Text style={styles.tipoSelectLabel}>TIPO DE DOCUMENTO</Text>
                </View>
                <View style={styles.tipoSelectTrigger}>
                  <Text style={styles.tipoSelectTriggerTxt} numberOfLines={1}>{TIPO_LABELS[editorTipo]}</Text>
                  <Ionicons name="chevron-expand" size={16} color="#7a92a8" />
                </View>
              </TouchableOpacity>

              <Modal visible={tipoSelectOpen} transparent animationType="slide" onRequestClose={() => setTipoSelectOpen(false)}>
                <Pressable style={styles.tipoModalOverlay} onPress={() => setTipoSelectOpen(false)}>
                  <Pressable style={styles.tipoModalSheet} onPress={e => e.stopPropagation()}>
                    <View style={styles.tipoModalHandle} />
                    <View style={styles.tipoModalHeader}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="document-text-outline" size={16} color={Colors.gold} />
                        <Text style={styles.tipoModalTitle}>Tipo de Documento</Text>
                        <View style={styles.tipoModalCount}><Text style={styles.tipoModalCountTxt}>{visibleTipos.length}</Text></View>
                      </View>
                      <TouchableOpacity onPress={() => setTipoSelectOpen(false)} hitSlop={14} style={styles.tipoModalClose}>
                        <Ionicons name="close" size={18} color="#7a92a8" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.tipoModalSearch}>
                      <Ionicons name="search" size={14} color={tipoSearch ? Colors.gold : '#7a92a8'} />
                      <TextInput
                        style={styles.tipoModalSearchInput}
                        value={tipoSearch}
                        onChangeText={setTipoSearch}
                        placeholder="Pesquisar tipo…"
                        placeholderTextColor="#7a92a8"
                      />
                      {tipoSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setTipoSearch('')} hitSlop={8}>
                          <Ionicons name="close-circle" size={16} color="#7a92a8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <ScrollView style={{ flex: 1 }} bounces={false} keyboardShouldPersistTaps="handled">
                      {q ? (
                        filteredTipos.length === 0 ? (
                          <View style={{ padding: 28, alignItems: 'center' }}>
                            <Text style={{ fontSize: 13, color: '#7a92a8', fontFamily: 'Inter_400Regular' }}>Sem resultados para "{tipoSearch}"</Text>
                          </View>
                        ) : filteredTipos.map(t => {
                          const isActive = t === editorTipo;
                          return (
                            <TouchableOpacity
                              key={t}
                              style={[styles.tipoModalOption, isActive && { backgroundColor: `${TIPO_COLORS[t]}15` }]}
                              onPress={() => { handleTipoChange(t); setTipoSelectOpen(false); }}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.tipoModalDot, { backgroundColor: TIPO_COLORS[t] }]} />
                              <Text style={[styles.tipoModalOptTxt, isActive && { color: TIPO_COLORS[t] }]}>{TIPO_LABELS[t]}</Text>
                              {isActive && <Ionicons name="checkmark-circle" size={18} color={TIPO_COLORS[t]} />}
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        grupos.map(g => (
                          <View key={g.label}>
                            <View style={styles.tipoModalGroupHeader}>
                              <Text style={styles.tipoModalGroupTxt}>{g.label}</Text>
                              <View style={styles.tipoModalGroupLine} />
                            </View>
                            {g.tipos.map(t => {
                              const isActive = t === editorTipo;
                              return (
                                <TouchableOpacity
                                  key={t}
                                  style={[styles.tipoModalOption, isActive && { backgroundColor: `${TIPO_COLORS[t]}15` }]}
                                  onPress={() => { handleTipoChange(t); setTipoSelectOpen(false); }}
                                  activeOpacity={0.7}
                                >
                                  <View style={[styles.tipoModalDot, { backgroundColor: TIPO_COLORS[t] }]} />
                                  <Text style={[styles.tipoModalOptTxt, isActive && { color: TIPO_COLORS[t] }]}>{TIPO_LABELS[t]}</Text>
                                  {isActive && <Ionicons name="checkmark-circle" size={18} color={TIPO_COLORS[t]} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </Pressable>
                </Pressable>
              </Modal>
            </>
          );
        })()}

        {/* Aparência do documento (hidden when expanded) */}
        {!isEditorExpanded && <View style={styles.appearSection}>
          <TouchableOpacity style={styles.appearHeader} onPress={() => setShowAppearPanel(v => !v)} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={15} color={Colors.gold} />
            <Text style={styles.appearHeaderTitle}>Aparência do Documento</Text>
            <Ionicons name={showAppearPanel ? 'chevron-up' : 'chevron-down'} size={15} color={Colors.textMuted} />
          </TouchableOpacity>

          {showAppearPanel && (
            <View style={styles.appearBody}>
              {/* ── Marca de água ── */}
              <View style={styles.appearItem}>
                <View style={styles.appearItemInfo}>
                  <Text style={styles.appearItemLabel}>Marca de Água</Text>
                  <Text style={styles.appearItemHint}>Imagem em fundo no documento (transparente)</Text>
                </View>
                <View style={styles.appearItemControls}>
                  {editorMarcaAgua ? (
                    <View style={styles.imagePreviewWrap}>
                      <View style={styles.imagePreviewMarcaWrap}>
                        <Image source={{ uri: editorMarcaAgua }} style={styles.imagePreviewMarca} resizeMode="contain" />
                        <View style={styles.imagePreviewMarcaOverlay} />
                      </View>
                      <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => updateEditorMarcaAgua(undefined)}>
                        <Ionicons name="close-circle" size={20} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(updateEditorMarcaAgua)} activeOpacity={0.75}>
                      <Ionicons name="cloud-upload-outline" size={18} color={Colors.info} />
                      <Text style={[styles.uploadBtnText, { color: Colors.info }]}>Carregar imagem</Text>
                    </TouchableOpacity>
                  )}
                  {editorMarcaAgua && (
                    <TouchableOpacity style={styles.changeBtn} onPress={() => pickImage(updateEditorMarcaAgua)} activeOpacity={0.75}>
                      <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.changeBtnText}>Alterar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

            </View>
          )}
        </View>}

        <View style={[styles.editorBody, isWide && { flexDirection: 'row' }, isEditorExpanded && { flex: 1 }]}>
          {/* Text area */}
          <View style={[styles.editorTextWrap, isWide && { flex: 1 }]}>
            <View style={styles.editorToolbar}>
              <Text style={styles.editorToolbarLabel}>
                {isEditorExpanded ? `${TIPO_LABELS[editorTipo]}` : 'Área de edição'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {!isEditorExpanded && Platform.OS === 'web' && isWide && (
                  <TouchableOpacity
                    onPress={() => {
                      const next = !showLivePreview;
                      setShowLivePreview(next);
                      if (next) setPreviewHtml(webEditorContentRef.current || editorContent);
                    }}
                    style={styles.toggleVarsBtn}
                  >
                    <Ionicons name={showLivePreview ? 'eye-off-outline' : 'eye-outline'} size={15} color={showLivePreview ? Colors.gold : Colors.textSecondary} />
                    <Text style={[styles.toggleVarsText, showLivePreview && { color: Colors.gold }]}>
                      {showLivePreview ? 'Ocultar pré-visualização' : 'Pré-visualização'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isEditorExpanded && (
                  <TouchableOpacity onPress={() => setShowVarsPanel(v => !v)} style={styles.toggleVarsBtn}>
                    <Ionicons name={showVarsPanel ? 'eye-off-outline' : 'code-slash'} size={15} color={Colors.textSecondary} />
                    <Text style={styles.toggleVarsText}>{showVarsPanel ? 'Ocultar variáveis' : 'Ver variáveis'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setIsEditorExpanded(v => !v)}
                  style={styles.expandEditorBtn}
                  activeOpacity={0.75}
                >
                  <Ionicons name={isEditorExpanded ? 'contract-outline' : 'expand-outline'} size={16} color={isEditorExpanded ? Colors.gold : Colors.textSecondary} />
                  <Text style={[styles.toggleVarsText, isEditorExpanded && { color: Colors.gold }]}>
                    {isEditorExpanded ? 'Sair do ecrã inteiro' : 'Expandir'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {Platform.OS === 'web' ? (
              <Suspense fallback={<View style={{ height: 300, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: Colors.textMuted }}>A carregar editor...</Text></View>}>
                {TinyEditor && (
                  <TinyEditor
                    key={editorKey}
                    tinymceScriptSrc="https://cdn.jsdelivr.net/npm/tinymce@7.9.1/tinymce.min.js"
                    onInit={(_evt: any, editor: any) => { tinyEditorRef.current = editor; }}
                    initialValue={tinyInitContent}
                    onEditorChange={tinyOnEditorChange}
                    init={tinyInitConfig as any}
                  />
                )}
              </Suspense>
            ) : (
              <TextInput
                ref={inputRef}
                style={styles.editorTextInput}
                value={editorContent}
                onChangeText={updateEditorContent}
                multiline
                textAlignVertical="top"
                placeholder={`Escreva o conteúdo do documento aqui...\n\nUse as variáveis no painel ao lado para inserir dados automáticos.`}
                placeholderTextColor={Colors.textMuted}
              />
            )}
            <View style={styles.editorStats}>
              <Text style={styles.editorStatsText}>{stripHtmlTags(editorContent).length} caracteres</Text>
            </View>
          </View>

          {/* Live preview panel — only on web + wide layout */}
          {showLivePreview && !isEditorExpanded && Platform.OS === 'web' && isWide && (
            <View style={{
              flex: 1,
              minWidth: 320,
              marginLeft: 12,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: '#0e1530',
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}>
                <Ionicons name="eye-outline" size={14} color={Colors.gold} />
                <Text style={{ color: Colors.gold, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  Pré-visualização ao vivo
                </Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginLeft: 6 }}>
                  (variáveis aparecem como {'{{NOME_X}}'})
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
                {/* @ts-ignore — iframe é elemento web */}
                <iframe
                  title="Pré-visualização"
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                    body { font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.9; color: #111; padding: 24px 32px; margin: 0; background: #fff; }
                    img { max-width: 100%; height: auto; }
                    table { border-collapse: collapse; }
                    mark.var { background: #fff3a3; padding: 0 2px; border-radius: 2px; font-family: monospace; font-size: 0.9em; color: #7a5b00; }
                  </style></head><body>${
                    (previewHtml || webEditorContentRef.current || editorContent || '<p style="color:#888;text-align:center;margin-top:40px;">Comece a escrever no editor para ver a pré-visualização aqui.</p>')
                      .replace(/\{\{([A-Z0-9_]+)\}\}/g, '<mark class="var">{{$1}}</mark>')
                  }</body></html>`}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              </View>
            </View>
          )}

          {/* Variables panel — all groups in one continuous list */}
          {showVarsPanel && !isEditorExpanded && (
            <VarsSearchPanel
              insertVariable={insertVariable}
              isWide={isWide}
              variableGroups={variableGroups}
              schoolValueMap={schoolValueMap}
              onOpenAdmin={() => router.push('/(main)/admin' as any)}
            />
          )}
        </View>
        </ScrollView>
      </View>
    );
  }

  // ─── EMIT ─────────────────────────────────────────────────────────────────

  function EmitScreen() {
    const isPauta = isPautaType(emitTemplate);
    const isPautaFinal = isPautaFinalType(emitTemplate);
    const isMiniPautaDisciplina = isMiniPautaDisciplinaType(emitTemplate);
    const isMapa = isMapaType(emitTemplate);
    const isMapaPorCurso = isMapaPorCursoType(emitTemplate);
    const isMapaOficialMED = isMapaOficialMEDType(emitTemplate);
    const isListaTurma = isListaTurmaType(emitTemplate);
    const isCertificadoPrimario = isCertificadoPrimarioType(emitTemplate);
    const isExtratoPropina = isExtratoPropinaType(emitTemplate);

    // ── Turma-level (pauta) variables ─────────────────────────────────────
    const selectedTurmaObj = turmas.find(t => t.id === emitTurmaId);
    const alunosDaTurma = emitTurmaId
      ? alunos.filter(a => (isAnoHistorico ? true : a.ativo) && a.turmaId === emitTurmaId)
      : [];
    // Fonte primária: turma_disciplinas (atribuições reais) — fallback para disciplinas derivadas das notas
    const disciplinasDasTurmaNotas = emitTurmaId
      ? [...new Set(notas.filter(n => n.turmaId === emitTurmaId).map(n => n.disciplina))].sort()
      : [];
    const disciplinasDaTurma = emitTurmaId
      ? (disciplinasDaTurmaAPI.length > 0 ? disciplinasDaTurmaAPI : disciplinasDasTurmaNotas)
      : [];
    // ── Mini-Pauta completude stats ────────────────────────────────────────
    const miniPautaNotasBase = emitTurmaId
      ? (emitDisciplina
        ? notas.filter(n => n.turmaId === emitTurmaId && n.disciplina === emitDisciplina)
        : notas.filter(n => n.turmaId === emitTurmaId))
      : [];
    const miniPautaAlunosComNotasSet = new Set(
      miniPautaNotasBase.filter(n => (n as any).mac != null || (n as any).nf != null || (n as any).mt1 != null).map(n => n.alunoId)
    );
    const miniPautaAlunosComNotas = Math.min(miniPautaAlunosComNotasSet.size, alunosDaTurma.length);
    const miniPautaAlunosSemNotas = alunosDaTurma.length - miniPautaAlunosComNotas;
    const miniPautaCompletudePct = alunosDaTurma.length > 0 ? Math.round((miniPautaAlunosComNotas / alunosDaTurma.length) * 100) : 0;
    const miniPautaNumPaginas = emitDisciplina ? 1 : (disciplinasDaTurma.length || 1);
    const miniPautaAlunosM = alunosDaTurma.filter(a => (a as any).genero === 'M').length;
    const miniPautaAlunosF = alunosDaTurma.filter(a => (a as any).genero === 'F').length;

    // ── Student-level (document) variables ────────────────────────────────
    const selectedAluno = alunos.find(a => a.id === emitAlunoId);
    const selectedTurmaForAluno = selectedAluno ? turmas.find(t => t.id === selectedAluno.turmaId) : null;

    // ── Mapa de Aproveitamento stats for preview ──────────────────────────
    const totalAlunos = alunos.filter(a => a.ativo).length;
    const totalAlunosF = alunos.filter(a => a.ativo && a.genero === 'F').length;
    const notasResumo = notas.filter(n => n.trimestre === emitTrimestre);
    const avaliadosSet = new Set(notasResumo.map(n => n.alunoId));
    const totalAvaliados = avaliadosSet.size;
    const aprovados = [...avaliadosSet].filter(id => {
      const ns = notasResumo.filter(n => n.alunoId === id);
      if (ns.length === 0) return false;
      const valores = ns.map(n => (n.mt1 && n.mt1 > 0) ? n.mt1 : n.nf).filter(v => v > 0);
      if (valores.length === 0) return false;
      return valores.reduce((s, v) => s + v, 0) / valores.length >= 10;
    }).length;
    const aprovPct = totalAvaliados > 0 ? Math.round((aprovados / totalAvaliados) * 100) : 0;
    const sortedTurmasForMapa = [...turmas].sort((a, b) => b.anoLetivo.localeCompare(a.anoLetivo));
    const anoLetivoMapa = sortedTurmasForMapa[0]?.anoLetivo || String(new Date().getFullYear());

    // ── Validação de notas para certificados ──────────────────────────────
    const certValidationError: string | null = (() => {
      if (emitTemplate?.tipo !== 'certificado' || !emitAlunoId || !emitTemplate.classeAlvo) return null;
      const ca = emitTemplate.classeAlvo;
      let requiredClasses: string[] = [];
      if (ca === '12ª-II-CICLO' || ca === 'PEDAGOGICO-II-CICLO') {
        requiredClasses = ['10ª', '11ª', '12ª'];
      } else if (ca === '13ª-ITAQ' || ca === 'TECNICO-PROFISSIONAL') {
        requiredClasses = (config as any).temDecimaTermeira !== false ? ['10ª', '11ª', '12ª', '13ª'] : ['10ª', '11ª', '12ª'];
      } else if (ca === 'I-CICLO-GERAL' || ca === 'I-CICLO-13-DUNDO') {
        requiredClasses = ['7ª', '8ª', '9ª'];
      } else {
        return null;
      }
      const alunoNotas = notas.filter(n => n.alunoId === emitAlunoId);
      const turmaIds = [...new Set(alunoNotas.map(n => n.turmaId))];
      const classesComNotas = new Set<string>();
      for (const tid of turmaIds) {
        const t = turmas.find(tr => tr.id === tid);
        if (t && alunoNotas.filter(n => n.turmaId === tid).length > 0) {
          classesComNotas.add(t.classe);
        }
      }
      const missingClasses = requiredClasses.filter(c => !classesComNotas.has(c));
      if (missingClasses.length > 0) {
        return `Faltam notas para: ${missingClasses.join(', ')}. Para emitir este certificado o aluno precisa ter notas registadas em todas as classes do ciclo.`;
      }
      return null;
    })();

    const canPrint = (() => {
      if (isMapaPorCurso) return !!emitCursoId;
      if (isMapa) return true;
      if (isMiniPautaDisciplina) return !!emitTurmaId && !!emitDisciplina;
      if (isListaTurma) return !!emitTurmaId;
      if (isPauta) return !!emitTurmaId && !!emitMiniPautaAnoLetivo && emitMiniPautaTrimestreOK;
      if (isPautaFinal) return !!emitTurmaId && !!emitMiniPautaAnoLetivo;
      if (isCertificadoPrimario) return !!emitAlunoId;
      if (isExtratoPropina) return !!emitAlunoId;
      return !!emitAlunoId && !!emitPreview && !certValidationError;
    })();

    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('list')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.headerTitle}>Emitir Documento</Text>
              {isAnoHistorico && anoContexto ? (
                <View style={{ backgroundColor: '#7c2d12', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="time-outline" size={11} color="#fbbf24" />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fbbf24', letterSpacing: 0.4 }}>{anoContexto}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.headerSub} numberOfLines={1}>{emitTemplate?.nome}</Text>
          </View>
          {canPrint && emitTemplate?.tipo === 'pauta_final' ? (
            <View style={{ flexDirection: 'row', backgroundColor: '#1a2236', borderRadius: 8, padding: 2, marginRight: 6, borderWidth: 1, borderColor: '#2a3550' }}>
              {(['A4', 'A3'] as const).map(sz => {
                const active = emitPaperSize === sz;
                return (
                  <TouchableOpacity
                    key={sz}
                    onPress={() => setEmitPaperSize(sz)}
                    activeOpacity={0.8}
                    style={{
                      paddingVertical: 6, paddingHorizontal: 10,
                      borderRadius: 6,
                      backgroundColor: active ? Colors.gold : 'transparent',
                    }}
                  >
                    <Text style={{
                      color: active ? '#0D1F35' : Colors.textMuted,
                      fontFamily: active ? 'Inter_700Bold' : 'Inter_600SemiBold',
                      fontSize: 11, letterSpacing: 0.4,
                    }}>{sz}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {canPrint && (
            (isPauta || isPautaFinal || (isMiniPautaDisciplina && !!emitDisciplina)) && emitTurmaId
          ) ? (
            <TouchableOpacity style={[styles.printBtn, { backgroundColor: '#1a7a1a', marginRight: 6 }]} onPress={handleExportExcel} activeOpacity={0.8}>
              <Ionicons name="document-outline" size={16} color="#fff" />
              <Text style={styles.printBtnText}>Excel</Text>
            </TouchableOpacity>
          ) : null}
          {canPrint ? (
            <TouchableOpacity style={[styles.printBtn, { marginRight: 6 }]} onPress={handlePrint} activeOpacity={0.8}>
              <Ionicons name="print" size={16} color="#fff" />
              <Text style={styles.printBtnText}>Imprimir</Text>
            </TouchableOpacity>
          ) : null}
          {canPrint ? (
            <TouchableOpacity style={[styles.printBtn, { backgroundColor: '#b91c1c' }]} onPress={handleSavePdf} activeOpacity={0.8}>
              <Ionicons name="download" size={16} color="#fff" />
              <Text style={styles.printBtnText}>PDF</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.emitBody, isWide && { flexDirection: 'row' }]}>
          {/* Left: Turma selector (pauta/lista_turma) or Student selector (documents) */}
          <View style={[styles.emitLeft, isWide && { width: 300 }]}>
            {isMapa ? (
              <>
                {/* ── Trimestre selector (for all non-frequencias mapasSão) ── */}
                {emitTemplate?.tipo !== 'mapa_frequencias' && (<>
                  <Text style={styles.emitSectionTitle}>1. Seleccionar Trimestre</Text>
                  <View style={{ gap: 8, paddingTop: 4 }}>
                    {([1, 2, 3] as const).map(t => {
                      const sel = emitTrimestre === t;
                      const triLabel = t === 1 ? '1º Trimestre' : t === 2 ? '2º Trimestre' : '3º Trimestre';
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.alunoItem, sel && { borderColor: '#065f46', borderWidth: 1.5, backgroundColor: '#065f4620' }]}
                          onPress={() => setEmitTrimestre(t)}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.alunoAvatar, sel && { backgroundColor: '#065f46' }]}>
                            <Text style={styles.alunoAvatarText}>{t}T</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.alunoNome, sel && { color: '#065f46' }]}>{triLabel}</Text>
                            <Text style={styles.alunoMeta}>Ano Lectivo {anoLetivoMapa}</Text>
                          </View>
                          {sel && <Ionicons name="checkmark-circle" size={18} color="#065f46" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>)}

                {/* ── For "Oficial MED" (all levels): show only Período selector ── */}
                {isMapaOficialMED ? (<>
                  <Text style={[styles.emitSectionTitle, { marginTop: 16 }]}>2. Período</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                    {(['AUTO', 'Manhã', 'Tarde', 'Noite', 'Manhã / Tarde'] as const).map(p => {
                      const sel = emitPeriodo === p;
                      const label = p === 'AUTO' ? 'Automático' : p;
                      return (
                        <TouchableOpacity key={p} onPress={() => setEmitPeriodo(p)} activeOpacity={0.8}
                          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: sel ? '#065f46' : '#1a2236', borderWidth: 1, borderColor: sel ? '#4ade80' : '#2a3550' }}>
                          <Text style={{ color: sel ? '#fff' : Colors.textMuted, fontFamily: sel ? 'Inter_700Bold' : 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3 }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={{ backgroundColor: '#0d2618', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#065f46', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <Ionicons name="information-circle-outline" size={18} color="#065f46" />
                    <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>
                      Cobre todos os níveis: Ensino Primário, I Ciclo e II Ciclo — um mapa completo da escola.
                    </Text>
                  </View>
                </>) : isMapaPorCurso ? (<>
                  <Text style={[styles.emitSectionTitle, { marginTop: 16 }]}>2. Período</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                    {(['AUTO', 'Manhã', 'Tarde', 'Noite', 'Manhã / Tarde'] as const).map(p => {
                      const sel = emitPeriodo === p;
                      const label = p === 'AUTO' ? 'Automático' : p;
                      return (
                        <TouchableOpacity
                          key={p}
                          onPress={() => setEmitPeriodo(p)}
                          activeOpacity={0.8}
                          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: sel ? '#065f46' : '#1a2236', borderWidth: 1, borderColor: sel ? '#4ade80' : '#2a3550' }}
                        >
                          <Text style={{ color: sel ? '#fff' : Colors.textMuted, fontFamily: sel ? 'Inter_700Bold' : 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3 }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.emitSectionTitle, { marginTop: 16 }]}>3. Seleccionar Curso</Text>
                  {cursos.length === 0 ? (
                    <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', padding: 8 }}>
                      Nenhum curso registado. Configure os cursos em Configurações → Cursos.
                    </Text>
                  ) : (
                    <ScrollView style={{ flex: 1, maxHeight: 320 }} contentContainerStyle={{ gap: 6, paddingTop: 4 }}>
                      {cursos.map(c => {
                        const sel = emitCursoId === c.id;
                        const nTurmas = turmas.filter(t => (t as any).cursoId === c.id).length;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.alunoItem, sel && { borderColor: '#065f46', borderWidth: 1.5, backgroundColor: '#065f4620' }]}
                            onPress={() => setEmitCursoId(c.id)}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.alunoAvatar, { backgroundColor: sel ? '#065f46' : '#1a3a1a' }]}>
                              <Ionicons name="school-outline" size={14} color="#fff" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.alunoNome, sel && { color: '#065f46' }]} numberOfLines={2}>{c.nome}</Text>
                              <Text style={styles.alunoMeta}>{nTurmas} turma{nTurmas !== 1 ? 's' : ''}</Text>
                            </View>
                            {sel && <Ionicons name="checkmark-circle" size={18} color="#065f46" />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  {!emitCursoId && (
                    <View style={{ backgroundColor: '#1a2236', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2a3550', marginTop: 8 }}>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                        Seleccione um curso para activar a geração do mapa.
                      </Text>
                    </View>
                  )}
                </>) : (<>
                  {/* ── Standard mapa: show Ciclo + Período selectors ── */}
                  <Text style={[styles.emitSectionTitle, { marginTop: emitTemplate?.tipo === 'mapa_frequencias' ? 0 : 16 }]}>
                    {emitTemplate?.tipo === 'mapa_frequencias' ? '1.' : '2.'} Ciclo
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                    {([
                      { key: 'PRIMARIO', label: 'Primário' },
                      { key: 'I_CICLO', label: 'I Ciclo' },
                      { key: 'II_CICLO', label: 'II Ciclo' },
                    ] as const).map(({ key, label }) => {
                      const sel = emitCiclo === key;
                      return (
                        <TouchableOpacity
                          key={key}
                          onPress={() => setEmitCiclo(key)}
                          activeOpacity={0.8}
                          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: sel ? '#065f46' : '#1a2236', borderWidth: 1, borderColor: sel ? '#4ade80' : '#2a3550' }}
                        >
                          <Text style={{ color: sel ? '#fff' : Colors.textMuted, fontFamily: sel ? 'Inter_700Bold' : 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3 }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {emitTemplate?.tipo !== 'mapa_frequencias' && (<>
                    <Text style={[styles.emitSectionTitle, { marginTop: 16 }]}>3. Período</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                      {(['AUTO', 'Manhã', 'Tarde', 'Noite', 'Manhã / Tarde'] as const).map(p => {
                        const sel = emitPeriodo === p;
                        const label = p === 'AUTO' ? 'Automático' : p;
                        return (
                          <TouchableOpacity
                            key={p}
                            onPress={() => setEmitPeriodo(p)}
                            activeOpacity={0.8}
                            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: sel ? '#065f46' : '#1a2236', borderWidth: 1, borderColor: sel ? '#4ade80' : '#2a3550' }}
                          >
                            <Text style={{ color: sel ? '#fff' : Colors.textMuted, fontFamily: sel ? 'Inter_700Bold' : 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.3 }}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={{ color: Colors.textMuted, fontSize: 10.5, fontFamily: 'Inter_400Regular', paddingTop: 6 }}>
                      "Automático" usa o turno das turmas activas. Escolha um valor manual para forçar o texto do título.
                    </Text>
                  </>)}

                  <View style={{ flex: 1 }} />
                  <View style={{ backgroundColor: '#0d2618', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#065f46', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <Ionicons name="information-circle-outline" size={18} color="#065f46" />
                    <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>
                      O mapa será gerado automaticamente em formato A3 paisagem com todos os dados do sistema.
                    </Text>
                  </View>
                </>)}
              </>
            ) : (isPauta || isPautaFinal || isListaTurma || isMiniPautaDisciplina) ? (
              <>
                {/* ── Mini-Pauta / Pauta Final: fluxo em passos — Ano Académico → [Trimestre] → Turma ── */}
                {(isPauta || isPautaFinal) ? (() => {
                  const anosLetivos = [...new Set(turmas.map((t: any) => t.anoLetivo).filter(Boolean))].sort((a, b) => b.localeCompare(a)) as string[];
                  const turmasFiltradas = emitMiniPautaAnoLetivo
                    ? turmas.filter((t: any) => t.anoLetivo === emitMiniPautaAnoLetivo)
                    : [];
                  return (
                    <>
                      {/* Passo 1 — Ano Académico */}
                      <Text style={styles.emitSectionTitle}>1. Ano Académico</Text>
                      <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ gap: 6, paddingTop: 4 }}>
                        {anosLetivos.length === 0 ? (
                          <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', padding: 8 }}>
                            Nenhum ano lectivo encontrado.
                          </Text>
                        ) : anosLetivos.map(ano => {
                          const sel = emitMiniPautaAnoLetivo === ano;
                          const nTurmas = turmas.filter((t: any) => t.anoLetivo === ano).length;
                          return (
                            <TouchableOpacity
                              key={ano}
                              style={[styles.alunoItem, sel && { borderColor: '#1a7a1a', borderWidth: 1.5, backgroundColor: '#1a7a1a20' }]}
                              onPress={() => {
                                setEmitMiniPautaAnoLetivo(ano);
                                setEmitTurmaId('');
                                setEmitDisciplina('');
                                setEmitMiniPautaTrimestre(0);
                                setEmitMiniPautaTrimestreOK(false);
                              }}
                              activeOpacity={0.75}
                            >
                              <View style={[styles.alunoAvatar, { backgroundColor: sel ? '#1a7a1a' : '#374151' }]}>
                                <Ionicons name="calendar-outline" size={13} color="#fff" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.alunoNome, sel && { color: '#4ade80' }]}>{ano}</Text>
                                <Text style={styles.alunoMeta}>{nTurmas} turma{nTurmas !== 1 ? 's' : ''}</Text>
                              </View>
                              {sel && <Ionicons name="checkmark-circle" size={18} color="#1a7a1a" />}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Passo 2 — Trimestre (obrigatório para Mini-Pauta; não aplicável à Pauta Final) */}
                      {!isPautaFinal && emitMiniPautaAnoLetivo ? (
                        <View style={{ marginTop: 14 }}>
                          <Text style={styles.emitSectionTitle}>2. Trimestre</Text>
                          <View style={{ flexDirection: 'row', gap: 6, paddingTop: 4 }}>
                            {([1, 2, 3] as const).map(t => {
                              const label = `${t}º`;
                              const sel = emitMiniPautaTrimestreOK && emitMiniPautaTrimestre === t;
                              return (
                                <TouchableOpacity
                                  key={t}
                                  onPress={() => {
                                    setEmitMiniPautaTrimestre(t);
                                    setEmitMiniPautaTrimestreOK(true);
                                    setEmitTurmaId('');
                                    setEmitDisciplina('');
                                  }}
                                  activeOpacity={0.75}
                                  style={{
                                    flex: 1, paddingVertical: 10, borderRadius: 8,
                                    borderWidth: sel ? 1.5 : 1,
                                    borderColor: sel ? '#1a7a1a' : Colors.border,
                                    backgroundColor: sel ? '#1a7a1a20' : Colors.backgroundCard,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: sel ? '#4ade80' : Colors.textMuted, fontSize: 13, fontFamily: sel ? 'Inter_700Bold' : 'Inter_400Regular' }}>{label} Tri.</Text>
                                </TouchableOpacity>
                              );
                            })}
                            {/* Botão "Todos os Trimestres" */}
                            {(() => {
                              const sel = emitMiniPautaTrimestreOK && emitMiniPautaTrimestre === 0;
                              return (
                                <TouchableOpacity
                                  onPress={() => {
                                    setEmitMiniPautaTrimestre(0);
                                    setEmitMiniPautaTrimestreOK(true);
                                    setEmitTurmaId('');
                                    setEmitDisciplina('');
                                  }}
                                  activeOpacity={0.75}
                                  style={{
                                    flex: 1, paddingVertical: 10, borderRadius: 8,
                                    borderWidth: sel ? 1.5 : 1,
                                    borderColor: sel ? '#b45309' : Colors.border,
                                    backgroundColor: sel ? '#b4530920' : Colors.backgroundCard,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: sel ? '#fbbf24' : Colors.textMuted, fontSize: 11, fontFamily: sel ? 'Inter_700Bold' : 'Inter_400Regular' }}>Todos</Text>
                                </TouchableOpacity>
                              );
                            })()}
                          </View>
                        </View>
                      ) : null}

                      {/* Passo 3 — Turma (filtrada por ano, inclui turmas inactivas de anos anteriores) */}
                      {emitMiniPautaAnoLetivo && (emitMiniPautaTrimestreOK || isPautaFinal) ? (
                        <View style={{ marginTop: 14, flex: 1 }}>
                          <Text style={styles.emitSectionTitle}>{isPautaFinal ? '2.' : '3.'} Seleccionar Turma</Text>
                          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                            {turmasFiltradas.length === 0 ? (
                              <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', padding: 8 }}>
                                Nenhuma turma encontrada para este ano lectivo.
                              </Text>
                            ) : turmasFiltradas.map((turma: any) => {
                              const sel = emitTurmaId === turma.id;
                              const count = alunos.filter((a: any) => a.ativo && a.turmaId === turma.id).length;
                              const notaCount = emitMiniPautaTrimestre === 0
                                ? notas.filter((n: any) => n.turmaId === turma.id).length
                                : notas.filter((n: any) => n.turmaId === turma.id && Number(n.trimestre) === emitMiniPautaTrimestre).length;
                              const isInactive = !turma.ativo;
                              return (
                                <TouchableOpacity
                                  key={turma.id}
                                  style={[styles.alunoItem, sel && { borderColor: '#1a7a1a', borderWidth: 1.5, backgroundColor: '#1a7a1a20' }]}
                                  onPress={() => { setEmitTurmaId(turma.id); setEmitDisciplina(''); }}
                                  activeOpacity={0.75}
                                >
                                  <View style={[styles.alunoAvatar, { backgroundColor: sel ? '#1a7a1a' : (isInactive ? '#374151' : '#dc2626') }]}>
                                    <Text style={styles.alunoAvatarText}>{turma.classe.charAt(0)}</Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.alunoNome, sel && { color: '#4ade80' }]}>{turma.classe} — {turma.nome}</Text>
                                    <Text style={styles.alunoMeta}>
                                      {turma.turno} · {count} aluno{count !== 1 ? 's' : ''} · {notaCount} nota{notaCount !== 1 ? 's' : ''}
                                      {isInactive ? ' · histórico' : ''}
                                    </Text>
                                  </View>
                                  {sel && <Ionicons name="checkmark-circle" size={18} color="#1a7a1a" />}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      ) : null}

                      {/* Passo 4 — Disciplina (opcional, após turma seleccionada) */}
                      {isPauta && emitTurmaId && (
                        <View style={{ marginTop: 14 }}>
                          <Text style={styles.emitSectionTitle}>4. Disciplina (opcional)</Text>
                          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 6, paddingTop: 4 }}>
                            <TouchableOpacity
                              style={[styles.alunoItem, !emitDisciplina && { borderColor: '#1a7a1a', borderWidth: 1.5, backgroundColor: '#1a7a1a20' }]}
                              onPress={() => setEmitDisciplina('')}
                              activeOpacity={0.75}
                            >
                              <View style={[styles.alunoAvatar, { backgroundColor: !emitDisciplina ? '#1a7a1a' : '#4b5563' }]}>
                                <Ionicons name="albums-outline" size={14} color="#fff" />
                              </View>
                              <Text style={[styles.alunoNome, !emitDisciplina && { color: '#4ade80' }]} numberOfLines={1}>Todas as disciplinas</Text>
                              {!emitDisciplina && <Ionicons name="checkmark-circle" size={18} color="#1a7a1a" />}
                            </TouchableOpacity>
                            {disciplinasDaTurma.map(disc => {
                              const sel = emitDisciplina === disc;
                              return (
                                <TouchableOpacity
                                  key={disc}
                                  style={[styles.alunoItem, sel && { borderColor: '#1a7a1a', borderWidth: 1.5, backgroundColor: '#1a7a1a20' }]}
                                  onPress={() => setEmitDisciplina(disc)}
                                  activeOpacity={0.75}
                                >
                                  <View style={[styles.alunoAvatar, { backgroundColor: sel ? '#1a7a1a' : '#4b5563' }]}>
                                    <Ionicons name="book-outline" size={14} color="#fff" />
                                  </View>
                                  <Text style={[styles.alunoNome, sel && { color: '#4ade80' }]} numberOfLines={2}>{disc}</Text>
                                  {sel && <Ionicons name="checkmark-circle" size={18} color="#1a7a1a" />}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}
                    </>
                  );
                })() : (
                  /* Lista da Turma e Pauta Disciplina: comportamento original */
                  <>
                    <TurmaSearchPanel
                      turmas={turmasDoAnoSel}
                      alunos={alunosDoAnoSel}
                      selectedTurmaId={emitTurmaId}
                      onSelect={(id) => { setEmitTurmaId(id); setEmitDisciplina(''); setEmitMiniPautaTrimestre(0); }}
                      selectedTurmaObj={selectedTurmaObj}
                      isListaTurma={isListaTurma}
                      isLoading={dataLoading}
                      showAll={isAnoHistorico}
                    />
                    {isMiniPautaDisciplina && emitTurmaId && (
                      <View style={{ marginTop: 16 }}>
                        <Text style={styles.emitSectionTitle}>2. Seleccionar Disciplina</Text>
                        <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 6, paddingTop: 4 }}>
                          {disciplinasDaTurma.length === 0 ? (
                            <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', padding: 8 }}>
                              Nenhuma disciplina com notas registadas nesta turma.
                            </Text>
                          ) : disciplinasDaTurma.map(disc => {
                            const sel = emitDisciplina === disc;
                            return (
                              <TouchableOpacity
                                key={disc}
                                style={[styles.alunoItem, sel && { borderColor: '#7c3aed', borderWidth: 1.5, backgroundColor: '#7c3aed20' }]}
                                onPress={() => setEmitDisciplina(disc)}
                                activeOpacity={0.75}
                              >
                                <View style={[styles.alunoAvatar, { backgroundColor: sel ? '#7c3aed' : '#4b5563' }]}>
                                  <Ionicons name="book-outline" size={14} color="#fff" />
                                </View>
                                <Text style={[styles.alunoNome, sel && { color: '#a78bfa' }]} numberOfLines={2}>{disc}</Text>
                                {sel && <Ionicons name="checkmark-circle" size={18} color="#7c3aed" />}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </>
                )}
              </>
            ) : (
              <AlunoSearchPanel
                alunos={alunosDoAnoSel}
                turmas={turmasDoAnoSel}
                selectedAlunoId={emitAlunoId}
                onSelect={handleSelectAluno}
                selectedAluno={selectedAluno}
                selectedTurmaForAluno={selectedTurmaForAluno}
                emitAlunoHistorico={emitAlunoHistorico}
                showAll={isAnoHistorico}
              />
            )}
          </View>

          {/* Right: Mapa summary, Pauta summary, or Document preview */}
          <View style={[styles.emitRight, isWide && { flex: 1 }]}>
            {isMapa ? (
              <>
                <Text style={styles.emitSectionTitle}>{isMapaPorCurso ? '4.' : '2.'} Resumo do Mapa</Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                  <View style={{ backgroundColor: emitTemplate?.tipo === 'mapa_frequencias' ? '#0d1a3a' : '#0d2618', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: emitTemplate?.tipo === 'mapa_frequencias' ? '#1e40af' : '#065f46' }}>
                    <Text style={{ color: emitTemplate?.tipo === 'mapa_frequencias' ? '#60a5fa' : '#4ade80', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>
                      {emitTemplate?.tipo === 'mapa_frequencias' ? 'MAPA DE FREQUÊNCIAS — A3 PAISAGEM' : isMapaPorCurso ? 'MAPA DE APROVEITAMENTO — POR CURSO — A4 PAISAGEM' : isMapaOficialMED ? 'MAPA OFICIAL MED — TODOS OS NÍVEIS — A3 PAISAGEM' : 'MAPA DE APROVEITAMENTO — A3 PAISAGEM'}
                    </Text>
                    {emitTemplate?.tipo !== 'mapa_frequencias' && (
                    <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>
                      {`${emitTrimestre === 1 ? '1º' : emitTrimestre === 2 ? '2º' : '3º'} Trimestre`}
                    </Text>
                    )}
                    {isMapaPorCurso && emitCursoId ? (
                      <Text style={{ color: '#4ade80', fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 2 }}>
                        {cursos.find(c => c.id === emitCursoId)?.nome || ''}
                      </Text>
                    ) : null}
                    <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      Ano Lectivo {anoLetivoMapa}
                      {isMapaPorCurso
                        ? ` — ${emitCursoId ? `${turmas.filter(t => (t as any).cursoId === emitCursoId).length} turma(s)` : 'Nenhum curso seleccionado'}`
                        : ` · ${emitCiclo === 'PRIMARIO' ? 'Primário (1ª–6ª)' : emitCiclo === 'I_CICLO' ? 'I Ciclo (7ª–9ª)' : 'II Ciclo (10ª–13ª)'}`}
                      {emitTemplate?.tipo !== 'mapa_frequencias' ? ` — ${emitPeriodo === 'AUTO' ? 'Período Automático' : emitPeriodo}` : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                      <Ionicons name="people-outline" size={22} color={Colors.info} />
                      <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{totalAlunos}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Matriculados</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{totalAlunosF}F</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                      <Ionicons name="checkmark-circle-outline" size={22} color={Colors.success} />
                      <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{totalAvaliados}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Avaliados</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                      <Ionicons name="trending-up-outline" size={22} color="#4ade80" />
                      <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{aprovados}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>C/Aproveitamento</Text>
                      <Text style={{ color: '#4ade80', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{aprovPct}%</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                      <Ionicons name="trending-down-outline" size={22} color={Colors.danger} />
                      <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{totalAvaliados - aprovados}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>S/Aproveitamento</Text>
                      <Text style={{ color: Colors.danger, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{100 - aprovPct}%</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                    <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>ESTRUTURA DO MAPA</Text>
                    {['Ensino Primário: Iniciação, 1ª–6ª Classe', '1º Ciclo: 7ª, 8ª, 9ª Classe', '2º Ciclo: 10ª, 11ª, 12ª Classe'].map(l => (
                      <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="layers-outline" size={14} color={Colors.success} />
                        <Text style={{ color: Colors.text, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{l}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ backgroundColor: '#0d2618', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#065f46', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="print-outline" size={18} color="#4ade80" />
                    <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>
                      Clique em Imprimir para gerar o Mapa de Aproveitamento em formato A3 paisagem, pronto para submissão à Repartição de Educação.
                    </Text>
                  </View>
                </ScrollView>
              </>
            ) : isListaTurma ? (
              <>
                <Text style={styles.emitSectionTitle}>2. Resumo da Lista</Text>
                {!selectedTurmaObj ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>Seleccione uma turma para gerar a Lista da Turma</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                    <View style={{ backgroundColor: '#0c2340', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#0369a1' }}>
                      <Text style={{ color: '#0369a1', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>LISTA DA TURMA — FORMATO A4</Text>
                      <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>{selectedTurmaObj.classe} — {selectedTurmaObj.nome}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{selectedTurmaObj.nivel} · Ano Lectivo {selectedTurmaObj.anoLetivo} · {selectedTurmaObj.turno}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="people-outline" size={22} color={Colors.info} />
                        <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{alunosDaTurma.length}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Total Alunos</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="man-outline" size={22} color={Colors.info} />
                        <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{alunosDaTurma.filter(a => a.genero === 'M').length}M / {alunosDaTurma.filter(a => a.genero === 'F').length}F</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Género</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>CONTEÚDO DO DOCUMENTO</Text>
                      {['Nº de ordem de cada aluno', 'Nome completo do aluno', 'Idade calculada automaticamente', 'Sexo (M/F)', 'Data de nascimento', 'Contacto do encarregado', 'Mapa Estatístico de género e idades'].map(l => (
                        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="checkmark-circle-outline" size={14} color='#0369a1' />
                          <Text style={{ color: Colors.text, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{l}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ backgroundColor: '#0c2340', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#0369a1', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="print-outline" size={18} color='#0369a1' />
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>
                        A lista será gerada em formato A4 retrato com alternância de cores e Mapa Estatístico no final.
                      </Text>
                    </View>
                  </ScrollView>
                )}
              </>
            ) : isCertificadoPrimario ? (
              <>
                <Text style={styles.emitSectionTitle}>2. Resumo do Certificado</Text>
                {!selectedAluno ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="ribbon-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>Seleccione um aluno para gerar o Certificado do Ensino Primário</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                    <View style={{ backgroundColor: '#2d1b69', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#7c3aed' }}>
                      <Text style={{ color: '#7c3aed', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>CERTIFICADO DO ENSINO PRIMÁRIO — A4</Text>
                      <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                        {selectedTurmaForAluno?.classe || 'Sem turma'} · Nº {selectedAluno.numeroMatricula}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="person-outline" size={22} color='#7c3aed' />
                        <Text style={{ color: Colors.text, fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{selectedAluno.genero === 'F' ? 'Feminino' : 'Masculino'}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Género</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="location-outline" size={22} color='#7c3aed' />
                        <Text style={{ color: Colors.text, fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{selectedAluno.provincia}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{selectedAluno.municipio}</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>CICLOS DE APRENDIZAGEM</Text>
                      {['2ª Classe (I Ciclo)', '4ª Classe (II Ciclo)', '6ª Classe (III Ciclo)'].map((ciclo, idx) => {
                        const classeLabel = ['2ª Classe', '4ª Classe', '6ª Classe'][idx];
                        const temNotas = notas.some(n => n.alunoId === emitAlunoId && turmas.find(t => t.id === n.turmaId)?.classe === classeLabel);
                        return (
                          <View key={ciclo} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name={temNotas ? 'checkmark-circle-outline' : 'ellipse-outline'} size={14} color={temNotas ? '#7c3aed' : Colors.textMuted} />
                            <Text style={{ color: temNotas ? Colors.text : Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{ciclo}</Text>
                            <Text style={{ color: temNotas ? '#7c3aed' : Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginLeft: 'auto' }}>{temNotas ? 'Com dados' : 'Sem dados'}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>CAMPOS AUTOMÁTICOS DA BD</Text>
                      {['Nome completo do aluno', 'Data de nascimento', 'Género (filho/filha)', 'Município e Província', 'Classificações por ciclo', 'Médias finais e por extenso', 'Média Geral Final'].map(l => (
                        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="checkmark-circle-outline" size={14} color='#7c3aed' />
                          <Text style={{ color: Colors.text, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{l}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ backgroundColor: '#2d1b69', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#7c3aed', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="information-circle-outline" size={18} color='#7c3aed' />
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 }}>
                        Campos como pai, mãe, BI e Decreto Executivo aparecem em branco para preenchimento manual após impressão.
                      </Text>
                    </View>
                  </ScrollView>
                )}
              </>
            ) : isExtratoPropina ? (
              <>
                <Text style={styles.emitSectionTitle}>2. Configurar Extracto</Text>
                {!selectedAluno ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="card-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>Seleccione um aluno para configurar o Extracto de Propinas</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {/* Student header */}
                    <View style={{ backgroundColor: '#0f1f3d', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#3b82f6' }}>
                      <Text style={{ color: '#3b82f6', fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>EXTRACTO DE PROPINAS — FORMATO A4</Text>
                      <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 2 }}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                        {selectedTurmaForAluno?.classe || 'Sem turma'} · Nº {selectedAluno.numeroMatricula}
                      </Text>
                    </View>

                    {/* Date filter */}
                    <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>PERÍODO DO EXTRACTO (OPCIONAL)</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Data início</Text>
                          <DateInput
                            style={{ backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 }}
                            value={emitExtratoDataInicio}
                            onChangeText={setEmitExtratoDataInicio}
                            placeholderTextColor={Colors.textMuted}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Data fim</Text>
                          <DateInput
                            style={{ backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 }}
                            value={emitExtratoDataFim}
                            onChangeText={setEmitExtratoDataFim}
                            placeholderTextColor={Colors.textMuted}
                          />
                        </View>
                      </View>
                      <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
                        Sem filtro de período serão incluídos todos os registos do aluno.
                      </Text>
                    </View>

                    {/* What's included */}
                    <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>O EXTRACTO INCLUI</Text>
                      {[
                        'Data e valor de cada transacção',
                        'Método de pagamento',
                        'Estado de cada propina (pago / pendente / cancelado)',
                        'Totais calculados automaticamente',
                        'QR Code de verificação',
                        'Código de barras (nº de matrícula)',
                        'Assinaturas de Director e Secretaria',
                      ].map(l => (
                        <View key={l} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                          <Ionicons name="checkmark-circle-outline" size={14} color='#3b82f6' style={{ marginTop: 2 }} />
                          <Text style={{ color: Colors.text, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>{l}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Info note */}
                    <View style={{ backgroundColor: '#0f1f3d', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#3b82f6', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Ionicons name="print-outline" size={18} color='#3b82f6' style={{ marginTop: 1 }} />
                      <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                        Os dados financeiros são carregados do sistema no momento da geração. O documento usa o modelo definido no editor para possíveis personalização.
                      </Text>
                    </View>
                  </ScrollView>
                )}
              </>
            ) : isMiniPautaDisciplina ? (
              <>
                <Text style={styles.emitSectionTitle}>3. Resumo da Mini-Pauta por Disciplina</Text>
                {!selectedTurmaObj ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="list-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>Seleccione uma turma e depois uma disciplina</Text>
                  </View>
                ) : !emitDisciplina ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>Seleccione uma disciplina no painel esquerdo</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                    <View style={{ backgroundColor: '#1a0d2e', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#7c3aed' }}>
                      <Text style={{ color: '#a78bfa', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>MINI-PAUTA POR DISCIPLINA — A4 PAISAGEM</Text>
                      <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 2 }}>{emitDisciplina}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                        {selectedTurmaObj.classe} — {selectedTurmaObj.nome} · Ano Lectivo {selectedTurmaObj.anoLetivo} · Turno {selectedTurmaObj.turno}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="people-outline" size={22} color={Colors.info} />
                        <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{alunosDaTurma.length}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Alunos</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="bar-chart-outline" size={22} color='#7c3aed' />
                        <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>
                          {notas.filter(n => n.turmaId === emitTurmaId && n.disciplina === emitDisciplina).length}
                        </Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Registos</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#1a0d2e', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#7c3aed', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="information-circle-outline" size={18} color='#a78bfa' />
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>
                        Uma página com todos os alunos da turma e colunas MAC, NPP, NPT e MT por trimestre, mais MFD. Formato Angola A4 paisagem.
                      </Text>
                    </View>
                  </ScrollView>
                )}
              </>
            ) : (isPauta || isPautaFinal) ? (
              <>
                <Text style={styles.emitSectionTitle}>
                  {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') ? '2. Resumo da Mini-Pauta' : '2. Resumo da Pauta Final'}
                </Text>
                {!selectedTurmaObj ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="list-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>
                      {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta')
                        ? 'Seleccione uma turma para gerar a Mini-Pauta'
                        : 'Seleccione uma turma para gerar a Pauta Final'}
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') ? (
                      <View style={{ backgroundColor: '#0d2618', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1a7a1a' }}>
                        <Text style={{ color: '#4ade80', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>MINI-PAUTA — A4 PAISAGEM</Text>
                        <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>{selectedTurmaObj.classe} — {selectedTurmaObj.nome}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{selectedTurmaObj.nivel} · Ano Lectivo {selectedTurmaObj.anoLetivo} · Turno {selectedTurmaObj.turno}</Text>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: '#1e2a3a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#dc2626' }}>
                        <Text style={{ color: '#dc2626', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>PAUTA FINAL — A4 PAISAGEM</Text>
                        <Text style={{ color: Colors.text, fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>{selectedTurmaObj.classe} — {selectedTurmaObj.nome}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{selectedTurmaObj.nivel} · Ano Lectivo {selectedTurmaObj.anoLetivo} · Turno {selectedTurmaObj.turno}</Text>
                      </View>
                    )}
                    {/* Row 1 — Alunos + Disciplinas */}
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="people-outline" size={22} color={Colors.info} />
                        <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{alunosDaTurma.length}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Alunos</Text>
                        {(miniPautaAlunosM > 0 || miniPautaAlunosF > 0) && (
                          <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                            {miniPautaAlunosM}M · {miniPautaAlunosF}F
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Ionicons name="book-outline" size={22} color={Colors.success} />
                        <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{disciplinasDaTurma.length}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Disciplinas</Text>
                      </View>
                    </View>

                    {/* Row 2 — Páginas + Completude de Notas (Mini-Pauta only) */}
                    {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') && alunosDaTurma.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                          <Ionicons name="document-text-outline" size={22} color={Colors.gold} />
                          <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{miniPautaNumPaginas}</Text>
                          <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                            {miniPautaNumPaginas === 1 ? 'Página' : 'Páginas'}
                          </Text>
                        </View>
                        <View style={{
                          flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1,
                          borderColor: miniPautaCompletudePct >= 80 ? '#1a7a1a' : miniPautaCompletudePct >= 40 ? Colors.gold + '80' : Colors.danger + '80',
                          alignItems: 'center',
                        }}>
                          <Ionicons
                            name={miniPautaCompletudePct >= 80 ? 'checkmark-circle-outline' : miniPautaCompletudePct >= 40 ? 'time-outline' : 'alert-circle-outline'}
                            size={22}
                            color={miniPautaCompletudePct >= 80 ? '#4ade80' : miniPautaCompletudePct >= 40 ? Colors.gold : Colors.danger}
                          />
                          <Text style={{ color: Colors.text, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{miniPautaCompletudePct}%</Text>
                          <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>Preenchido</Text>
                          <Text style={{
                            color: miniPautaCompletudePct >= 80 ? '#4ade80' : miniPautaCompletudePct >= 40 ? Colors.gold : Colors.danger,
                            fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 2,
                          }}>
                            {miniPautaAlunosComNotas}/{alunosDaTurma.length} alunos
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Aviso: alunos sem notas (Mini-Pauta only) */}
                    {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') && miniPautaAlunosSemNotas > 0 && emitDisciplina && (
                      <View style={{ backgroundColor: Colors.danger + '12', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.danger + '50', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <Ionicons name="warning-outline" size={18} color={Colors.danger} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: Colors.danger, fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 2 }}>
                            {miniPautaAlunosSemNotas} aluno{miniPautaAlunosSemNotas > 1 ? 's' : ''} sem notas
                          </Text>
                          <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 }}>
                            A pauta será impressa com os espaços em branco para preenchimento manual.
                          </Text>
                        </View>
                      </View>
                    )}

                    {disciplinasDaTurma.length > 0 && (emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') && (
                      <>
                        {/* Trimestre seleccionado */}
                        {emitMiniPautaTrimestre > 0 && (
                          <View style={{ backgroundColor: '#0d1a0d', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#1a7a1a', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="calendar-outline" size={16} color="#4ade80" />
                            <Text style={{ color: '#4ade80', fontSize: 13, fontFamily: 'Inter_700Bold' }}>
                              {emitMiniPautaTrimestre === 1 ? '1º' : emitMiniPautaTrimestre === 2 ? '2º' : '3º'} Trimestre
                            </Text>
                            <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 }}>— tabela simplificada</Text>
                          </View>
                        )}
                        <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: emitDisciplina ? '#1a7a1a' : Colors.border, gap: 6 }}>
                          <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>
                            {emitDisciplina ? 'DISCIPLINA SELECCIONADA' : 'UMA PÁGINA POR DISCIPLINA'}
                          </Text>
                          {emitDisciplina ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
                              <Text style={{ color: '#4ade80', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{emitDisciplina}</Text>
                            </View>
                          ) : disciplinasDaTurma.map(d => (
                            <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="document-text-outline" size={14} color="#4ade80" />
                              <Text style={{ color: Colors.text, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{d}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}
                    {disciplinasDaTurma.length > 0 && emitTemplate?.tipo === 'pauta_final' && (
                      <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4 }}>
                          DISCIPLINAS INCLUÍDAS
                        </Text>
                        {disciplinasDaTurma.map(d => (
                          <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="document-text-outline" size={14} color={Colors.success} />
                            <Text style={{ color: Colors.text, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{d}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={{
                      backgroundColor: (emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') ? '#0d2618' : '#1a2e1a',
                      borderRadius: 12, padding: 14, borderWidth: 1,
                      borderColor: (emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') ? '#1a7a1a' : Colors.success,
                      flexDirection: 'row', alignItems: 'center', gap: 10
                    }}>
                      <Ionicons name="information-circle-outline" size={18} color={(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') ? '#4ade80' : Colors.success} />
                      <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 }}>
                        {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta')
                          ? disciplinasDaTurma.length === 0
                            ? 'Esta turma não tem notas lançadas. Será gerada uma página em branco com os nomes dos alunos para preenchimento manual pelo professor.'
                            : (() => {
                                const triStr = emitMiniPautaTrimestre > 0 ? ` do ${emitMiniPautaTrimestre}º Trimestre` : '';
                                const colStr = emitMiniPautaTrimestre > 0 ? `MAC, NPP, NPT, MT${emitMiniPautaTrimestre}` : 'MAC, NPP, NPT, MT1/2/3 e MFD';
                                if (emitDisciplina) return `Será gerada 1 página para "${emitDisciplina}"${triStr} com colunas ${colStr}. Formato Angola A4 paisagem.`;
                                return `Serão geradas ${disciplinasDaTurma.length} página(s)${triStr} — uma por disciplina — com colunas ${colStr}. Formato Angola A4 paisagem.`;
                              })()
                          : 'A pauta será gerada em formato A4 paisagem com colunas MT1, MT2, MT3 e MFD por disciplina. Clique em PDF para imprimir ou Excel para exportar.'}
                      </Text>
                    </View>

                    {/* Botão Pré-visualizar HTML */}
                    {(emitTemplate?.tipo === 'pauta' || emitTemplate?.tipo === 'mini_pauta') && Platform.OS === 'web' && (
                      <TouchableOpacity
                        onPress={handlePreviewHtml}
                        activeOpacity={0.8}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          backgroundColor: '#0f2a4a', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
                          borderWidth: 1, borderColor: '#2563eb',
                        }}
                      >
                        <Ionicons name="eye-outline" size={17} color="#60a5fa" />
                        <Text style={{ color: '#60a5fa', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                          Pré-visualizar HTML
                        </Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                          (abre em nova aba, sem impressão)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                )}
              </>
            ) : (
              <>
                <Text style={styles.emitSectionTitle}>2. Pré-visualização do Documento</Text>
                {/* Warning: template requires notas but aluno has none */}
                {templateRequiresNotas(emitTemplate) && emitAlunoId && notas.filter(n => n.alunoId === emitAlunoId).length === 0 && (
                  <View style={{ margin: 12, backgroundColor: Colors.danger + '18', borderRadius: 12, borderWidth: 1.5, borderColor: Colors.danger + '60', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name="warning-outline" size={20} color={Colors.danger} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger, marginBottom: 4 }}>Sem Notas Registadas</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                        Este aluno não tem notas registadas em nenhum trimestre. Este tipo de documento só pode ser emitido após o aluno ter concluído pelo menos um trimestre com notas lançadas.
                      </Text>
                    </View>
                  </View>
                )}
                {/* Validação de notas para certificados */}
                {certValidationError && emitAlunoId && (
                  <View style={{ margin: 12, marginTop: 4, backgroundColor: '#7f1d1d18', borderRadius: 12, borderWidth: 1.5, borderColor: '#dc262660', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name="alert-circle-outline" size={20} color="#dc2626" style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#dc2626', marginBottom: 4 }}>Notas Incompletas — Certificado Bloqueado</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                        {certValidationError}
                      </Text>
                    </View>
                  </View>
                )}
                {/* Botão Pré-visualizar para certificados e documentos */}
                {emitAlunoId && (emitPreview || previewCertHtml) && Platform.OS === 'web' && (
                  <TouchableOpacity
                    onPress={handlePreviewHtml}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: '#0f2a4a', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
                      borderWidth: 1, borderColor: '#2563eb', marginHorizontal: 12, marginBottom: 8,
                    }}
                  >
                    <Ionicons name="eye-outline" size={17} color="#60a5fa" />
                    <Text style={{ color: '#60a5fa', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                      Pré-visualizar Documento
                    </Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                      (abre em nova aba)
                    </Text>
                  </TouchableOpacity>
                )}
                {!emitPreview && !previewCertHtml ? (
                  <View style={styles.previewEmpty}>
                    <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
                    <Text style={styles.previewEmptyText}>Seleccione um aluno para pré-visualizar o documento com os dados preenchidos</Text>
                  </View>
                ) : emitTemplate?.tipo === 'certificado' && Platform.OS === 'web' && previewCertHtml ? (
                  /* Certificados: mostrar iframe com HTML completo renderizado */
                  <View style={{ flex: 1, minHeight: 500, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                    {React.createElement('iframe', {
                      srcDoc: previewCertHtml,
                      style: { width: '100%', height: '600px', border: 'none', background: '#fff' },
                      title: 'Pré-visualização do Certificado',
                    })}
                  </View>
                ) : (
                  <View style={styles.previewOuter}>
                    {emitTemplate?.marcaAguaBase64 ? (
                      <View style={[styles.watermarkContainer, { pointerEvents: 'none' } as any]}>
                        <Image source={{ uri: emitTemplate.marcaAguaBase64 }} style={styles.watermarkImage} resizeMode="contain" />
                      </View>
                    ) : (
                      <View style={[styles.watermarkContainer, { pointerEvents: 'none' } as any]}>
                        <Text style={styles.watermarkText}>{config.nomeEscola || 'QUETA'}</Text>
                      </View>
                    )}
                    <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
                      {Platform.OS === 'web' ? (
                        React.createElement('div', {
                          dangerouslySetInnerHTML: { __html: emitPreview },
                          style: { fontFamily: "'Times New Roman', serif", lineHeight: '1.8', fontSize: '12pt', color: '#000', padding: '8px 16px' }
                        })
                      ) : (
                        <Text style={styles.docBody}>{emitPreview}</Text>
                      )}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    );
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.primaryDark,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10,
  },
  newBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10,
  },
  printBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // List
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  emptyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    backgroundColor: Colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
  },
  emptyBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Card wrapper (swipe container)
  // overflow:'hidden' is only needed on native to clip the swipe-reveal buttons.
  // On web the swipe is disabled, so we must use 'visible' to allow the dropdown menu to show outside the card bounds.
  cardWrapper: {
    overflow: Platform.OS === 'web' ? 'visible' : 'hidden', borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  swipeReveal: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row',
  },
  swipeBtn: {
    alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingHorizontal: 14, minWidth: 68,
  },
  swipeBtnText: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#fff', textAlign: 'center',
  },
  // Card
  card: {
    backgroundColor: Colors.backgroundCard, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tipoBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  tipoText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  menuBtn: { padding: 10, margin: -6 },
  cardNome: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  cardPreview: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 },
  cardFooter: { flexDirection: 'column', gap: 8, marginTop: 6 },
  cardDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  cardActionsScroll: { flexGrow: 0 },
  cardActions: { flexDirection: 'row', gap: 6 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: 8 },
  cardActionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dropMenu: {
    position: 'absolute', top: 48, right: 8, zIndex: 99,
    backgroundColor: Colors.backgroundCard, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8, minWidth: 200, padding: 4,
  },
  dropItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  dropItemText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  dropDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },

  // Editor
  editorHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.primaryDark,
  },
  editorNomeInput: {
    flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text,
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  saveBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  tipoGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tipoChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.backgroundCard,
  },
  tipoChipDot: { width: 5, height: 5, borderRadius: 3 },
  tipoChipText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  /* ── Novo selector de tipo (web: <select> + optgroup / native: modal) ── */
  tipoSelectWrap: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tipoSelectLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  tipoSelectDot:   { width: 8, height: 8, borderRadius: 4 },
  tipoSelectLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.9 },
  tipoSelectInner: { position: 'relative' },
  tipoSelectChevron: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', zIndex: 0 },

  /* Native trigger */
  tipoSelectTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 42, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.borderLight,
  },
  tipoSelectTriggerTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  /* Modal overlay + sheet */
  tipoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  tipoModalSheet: {
    backgroundColor: Colors.backgroundElevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: Colors.borderLight,
    maxHeight: '82%',
  },
  tipoModalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },
  tipoModalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tipoModalTitle:    { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  tipoModalCount:    { backgroundColor: Colors.gold + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1, marginLeft: 2 },
  tipoModalCountTxt: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold },
  tipoModalClose:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },

  tipoModalSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  tipoModalSearchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, padding: 0 },

  tipoModalGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  tipoModalGroupTxt:  { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 1, textTransform: 'uppercase' },
  tipoModalGroupLine: { flex: 1, height: 1, backgroundColor: Colors.gold + '30' },

  tipoModalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '88',
  },
  tipoModalDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  tipoModalOptTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  editorBody: { flex: 1, flexDirection: 'column' },
  editorTextWrap: { flex: 1, display: 'flex', flexDirection: 'column' },
  editorToolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  editorToolbarLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  toggleVarsBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleVarsText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  expandEditorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
  },
  editorTextInput: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 14, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Inter_400Regular',
    color: Colors.text, backgroundColor: Colors.background,
    lineHeight: 24,
  },
  editorStats: {
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: Colors.backgroundCard, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  editorStatsText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // Variables panel
  varsPanel: {
    backgroundColor: Colors.primaryDark, borderTopWidth: 1, borderTopColor: Colors.border,
    borderLeftWidth: 1, borderLeftColor: Colors.border,
    maxHeight: 480,
  },
  varsPanelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  varsPanelTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.8 },
  varsPanelHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, paddingHorizontal: 14, paddingBottom: 6 },
  varSearchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 10, marginBottom: 6,
    backgroundColor: Colors.background,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 6,
    gap: 4,
  },
  varSearchInput: {
    flex: 1, fontSize: 12, color: Colors.text,
    fontFamily: 'Inter_400Regular',
    padding: 0, margin: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  varGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderLeftWidth: 3, paddingLeft: 8,
    marginHorizontal: 4, marginTop: 10, marginBottom: 4,
  },
  varGroupHeaderText: { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.9, flex: 0 },
  varGroupHeaderLine: { flex: 1, height: 1, marginLeft: 4 },
  varsList: { flex: 1 },
  varItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '80',
    gap: 8, backgroundColor: Colors.backgroundCard,
  },
  varItemInner: { flex: 1, gap: 2 },
  varTagBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    marginBottom: 2,
  },
  varTag: { fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Inter_600SemiBold', letterSpacing: 0.3 },
  varDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  varExemplo: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' },
  varInsertBtn: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },

  // Emit
  emitBody: { flex: 1, flexDirection: 'column' },
  emitLeft: {
    borderRightWidth: 1, borderRightColor: Colors.border,
    backgroundColor: Colors.primaryDark, padding: 14,
    maxHeight: '100%',
  },
  emitRight: { flex: 1, padding: 14 },
  emitSectionTitle: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text },
  alunoItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 10, marginBottom: 4,
    borderWidth: 1, borderColor: 'transparent',
  },
  alunoItemSel: { backgroundColor: Colors.info + '15', borderColor: Colors.info + '50' },
  alunoAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  alunoAvatarText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  alunoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  noAlunos: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', padding: 20 },
  selectedInfo: {
    marginTop: 10, padding: 12, backgroundColor: Colors.info + '15',
    borderRadius: 10, borderWidth: 1, borderColor: Colors.info + '40',
  },
  selectedInfoTitle: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase' },
  selectedInfoName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 2 },
  selectedInfoMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },

  // Preview
  previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  previewEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', maxWidth: 300 },
  previewOuter: { flex: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  watermarkContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 0,
    transform: [{ rotate: '-40deg' }],
  },
  watermarkText: {
    fontSize: Platform.OS === 'web' ? 52 : 36,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(0,0,0,0.04)',
    letterSpacing: 6,
    textAlign: 'center',
  },
  watermarkImage: {
    width: '80%' as any,
    height: 200,
    opacity: 0.06,
  },
  previewScroll: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  docHeader: { alignItems: 'center', marginBottom: 24 },
  docInsignia: { width: 72, height: 72, marginBottom: 8 },
  docInsigniaPlaceholder: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#e8e8e8', alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, borderWidth: 2, borderColor: '#ccc',
  },
  docInsigniaLetter: { fontSize: 30, fontFamily: 'Inter_700Bold', color: '#555' },
  docRepublika: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  docEscola: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1a1a1a', textAlign: 'center' },
  docTipo: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#444', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1.5 },
  docDivider: { height: 2, backgroundColor: '#1a1a1a', width: 60, marginTop: 10, marginBottom: 2 },
  docBody: { fontSize: 14, fontFamily: Platform.OS === 'web' ? 'Georgia, serif' : 'Inter_400Regular', color: '#1a1a1a', lineHeight: 26, textAlign: 'justify' },
  docSignature: { marginTop: 48, alignItems: 'center', gap: 4 },
  docSignatureDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#444' },
  docSignatureLine: { width: 200, height: 1, backgroundColor: '#333', marginTop: 40, marginBottom: 6 },
  docSignatureName: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1a1a1a' },
  docSignatureRole: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#444' },

  // Appearance section
  appearSection: {
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  appearHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  appearHeaderTitle: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold',
    color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  appearBody: {
    paddingHorizontal: 16, paddingBottom: 14,
  },
  appearItem: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 8,
  },
  appearItemInfo: { flex: 1 },
  appearItemLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  appearItemHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  appearItemControls: { alignItems: 'flex-end', gap: 4 },
  appearDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    borderStyle: 'dashed',
  },
  uploadBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.gold },
  changeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  changeBtnText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  imagePreviewWrap: { alignItems: 'center', gap: 4 },
  imagePreview: {
    width: 64, height: 64, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  imagePreviewMarcaWrap: {
    width: 64, height: 50, borderRadius: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  imagePreviewMarca: { width: '100%' as any, height: '100%' as any, opacity: 0.4 },
  imagePreviewMarcaOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  imageRemoveBtn: { position: 'absolute', top: -6, right: -6 },

  // Toast
  toastContainer: {
    position: 'absolute', top: 80, left: 16, right: 16, zIndex: 9999,
    alignItems: 'center',
  },
  toastInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 10,
    maxWidth: 500, width: '100%' as any,
  },
  toastText: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18,
  },
});

const listStyles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },

  // ── Pagination ──
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: Colors.border },
  pageBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  pageBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  pageBtnTextActive: { color: Colors.dark },
  pageEllipsis: { fontSize: 11, color: Colors.textMuted, paddingHorizontal: 2 },
  pageLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginLeft: 8 },
});
