import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Modal } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { webAlert } from '@/utils/webAlert';
import { consultarNIF } from '@/lib/nifLookup';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MEDConfig {
  codigoMED: string;
  nifEscola: string;
  nomeEscola: string;
  provinciaEscola: string;
  municipioEscola: string;
  tipoEnsino: string;
  modalidade: string;
  directorGeral: string;
  directorPedagogico: string;
  directorProvincialEducacao: string;
}

interface MEDStats {
  alunos: { total: number; masculino: number; feminino: number };
  professores: { total: number; ativos: number };
  turmas: number;
  taxaAprovacao: number;
}

type ExportType = 'matriculas' | 'professores' | 'resultados' | 'frequencias' | 'consolidado';
type ExportFormat = 'csv' | 'xml' | 'json' | 'xlsx';

interface AuditLog {
  id: string;
  userEmail: string;
  userRole: string;
  acao: string;
  descricao: string;
  ipAddress: string;
  createdAt: string;
}

const ALLOWED_ROLES = ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria'];
const TIPO_ENSINO_OPTIONS = ['Primário', 'Secundário', 'Técnico-Profissional', 'Superior'];
const MODALIDADE_OPTIONS = ['Presencial', 'Semi-presencial', 'EaD'];

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {sub && <Text style={styles.statSub}>{sub}</Text>}
      </View>
    </View>
  );
}

function SectionHeader({
  title, icon, collapsed, onToggle, count,
}: {
  title: string; icon: string; collapsed?: boolean; onToggle?: () => void; count?: number;
}) {
  const hasToggle = typeof onToggle === 'function';
  const Wrapper = hasToggle ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.sectionHeader, hasToggle && { borderRadius: 9, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 }]}
      onPress={hasToggle ? onToggle : undefined}
      activeOpacity={0.75}
    >
      <View style={[styles.sectionIconWrap, { backgroundColor: Colors.gold + '18' }]}>
        <Ionicons name={icon as any} size={14} color={Colors.gold} />
      </View>
      <Text style={[styles.sectionTitle, hasToggle && { fontSize: 12, color: Colors.text }]} numberOfLines={1}>{title}</Text>
      {count !== undefined && (
        <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold }}>{count}</Text>
        </View>
      )}
      {hasToggle && (
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={Colors.textMuted} />
      )}
    </Wrapper>
  );
}

function Field({ label, value, onChange, placeholder, editable = true, onSubmitEditing, error }: {
  label: string; value: string; onChange?: (v: string) => void; placeholder?: string;
  editable?: boolean; onSubmitEditing?: () => void; error?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, error && { color: '#E74C3C' }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, !editable && styles.fieldInputDisabled, error && { borderColor: '#E74C3C', borderWidth: 1.5 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? label}
        placeholderTextColor={Colors.textMuted}
        editable={editable}
        returnKeyType={onSubmitEditing ? 'done' : undefined}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

function OptionPicker({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionPill, value === opt && styles.optionPillActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.optionPillText, value === opt && styles.optionPillTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Export Card (implementado) ───────────────────────────────────────────────

function ExportCard({
  title, description, icon, color, type, anoLetivo, onExported, expandSignal,
}: {
  title: string; description: string; icon: string; color: string;
  type: ExportType; anoLetivo: string; onExported: () => void;
  expandSignal?: { v: number; expanded: boolean };
}) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [trimestre, setTrimestre] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (expandSignal && expandSignal.v > 0) setCollapsed(!expandSignal.expanded);
  }, [expandSignal?.v]);

  const doExport = useCallback(async () => {
    if (Platform.OS !== 'web') {
      webAlert('Exportação', 'A exportação directa está disponível apenas na versão Web.');
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken() ?? '';
      if (format === 'xlsx') {
        const xlsxParams = new URLSearchParams();
        if (anoLetivo) xlsxParams.set('anoLetivo', anoLetivo);
        const url = `/api/med/export/xlsx/${type}?${xlsxParams}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) { const err = await resp.json(); throw new Error(err.error ?? 'Erro na exportação'); }
        const blob = await resp.blob();
        const cd = resp.headers.get('Content-Disposition') ?? '';
        const match = cd.match(/filename="(.+?)"/);
        const fname = match?.[1] ?? `MED_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        a.click();
      } else {
        const params = new URLSearchParams({ formato: format });
        if (anoLetivo) params.set('anoLetivo', anoLetivo);
        if (type === 'resultados' && trimestre) params.set('trimestre', trimestre);
        const url = `/api/med/export/${type}?${params}`;
        if (format === 'json') {
          const data = await api.get<unknown>(url);
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `MED_${type}_${anoLetivo || 'todos'}_${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
        } else {
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!resp.ok) { const err = await resp.json(); throw new Error(err.error ?? 'Erro na exportação'); }
          const blob = await resp.blob();
          const cd = resp.headers.get('Content-Disposition') ?? '';
          const match = cd.match(/filename="(.+?)"/);
          const fname = match?.[1] ?? `export.${format}`;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fname;
          a.click();
        }
      }
      setLastExport(new Date().toLocaleString('pt-AO'));
      onExported();
    } catch (e) {
      webAlert('Erro na Exportação', (e as Error).message ?? 'Não foi possível exportar.');
    } finally {
      setLoading(false);
    }
  }, [type, format, anoLetivo, trimestre, onExported]);

  const formats: ExportFormat[] = type === 'consolidado' ? ['json'] : ['csv', 'xlsx', 'xml', 'json'];

  return (
    <View style={[styles.exportCard, { borderLeftColor: color }]}>
      {/* Cabeçalho tappable — toggle colapso */}
      <TouchableOpacity
        style={styles.exportCardHeader}
        onPress={() => setCollapsed(c => !c)}
        activeOpacity={0.75}
      >
        <View style={[styles.exportIcon, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon as any} size={22} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.exportTitle}>{title}</Text>
          {collapsed
            ? <Text style={[styles.exportDesc, { numberOfLines: 1 }]} numberOfLines={1}>{description}</Text>
            : <Text style={styles.exportDesc}>{description}</Text>
          }
          {!collapsed && lastExport && <Text style={styles.exportLast}>Último: {lastExport}</Text>}
        </View>
        <View style={{ alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={Colors.textMuted}
          />
          {collapsed && lastExport && (
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.success }} />
          )}
        </View>
      </TouchableOpacity>

      {/* Corpo colapsável */}
      {!collapsed && (
        <>
          {type === 'resultados' && (
            <View style={styles.filterRow}>
              {['', '1', '2', '3'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterPill, trimestre === t && styles.filterPillActive]}
                  onPress={() => setTrimestre(t)}
                >
                  <Text style={[styles.filterPillText, trimestre === t && styles.filterPillTextActive]}>
                    {t === '' ? 'Todos' : `T${t}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.exportFooter}>
            <View style={styles.formatRow}>
              {formats.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.formatPill,
                    format === f && styles.formatPillActive,
                    f === 'xlsx' && { borderColor: '#1D6F42' },
                    f === 'xlsx' && format === f && { backgroundColor: '#1D6F4222', borderColor: '#1D6F42' },
                  ]}
                  onPress={() => setFormat(f)}
                >
                  <Text style={[styles.formatPillText, format === f && styles.formatPillTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: color }, loading && { opacity: 0.7 }]}
              onPress={doExport}
              disabled={loading}
            >
              {loading
                ? <AppLoader color="#fff" size="small" />
                : <><Ionicons name="download-outline" size={15} color="#fff" /><Text style={styles.exportBtnText}>Exportar</Text></>
              }
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Dica visual quando colapsado */}
      {collapsed && (
        <View style={[styles.collapsedHint, { borderTopColor: color + '30' }]}>
          <View style={styles.formatRowMini}>
            {formats.map(f => (
              <View key={f} style={styles.formatPillMini}>
                <Text style={styles.formatPillMiniText}>{f.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.exportBtnMini, { backgroundColor: color + '20', borderColor: color + '50' }]}>
            <Ionicons name="download-outline" size={12} color={color} />
            <Text style={[styles.exportBtnMiniText, { color }]}>Toque para expandir</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Card "a implementar" ─────────────────────────────────────────────────────

function FutureCard({ title, description, icon, color, expandSignal }: {
  title: string; description: string; icon: string; color: string;
  expandSignal?: { v: number; expanded: boolean };
}) {
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (expandSignal && expandSignal.v > 0) setCollapsed(!expandSignal.expanded);
  }, [expandSignal?.v]);
  return (
    <TouchableOpacity
      style={[styles.futureCard, { borderLeftColor: `${color}60` }]}
      onPress={() => setCollapsed(c => !c)}
      activeOpacity={0.75}
    >
      <View style={[styles.exportIcon, { backgroundColor: `${color}0E`, flexShrink: 0 }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={`${color}80`} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.futureName, { flex: 1 }]} numberOfLines={collapsed ? 1 : undefined}>{title}</Text>
          <View style={styles.futureBadge}>
            <Text style={styles.futureBadgeText}>Em breve</Text>
          </View>
          <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={14} color={Colors.textMuted} />
        </View>
        {!collapsed && <Text style={styles.futureDesc}>{description}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── Relatório Consolidado DPE (card colapsável) ─────────────────────────────

function ConsolidadoCard({ anoLetivo, onExported, expandSignal }: { anoLetivo: string; onExported: () => void; expandSignal?: { v: number; expanded: boolean } }) {
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (expandSignal && expandSignal.v > 0) setCollapsed(!expandSignal.expanded);
  }, [expandSignal?.v]);
  return (
    <View style={styles.consolidadoCard}>
      <TouchableOpacity style={styles.exportCardHeader} onPress={() => setCollapsed(c => !c)} activeOpacity={0.75}>
        <View style={[styles.exportIcon, { backgroundColor: `${Colors.gold}18` }]}>
          <MaterialCommunityIcons name="file-chart" size={22} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.exportTitle, { color: Colors.gold }]}>Relatório Consolidado DPE</Text>
          <Text style={styles.exportDesc} numberOfLines={collapsed ? 1 : undefined}>
            Documento único com sumário executivo, mapa de matrículas por classe/género e indicadores-chave para submissão à Direcção Provincial de Educação.
          </Text>
        </View>
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={Colors.textMuted} style={{ flexShrink: 0 }} />
      </TouchableOpacity>
      {!collapsed && (
        <TouchableOpacity
          style={styles.consolidadoBtn}
          onPress={async () => {
            if (Platform.OS !== 'web') { webAlert('Disponível apenas na versão Web.'); return; }
            try {
              const token = await getAuthToken() ?? '';
              const params = anoLetivo ? `?anoLetivo=${anoLetivo}` : '';
              const data = await fetch(`/api/med/export/consolidado${params}`, { headers: { Authorization: `Bearer ${token}` } });
              const json = await data.json();
              const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `MED_Consolidado_${anoLetivo || 'todos'}_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              onExported();
            } catch (e) { webAlert('Erro', (e as Error).message ?? 'Não foi possível descarregar.'); }
          }}
        >
          <Ionicons name="download-outline" size={15} color={Colors.primaryDark} />
          <Text style={styles.consolidadoBtnText}>Descarregar Consolidado (JSON)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Modal Histórico ──────────────────────────────────────────────────────────

function HistoricoModal({ visible, onClose, hasAccess }: {
  visible: boolean; onClose: () => void; hasAccess: boolean;
}) {
  const [historico, setHistorico] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try {
      const logs = await api.get<AuditLog[]>('/api/med/historico');
      setHistorico(logs);
    } catch {}
    finally { setLoading(false); }
  }, [hasAccess]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Histórico de Exportações</Text>
            <TouchableOpacity style={styles.modalClose} onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
            {loading ? (
              <AppLoader color={Colors.gold} size="large" style={{ marginTop: 40 }} />
            ) : historico.length === 0 ? (
              <View style={styles.emptyHistorico}>
                <MaterialCommunityIcons name="history" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Sem exportações registadas</Text>
                <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>As exportações realizadas aparecerão aqui</Text>
              </View>
            ) : (
              historico.map((log) => {
                const isExport = log.acao === 'exportar';
                const color = isExport ? '#2ECC71' : Colors.gold;
                const dt = new Date(log.createdAt);
                return (
                  <View key={log.id} style={[styles.histCard, { borderLeftColor: color }]}>
                    <View style={[styles.histIcon, { backgroundColor: `${color}15` }]}>
                      <MaterialCommunityIcons name={isExport ? 'file-export' : 'cog'} size={17} color={color} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.histDesc} numberOfLines={2}>{log.descricao}</Text>
                      <Text style={styles.histMeta}>{log.userEmail} · {log.userRole}</Text>
                      <Text style={styles.histDate}>
                        {dt.toLocaleDateString('pt-AO')} às {dt.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
                        {log.ipAddress ? `  ·  IP: ${log.ipAddress}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.histBadge, { backgroundColor: `${color}22`, borderColor: `${color}60` }]}>
                      <Text style={[styles.histBadgeText, { color }]}>{log.acao.toUpperCase()}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={{ padding: 16 }}>
            <TouchableOpacity style={[styles.exportBtn, { backgroundColor: Colors.primary }]} onPress={load} disabled={loading}>
              <Ionicons name="refresh-outline" size={15} color="#fff" />
              <Text style={styles.exportBtnText}>Actualizar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modal Configurações MED ──────────────────────────────────────────────────

function ConfigModal({ visible, onClose, config, onChange, onSave, saving, saved, nifError, nifLookup }: {
  visible: boolean; onClose: () => void;
  config: MEDConfig; onChange: (c: MEDConfig) => void;
  onSave: () => void; saving: boolean; saved: boolean;
  nifError: boolean;
  nifLookup: { loading: boolean; status: 'idle'|'found'|'not_found'|'error'; name: string; run: (nif: string) => void; };
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configuração MED</Text>
            <TouchableOpacity style={styles.modalClose} onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>

          <View style={styles.configCard}>
            <SectionHeader title="Identificação da Escola" icon="school-outline" />
            <Field label="Código MED" value={config.codigoMED}
              onChange={v => onChange({ ...config, codigoMED: v })}
              placeholder="Ex: AO-LDA-2024-001" />

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, nifError && { color: '#E74C3C' }]}>NIF da Escola <Text style={{ color: '#E74C3C' }}>*</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }, nifError && { borderColor: '#E74C3C', borderWidth: 1.5 }]}
                  value={config.nifEscola}
                  onChangeText={v => onChange({ ...config, nifEscola: v })}
                  onBlur={() => nifLookup.run(config.nifEscola)}
                  placeholder="9 dígitos numéricos (obrigatório)"
                  placeholderTextColor={nifError ? '#E74C3C88' : Colors.textMuted}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[nifBtnStyle, nifLookup.loading && { opacity: 0.6 }]}
                  onPress={() => nifLookup.run(config.nifEscola)}
                  disabled={nifLookup.loading}
                >
                  {nifLookup.loading ? <AppLoader size="small" color="#fff" /> : <Ionicons name="search" size={16} color="#fff" />}
                </TouchableOpacity>
              </View>
              {nifLookup.status === 'found' && (
                <View style={nifBadgeStyle}>
                  <Ionicons name="checkmark-circle" size={13} color="#2ECC71" />
                  <Text style={[nifBadgeTextStyle, { color: '#2ECC71' }]}>Nome obtido: {nifLookup.name}</Text>
                </View>
              )}
              {(nifLookup.status === 'not_found' || nifLookup.status === 'error') && (
                <View style={nifBadgeStyle}>
                  <Ionicons name="warning-outline" size={13} color="#F39C12" />
                  <Text style={[nifBadgeTextStyle, { color: '#F39C12' }]}>NIF não encontrado — preencha manualmente</Text>
                </View>
              )}
              {nifError && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="alert-circle" size={12} color="#E74C3C" />
                  <Text style={{ fontSize: 12, color: '#E74C3C', fontFamily: 'Inter_500Medium' }}>
                    {!config.nifEscola?.trim() ? 'O NIF é obrigatório.' : 'O NIF deve ter 9 dígitos numéricos.'}
                  </Text>
                </View>
              )}
            </View>

            <Field label="Nome Oficial da Escola" value={config.nomeEscola}
              onChange={v => onChange({ ...config, nomeEscola: v })} />
            <Field label="Província" value={config.provinciaEscola}
              onChange={v => onChange({ ...config, provinciaEscola: v })} placeholder="Ex: Luanda" />
            <Field label="Município" value={config.municipioEscola}
              onChange={v => onChange({ ...config, municipioEscola: v })} placeholder="Ex: Luanda" />
            <OptionPicker label="Tipo de Ensino" options={TIPO_ENSINO_OPTIONS}
              value={config.tipoEnsino} onChange={v => onChange({ ...config, tipoEnsino: v })} />
            <OptionPicker label="Modalidade" options={MODALIDADE_OPTIONS}
              value={config.modalidade} onChange={v => onChange({ ...config, modalidade: v })} />
          </View>

          <View style={styles.configCard}>
            <SectionHeader title="Direcção" icon="people-outline" />
            <Field label="Director Geral" value={config.directorGeral}
              onChange={v => onChange({ ...config, directorGeral: v })} placeholder="Nome completo" />
            <Field label="Director Pedagógico" value={config.directorPedagogico}
              onChange={v => onChange({ ...config, directorPedagogico: v })} placeholder="Nome completo" />
            <Field label="Director Provincial de Educação" value={config.directorProvincialEducacao}
              onChange={v => onChange({ ...config, directorProvincialEducacao: v })} placeholder="Nome completo" />
          </View>

          </ScrollView>
          <View style={{ padding: 16, paddingBottom: 20 }}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={onSave}
              disabled={saving}
            >
              {saving
                ? <AppLoader color="#fff" />
                : <><Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>{saved ? 'Guardado!' : 'Guardar Configurações'}</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────

export default function MEDIntegracaoScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { anoLetivo } = useAnoAcademico();

  const [config, setConfig] = useState<MEDConfig>({
    codigoMED: '', nifEscola: '', nomeEscola: '', provinciaEscola: '', municipioEscola: '',
    tipoEnsino: 'Secundário', modalidade: 'Presencial',
    directorGeral: '', directorPedagogico: '', directorProvincialEducacao: '',
  });
  const [stats, setStats] = useState<MEDStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [exportCount, setExportCount] = useState(0);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [sec1Collapsed, setSec1Collapsed] = useState(false);
  const [sec2Collapsed, setSec2Collapsed] = useState(false);
  const [expandSignal, setExpandSignal] = useState<{ v: number; expanded: boolean }>({ v: 0, expanded: false });

  const handleToggleAll = useCallback(() => {
    const next = !expandSignal.expanded;
    setExpandSignal(s => ({ v: s.v + 1, expanded: next }));
    setSec1Collapsed(!next);
    setSec2Collapsed(!next);
  }, [expandSignal.expanded]);
  const [nifError, setNifError] = useState(false);
  const [nifLookupLoading, setNifLookupLoading] = useState(false);
  const [nifLookupStatus, setNifLookupStatus] = useState<'idle'|'found'|'not_found'|'error'>('idle');
  const [nifLookupName, setNifLookupName] = useState('');

  const hasAccess = user && ALLOWED_ROLES.includes(user.role);

  const loadData = useCallback(async () => {
    if (!hasAccess) return;
    setLoadingData(true);
    try {
      const [cfg, st] = await Promise.all([
        api.get<MEDConfig>('/api/med/config'),
        api.get<MEDStats>('/api/med/stats'),
      ]);
      setConfig(cfg);
      setStats(st);
    } catch (e) {
      console.error('MED load error', e);
    } finally {
      setLoadingData(false);
    }
  }, [hasAccess]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveConfig = useCallback(async () => {
    const nifVal = config.nifEscola?.trim() ?? '';
    if (!nifVal || !/^\d{9}$/.test(nifVal)) {
      setNifError(true);
      webAlert('NIF Inválido', 'O NIF deve ter exactamente 9 dígitos numéricos (ex: 500123456).');
      return;
    }
    setNifError(false);
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      await api.patch('/api/med/config', config as any);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (e) {
      webAlert('Erro ao Guardar', (e as Error).message ?? 'Não foi possível guardar as configurações.');
    } finally {
      setSavingConfig(false);
    }
  }, [config]);

  async function lookupNIF(nif: string) {
    if (!nif?.trim() || nif.trim().length < 9) return;
    setNifLookupLoading(true);
    setNifLookupStatus('idle');
    setNifLookupName('');
    try {
      const data = await consultarNIF(nif);
      if (data) {
        setConfig(c => ({ ...c, nomeEscola: data.nome }));
        setNifLookupName(data.nome);
        setNifLookupStatus('found');
      } else {
        setNifLookupStatus('not_found');
      }
    } catch {
      setNifLookupStatus('error');
    } finally {
      setNifLookupLoading(false);
    }
  }

  const onExported = useCallback(() => setExportCount(c => c + 1), []);

  if (!hasAccess) {
    return (
      <View style={styles.container}>
        <TopBar title="Integração MED" />
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.accessDeniedTitle}>Acesso Restrito</Text>
          <Text style={styles.accessDeniedSub}>Apenas administradores têm acesso à integração com o MED.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <TopBar title="Integração MED" />

      {/* Faixa MED — 2 linhas no mobile */}
      <View style={styles.medBanner}>
        {/* Linha 1: logo + info + status */}
        <View style={styles.medBannerTop}>
          <View style={styles.medLogoBox}>
            <MaterialCommunityIcons name="shield-star" size={22} color="#4A90D9" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.medBannerTitle} numberOfLines={1}>Ministério da Educação · SIGE Gov</Text>
            <Text style={styles.medBannerSub} numberOfLines={1}>
              Cód: {config.codigoMED || '—'}  ·  NIF: {config.nifEscola || '—'}  ·  {config.provinciaEscola || 'Província'}
            </Text>
          </View>
          <View style={[styles.medStatusBadge, {
            backgroundColor: config.codigoMED ? '#2ECC7122' : '#F39C1222',
            borderColor: config.codigoMED ? '#2ECC71' : '#F39C12',
          }]}>
            <Ionicons name={config.codigoMED ? 'checkmark-circle' : 'alert-circle'} size={11}
              color={config.codigoMED ? '#2ECC71' : '#F39C12'} />
            <Text style={[styles.medStatusText, { color: config.codigoMED ? '#2ECC71' : '#F39C12' }]}>
              {config.codigoMED ? 'Configurado' : 'Incompleto'}
            </Text>
          </View>
        </View>
        {/* Linha 2: botões de acção alinhados à direita */}
        <View style={styles.medBannerActions}>
          <TouchableOpacity style={[styles.medActionBtn, styles.medExpandBtn]} onPress={handleToggleAll}>
            <Ionicons
              name={expandSignal.expanded ? 'contract-outline' : 'expand-outline'}
              size={15}
              color={expandSignal.expanded ? Colors.accent : Colors.textSecondary}
            />
            <Text style={[styles.medExpandBtnText, expandSignal.expanded && { color: Colors.accent }]}>
              {expandSignal.expanded ? 'Colapsar' : 'Expandir'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.medActionBtn} onPress={() => setShowHistorico(true)}>
            <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
            {exportCount > 0 && (
              <View style={styles.medActionBadge}>
                <Text style={styles.medActionBadgeText}>{exportCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.medActionBtn} onPress={() => setShowConfig(true)}>
            <Ionicons name="settings-outline" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats compactas */}
      {stats && (
        <View style={styles.statsRow}>
          <StatCard label="Alunos" value={stats.alunos.total}
            sub={`♂ ${stats.alunos.masculino}  ♀ ${stats.alunos.feminino}`}
            color={Colors.info} icon="account-school" />
          <StatCard label="Professores" value={stats.professores.ativos}
            color={Colors.success} icon="human-male-board" />
          <StatCard label="Turmas" value={stats.turmas}
            color={Colors.gold} icon="google-classroom" />
          <StatCard label="Aprovação" value={`${stats.taxaAprovacao}%`}
            color={Colors.approved} icon="check-decagram" />
        </View>
      )}

      {/* Área de scroll principal — sem tabs, espaço total */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {loadingData ? (
          <AppLoader color={Colors.gold} size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Nota informativa */}
            <View style={styles.infoNote}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.info} />
              <Text style={styles.infoNoteText}>
                Ficheiros compatíveis com o portal{' '}
                <Text style={styles.infoNoteLink}>sige.med.gov.ao</Text>. Seleccione o formato e faça upload com as suas credenciais institucionais.
              </Text>
            </View>

            {/* ── Secção 1: Documentação Obrigatória (implementada) ── */}
            <SectionHeader
              title="Documentação Obrigatória — Implementada"
              icon="checkmark-circle-outline"
              count={5}
              collapsed={sec1Collapsed}
              onToggle={() => setSec1Collapsed(c => !c)}
            />

            {!sec1Collapsed && (
              <>
                <ExportCard
                  title="Mapa de Matrículas"
                  description="Listagem completa de alunos inscritos com dados demográficos, turma e classe"
                  icon="account-multiple"
                  color="#3498DB"
                  type="matriculas"
                  anoLetivo={anoLetivo}
                  onExported={onExported}
                  expandSignal={expandSignal}
                />
                <ExportCard
                  title="Mapa de Professores"
                  description="Corpo docente activo com habilitações literárias, disciplinas atribuídas e tipo de contrato"
                  icon="human-male-board"
                  color="#2ECC71"
                  type="professores"
                  anoLetivo={anoLetivo}
                  onExported={onExported}
                  expandSignal={expandSignal}
                />
                <ExportCard
                  title="Pautas de Resultados Académicos"
                  description="Notas e situação de aprovação/reprovação por aluno, disciplina e trimestre"
                  icon="chart-bar"
                  color="#F39C12"
                  type="resultados"
                  anoLetivo={anoLetivo}
                  onExported={onExported}
                  expandSignal={expandSignal}
                />
                <ExportCard
                  title="Mapa de Frequências e Assiduidade"
                  description="Registo de presenças, faltas justificadas/injustificadas e taxa de assiduidade por aluno"
                  icon="calendar-check"
                  color="#9B59B6"
                  type="frequencias"
                  anoLetivo={anoLetivo}
                  onExported={onExported}
                  expandSignal={expandSignal}
                />

                {/* Relatório Consolidado */}
                <ConsolidadoCard anoLetivo={anoLetivo} onExported={onExported} expandSignal={expandSignal} />
              </>
            )}

            {/* ── Secção 2: Documentação a Implementar ── */}
            <SectionHeader
              title="Documentação Prevista — Em Desenvolvimento"
              icon="time-outline"
              count={9}
              collapsed={sec2Collapsed}
              onToggle={() => setSec2Collapsed(c => !c)}
            />

            {!sec2Collapsed && (
              <>
                <View style={styles.futureNote}>
                  <Ionicons name="bulb-outline" size={14} color={Colors.gold} />
                  <Text style={styles.futureNoteText}>
                    Os relatórios abaixo são exigidos pelas Direcções Provinciais de Educação de Angola e serão progressivamente adicionados ao sistema.
                  </Text>
                </View>

                <FutureCard title="Boletim de Estatísticas Escolares (BEE)" description="Mapa anual consolidado com indicadores de eficiência interna: taxa de aprovação, repetição, abandono e transição por classe e género. Exigido anualmente pela DPE." icon="chart-line" color="#3498DB" expandSignal={expandSignal} />
                <FutureCard title="Mapa de Abandono Escolar" description="Lista de alunos matriculados que desistiram no decurso do ano lectivo com motivo declarado, por turma e classe." icon="account-remove" color="#E74C3C" expandSignal={expandSignal} />
                <FutureCard title="Mapa de Transferências (Entradas e Saídas)" description="Registo de alunos transferidos de outras escolas (entradas) e alunos que solicitaram transferência para outra escola (saídas), com escola de origem/destino." icon="swap-horizontal" color="#1ABC9C" expandSignal={expandSignal} />
                <FutureCard title="Distribuição de Turmas e Cargas Horárias" description="Mapa do horário por professor, número de tempos lectivos semanais, disciplinas atribuídas e turmas por docente. Exigido para relatório de pessoal docente." icon="calendar-text" color="#F39C12" expandSignal={expandSignal} />
                <FutureCard title="Mapa de Pessoal Não-Docente" description="Funcionários administrativos, auxiliares e de apoio: nome, categoria, vínculo e função. Complementa o mapa de professores para o relatório de RH escolar." icon="account-tie" color="#9B59B6" expandSignal={expandSignal} />
                <FutureCard title="Declaração de Início de Ano Lectivo" description="Documento formal a entregar na DPE antes do arranque das aulas, com indicação de turmas abertas, número de alunos inscritos e docentes afectos." icon="file-sign" color="#2ECC71" expandSignal={expandSignal} />
                <FutureCard title="Inscrição em Exames Nacionais (12.ª Classe)" description="Listagem de alunos candidatos a exame nacional de fim de ciclo, com dados de identificação e disciplinas a que se inscrevem. Formato exigido pelo INIDE." icon="pen" color="#E67E22" expandSignal={expandSignal} />
                <FutureCard title="Mapa de Novas Admissões (1.ª Vez)" description="Alunos que ingressam pela primeira vez no sistema de ensino ou que transitaram de outro subsistema, para efeitos de controlo de acesso ao ensino." icon="account-plus" color="#3498DB" expandSignal={expandSignal} />
                <FutureCard title="Mapa de Infraestruturas e Equipamentos" description="Inventário de salas de aula, laboratórios, biblioteca e equipamentos disponíveis. Usado nos relatórios de condições de ensino da DPE." icon="office-building" color="#7F8C8D" expandSignal={expandSignal} />
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Modais */}
      <HistoricoModal
        visible={showHistorico}
        onClose={() => setShowHistorico(false)}
        hasAccess={!!hasAccess}
      />
      <ConfigModal
        visible={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onChange={setConfig}
        onSave={saveConfig}
        saving={savingConfig}
        saved={configSaved}
        nifError={nifError}
        nifLookup={{
          loading: nifLookupLoading,
          status: nifLookupStatus,
          name: nifLookupName,
          run: lookupNIF,
        }}
      />
    </View>
  );
}

// ─── Estilos inline NIF ───────────────────────────────────────────────────────
const nifBtnStyle = {
  width: 38, height: 38, borderRadius: 8, backgroundColor: Colors.accent,
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
const nifBadgeStyle = {
  flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
  marginTop: 6, paddingHorizontal: 10, paddingVertical: 5,
  borderRadius: 8, backgroundColor: Colors.surface,
};
const nifBadgeTextStyle = {
  fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1,
};

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 40 },

  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  accessDeniedTitle: { fontSize: 20, color: Colors.text, fontFamily: 'Inter_700Bold' },
  accessDeniedSub: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  medBanner: {
    flexDirection: 'column',
    backgroundColor: '#0E1A2B', borderBottomWidth: 1, borderBottomColor: '#4A90D935',
    paddingHorizontal: 12, paddingVertical: 9, gap: 9,
  },
  medBannerTop: {
    flexDirection: 'row', alignItems: 'center', gap: 9, width: '100%',
  },
  medBannerActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%',
  },
  medActionBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0,
  },
  medExpandBtn: {
    width: 'auto', paddingHorizontal: 9, flexDirection: 'row', gap: 4,
  },
  medExpandBtnText: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary,
  },
  medActionBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: Colors.gold, borderRadius: 7,
    minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1, borderColor: '#0E1A2B',
  },
  medActionBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: Colors.primaryDark },
  medLogoBox: {
    width: 38, height: 38, borderRadius: 9,
    backgroundColor: '#4A90D914', borderWidth: 1, borderColor: '#4A90D935',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  medBannerTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  medBannerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  medStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0,
  },
  medStatusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  statsRow: {
    flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, gap: 6,
  },
  statCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.backgroundCard, borderRadius: 9,
    padding: 9, borderLeftWidth: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  statIcon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statValue: { fontSize: 16, fontFamily: 'Inter_700Bold', lineHeight: 19 },
  statLabel: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  statSub: { fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, marginBottom: 6 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 },

  collapsedHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 8, marginTop: 2, gap: 8 },
  formatRowMini: { flexDirection: 'row', gap: 4, flex: 1 },
  formatPillMini: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border },
  formatPillMiniText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  exportBtnMini: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  exportBtnMiniText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  infoNote: {
    flexDirection: 'row', gap: 9, backgroundColor: `${Colors.info}12`,
    borderRadius: 9, padding: 11, borderWidth: 1, borderColor: `${Colors.info}28`,
    marginBottom: 2, alignItems: 'flex-start',
  },
  infoNoteText: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  infoNoteLink: { color: Colors.info, fontFamily: 'Inter_600SemiBold' },

  exportCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 11,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
    padding: 13, marginBottom: 10,
  },
  exportCardHeader: { flexDirection: 'row', gap: 11, marginBottom: 10, alignItems: 'flex-start' },
  exportIcon: { width: 40, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  exportTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  exportDesc: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  exportLast: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 3 },

  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 9 },
  filterPill: {
    borderRadius: 6, paddingHorizontal: 11, paddingVertical: 5,
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
  },
  filterPillActive: { backgroundColor: `${Colors.gold}22`, borderColor: Colors.gold },
  filterPillText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  filterPillTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  exportFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  formatRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  formatPill: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
  },
  formatPillActive: { backgroundColor: `${Colors.primaryLight}50`, borderColor: Colors.primaryLight },
  formatPillText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  formatPillTextActive: { color: Colors.text, fontFamily: 'Inter_700Bold' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9, flexShrink: 0,
  },
  exportBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  consolidadoCard: {
    backgroundColor: `${Colors.gold}0E`, borderRadius: 11,
    borderWidth: 1, borderColor: `${Colors.gold}35`, padding: 14, marginBottom: 10,
  },
  consolidadoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.gold, borderRadius: 9, paddingVertical: 11,
  },
  consolidadoBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.primaryDark },

  futureNote: {
    flexDirection: 'row', gap: 8, backgroundColor: `${Colors.gold}0C`,
    borderRadius: 9, padding: 10, borderWidth: 1, borderColor: `${Colors.gold}25`,
    marginBottom: 8, alignItems: 'flex-start',
  },
  futureNoteText: { flex: 1, fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  futureCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
    padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', gap: 11, opacity: 0.75,
  },
  futureName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  futureDesc: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 2 },
  futureBadge: {
    backgroundColor: '#F39C1218', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#F39C1240',
  },
  futureBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#F39C12' },

  // Modal — centered dialog
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalBox: {
    backgroundColor: Colors.backgroundCard, borderRadius: 18,
    width: '100%', maxWidth: 560, maxHeight: '88%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
  },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalClose: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: Colors.backgroundElevated, alignItems: 'center', justifyContent: 'center',
  },

  histCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.backgroundCard, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
    padding: 11, marginBottom: 7,
  },
  histIcon: { width: 32, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  histDesc: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text, lineHeight: 17 },
  histMeta: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  histDate: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  histBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start', flexShrink: 0 },
  histBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' },

  emptyHistorico: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textAlign: 'center' },

  configCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 11,
    borderWidth: 1, borderColor: Colors.border, padding: 15, marginBottom: 12,
  },
  field: { marginBottom: 13 },
  fieldLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    backgroundColor: Colors.backgroundElevated, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  fieldInputDisabled: { opacity: 0.5 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  optionPill: {
    borderRadius: 8, paddingHorizontal: 13, paddingVertical: 8,
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
  },
  optionPillActive: { backgroundColor: `${Colors.gold}22`, borderColor: Colors.gold },
  optionPillText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  optionPillTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 11, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.primaryLight,
  },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
});
