import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { StableSearchInput } from '@/components/StableSearchInput';

interface Provincia {
  id: number;
  nome: string;
}

interface Municipio {
  id: number;
  nome: string;
  provinciaId: number;
}

interface Props {
  provinciaValue: string;
  municipioValue: string;
  onProvinciaChange: (nome: string) => void;
  onMunicipioChange: (nome: string) => void;
  required?: boolean;
  labelStyle?: object;
  fieldStyle?: object;
  provinciaError?: string;
  municipioError?: string;
}

export default function ProvinciaMunicipioSelector({
  provinciaValue,
  municipioValue,
  onProvinciaChange,
  onMunicipioChange,
  required,
  labelStyle,
  fieldStyle,
  provinciaError,
  municipioError,
}: Props) {
  const [provincias, setProvincias] = useState<Provincia[]>([]);
  const [municipios, setMunicipos] = useState<Municipio[]>([]);
  const [loadingProv, setLoadingProv] = useState(true);
  const [loadingMun, setLoadingMun] = useState(false);

  const [showProvModal, setShowProvModal] = useState(false);
  const [showMunModal, setShowMunModal] = useState(false);
  const [searchProv, setSearchProv] = useState('');
  const [searchMun, setSearchMun] = useState('');

  useEffect(() => {
    fetch(`/api/provincias`)
      .then(r => r.json())
      .then((data: Provincia[]) => setProvincias(data))
      .catch(() => {})
      .finally(() => setLoadingProv(false));
  }, []);

  useEffect(() => {
    if (!provinciaValue) { setMunicipos([]); return; }
    const prov = provincias.find(p => p.nome === provinciaValue);
    if (!prov) { setMunicipos([]); return; }
    setLoadingMun(true);
    fetch(`/api/municipios?provinciaId=${prov.id}`)
      .then(r => r.json())
      .then((data: Municipio[]) => setMunicipos(data))
      .catch(() => {})
      .finally(() => setLoadingMun(false));
  }, [provinciaValue, provincias]);

  const filteredProv = provincias.filter(p =>
    p.nome.toLowerCase().includes(searchProv.toLowerCase())
  );
  const filteredMun = municipios.filter(m =>
    m.nome.toLowerCase().includes(searchMun.toLowerCase())
  );

  function handleSelectProvincia(nome: string) {
    onProvinciaChange(nome);
    onMunicipioChange('');
    setShowProvModal(false);
    setSearchProv('');
  }

  function handleSelectMunicipio(nome: string) {
    onMunicipioChange(nome);
    setShowMunModal(false);
    setSearchMun('');
  }

  return (
    <View style={[styles.wrapper, fieldStyle]}>
      <View style={styles.fieldGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, labelStyle]}>Província</Text>
          {required && <Text style={styles.required}>*</Text>}
        </View>
        <TouchableOpacity
          style={[styles.selector, !!provinciaValue && styles.selectorActive, !!provinciaError && styles.selectorError]}
          onPress={() => { setSearchProv(''); setShowProvModal(true); }}
          activeOpacity={0.8}
        >
          {loadingProv ? (
            <AppLoader size="small" color={Colors.textMuted} />
          ) : (
            <Text style={[styles.selectorText, !provinciaValue && styles.selectorPlaceholder]}>
              {provinciaValue || 'Seleccionar província...'}
            </Text>
          )}
          <Ionicons name="chevron-down" size={16} color={provinciaValue ? Colors.gold : Colors.textMuted} />
        </TouchableOpacity>
        {!!provinciaError && <Text style={styles.fieldError}>{provinciaError}</Text>}
      </View>

      {!!provinciaValue && (
        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, labelStyle]}>Município</Text>
            {required && <Text style={styles.required}>*</Text>}
          </View>
          <TouchableOpacity
            style={[styles.selector, !!municipioValue && styles.selectorActive, !!municipioError && styles.selectorError]}
            onPress={() => { setSearchMun(''); setShowMunModal(true); }}
            activeOpacity={0.8}
            disabled={loadingMun}
          >
            {loadingMun ? (
              <AppLoader size="small" color={Colors.textMuted} />
            ) : (
              <Text style={[styles.selectorText, !municipioValue && styles.selectorPlaceholder]}>
                {municipioValue || 'Seleccionar município...'}
              </Text>
            )}
            <Ionicons name="chevron-down" size={16} color={municipioValue ? Colors.gold : Colors.textMuted} />
          </TouchableOpacity>
          {!!municipioError && <Text style={styles.fieldError}>{municipioError}</Text>}
        </View>
      )}

      <PickerModal
        visible={showProvModal}
        title="Seleccionar Província"
        items={filteredProv.map(p => p.nome)}
        selectedValue={provinciaValue}
        searchValue={searchProv}
        onSearchChange={setSearchProv}
        onSelect={handleSelectProvincia}
        onClose={() => setShowProvModal(false)}
        emptyText="Nenhuma província encontrada"
      />

      <PickerModal
        visible={showMunModal}
        title={`Municípios de ${provinciaValue}`}
        items={filteredMun.map(m => m.nome)}
        selectedValue={municipioValue}
        searchValue={searchMun}
        onSearchChange={setSearchMun}
        onSelect={handleSelectMunicipio}
        onClose={() => setShowMunModal(false)}
        emptyText="Nenhum município encontrado"
      />
    </View>
  );
}

function PickerModal({
  visible, title, items, selectedValue, searchValue,
  onSearchChange, onSelect, onClose, emptyText,
}: {
  visible: boolean;
  title: string;
  items: string[];
  selectedValue: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSelect: (v: string) => void;
  onClose: () => void;
  emptyText: string;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={modal.overlay}>
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={modal.searchWrap}>
            <StableSearchInput
              value={searchValue}
              onChangeText={onSearchChange}
              inputStyle={modal.searchInput}
              placeholder="Pesquisar..."
              iconColor={Colors.textMuted}
            />
          </View>

          <FlatList
            data={items}
            keyExtractor={item => item}
            style={modal.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={modal.emptyText}>{emptyText}</Text>
            }
            renderItem={({ item }) => {
              const isSelected = item === selectedValue;
              return (
                <TouchableOpacity
                  style={[modal.item, isSelected && modal.itemSelected]}
                  onPress={() => onSelect(item)}
                  activeOpacity={0.75}
                >
                  <Text style={[modal.itemText, isSelected && modal.itemTextSelected]}>{item}</Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={16} color={Colors.gold} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 16 },
  fieldGroup: { gap: 7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.7, textTransform: 'uppercase',
  },
  required: { fontSize: 12, color: Colors.accent, fontFamily: 'Inter_700Bold' },
  selector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14, height: 52,
  },
  selectorActive: {
    borderColor: 'rgba(240,165,0,0.4)',
    backgroundColor: 'rgba(240,165,0,0.04)',
  },
  selectorText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.text, flex: 1 },
  selectorPlaceholder: { color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  selectorError: { borderColor: Colors.danger, backgroundColor: 'rgba(231,76,60,0.04)' },
  fieldError: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.danger, marginTop: 4 },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#0F1F40',
    borderRadius: 24,
    maxHeight: '75%',
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12, height: 44,
    gap: 8,
  },
  searchIcon: {},
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  list: { paddingHorizontal: 8, paddingBottom: 16 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 10, marginVertical: 1,
  },
  itemSelected: { backgroundColor: 'rgba(240,165,0,0.1)' },
  itemText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text },
  itemTextSelected: { fontFamily: 'Inter_700Bold', color: Colors.gold },
  emptyText: {
    textAlign: 'center', color: Colors.textMuted,
    fontFamily: 'Inter_400Regular', fontSize: 14,
    paddingVertical: 40,
  },
});
