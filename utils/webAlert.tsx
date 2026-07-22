import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/colors';
import { showToast, type ToastType } from '@/utils/toast';

function inferToastType(title: string, message?: string): ToastType {
  const t = `${title} ${message ?? ''}`.toLowerCase();
  if (/(erro|falha|inv[aá]lid|obrigat[oó]ri|n[aã]o\s+(foi|p[oô]de|consegui)|fail|denied|negad)/.test(t)) return 'error';
  if (/(sucesso|guardad|gravad|criad|registad|removid|actualizad|atualizad|enviad|conclu[ií]d|aplicad)/.test(t)) return 'success';
  if (/(aviso|aten[cç][aã]o|cuidado)/.test(t)) return 'warning';
  return 'info';
}

// react-dom is only available on web — import conditionally to avoid native errors
let _createPortal: ((children: React.ReactNode, container: Element) => React.ReactNode) | null = null;
if (Platform.OS === 'web') {
  try { _createPortal = require('react-dom').createPortal; } catch {}
}

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

let _showAlert: ((config: AlertConfig) => void) | null = null;

export function webAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  _options?: object
): void {
  const btns: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];

  // Informational alerts (no custom buttons or only a single OK) → inline toast.
  // Confirmation alerts (multiple buttons or a destructive action) → keep modal.
  const isInformational =
    (!buttons || buttons.length === 0) ||
    (btns.length === 1 && !btns[0].onPress && (btns[0].style ?? 'default') === 'default');

  if (isInformational) {
    const type = inferToastType(title, message);
    const text = message ? `${title}: ${message}` : title;
    showToast(text, type, type === 'error' ? 5000 : 3500);
    // Fire the OK callback if it exists, to preserve any chained behaviour.
    const primary = btns.find(b => b.style !== 'cancel');
    if (primary?.onPress) {
      try {
        const r = primary.onPress();
        if (r instanceof Promise) r.catch(() => {});
      } catch {}
    }
    return;
  }

  if (_showAlert) {
    _showAlert({ title, message, buttons: btns });
  } else {
    if (typeof window !== 'undefined') {
      const ok = btns.length > 1 ? window.confirm(`${title}${message ? '\n\n' + message : ''}`) : true;
      if (ok) {
        const primary = btns.find(b => b.style !== 'cancel');
        if (primary?.onPress) primary.onPress();
      }
    }
  }
}

function AlertContent({
  config,
  onButton,
}: {
  config: AlertConfig;
  onButton: (btn: AlertButton) => void;
}) {
  const cancelBtn = config.buttons.find(b => b.style === 'cancel');
  const actionBtns = config.buttons.filter(b => b.style !== 'cancel');

  return (
    <View style={s.box}>
      <Text style={s.title}>{config.title}</Text>
      {!!config.message && (
        <Text style={s.message}>{config.message}</Text>
      )}
      <View style={s.buttons}>
        {cancelBtn && (
          <TouchableOpacity style={[s.btn, s.cancelBtn]} onPress={() => onButton(cancelBtn)}>
            <Text style={[s.btnText, s.cancelText]}>{cancelBtn.text}</Text>
          </TouchableOpacity>
        )}
        {actionBtns.map((btn, i) => (
          <TouchableOpacity
            key={i}
            style={[s.btn, btn.style === 'destructive' ? s.destructiveBtn : s.primaryBtn]}
            onPress={() => onButton(btn)}
          >
            <Text style={[s.btnText, btn.style === 'destructive' ? s.destructiveText : s.primaryText]}>
              {btn.text}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Web Portal overlay (always on top via DOM portal) ──────────────────────
function WebPortalAlert({
  config,
  onButton,
}: {
  config: AlertConfig | null;
  onButton: (btn: AlertButton) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:999999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'background:rgba(0,0,0,0.72)',
    ].join(';');
    document.body.appendChild(div);
    containerRef.current = div;
    setMounted(true);
    return () => {
      document.body.removeChild(div);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.display = config ? 'flex' : 'none';
    }
  }, [config]);

  if (!mounted || !containerRef.current || !config || !_createPortal) return null;

  return _createPortal(
    <TouchableOpacity
      activeOpacity={1}
      style={s.overlayInner}
      onPress={() => {
        const cancel = config.buttons.find(b => b.style === 'cancel');
        if (cancel) onButton(cancel);
      }}
    >
      <TouchableOpacity activeOpacity={1} onPress={() => {}}>
        <AlertContent config={config} onButton={onButton} />
      </TouchableOpacity>
    </TouchableOpacity>,
    containerRef.current
  );
}

export function WebAlertProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AlertConfig | null>(null);

  useEffect(() => {
    _showAlert = (cfg) => setConfig(cfg);
    return () => { _showAlert = null; };
  }, []);

  const handleButton = useCallback((btn: AlertButton) => {
    setConfig(null);
    if (btn.onPress) {
      const result = btn.onPress();
      if (result instanceof Promise) result.catch(() => {});
    }
  }, []);

  if (Platform.OS === 'web') {
    return (
      <>
        {children}
        <WebPortalAlert config={config} onButton={handleButton} />
      </>
    );
  }

  return (
    <>
      {children}
      <Modal
        visible={!!config}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => {
            if (!config) return;
            const cancel = config.buttons.find(b => b.style === 'cancel');
            if (cancel) handleButton(cancel);
          }}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            {config && <AlertContent config={config} onButton={handleButton} />}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  } as any,
  box: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 4,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelBtn: {
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textSecondary,
  },
  primaryBtn: {
    backgroundColor: Colors.gold,
  },
  primaryText: {
    color: '#000',
  },
  destructiveBtn: {
    backgroundColor: Colors.danger,
  },
  destructiveText: {
    color: '#fff',
  },
});
