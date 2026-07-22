import React, { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'siga_pwa_install_dismissed';
const DISMISS_COOLDOWN_DAYS = 7;

function wasRecentlyDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    const diff = Date.now() - Number(ts);
    return diff < DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export default function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [exiting, setExiting] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isStandalone()) return;
    if (wasRecentlyDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      // Delay showing so app loads first
      setTimeout(() => setVisible(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  const handleInstall = async () => {
    if (!promptRef.current) return;
    setInstalling(true);
    try {
      await promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setTimeout(() => dismiss(), 2000);
      } else {
        setInstalling(false);
      }
    } catch {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
    }, 400);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 99999,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(16px) scale(0.96)' : 'translateY(0) scale(1)',
        transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)',
        animation: exiting ? undefined : 'pwaSlideIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
      }}
    >
      <style>{`
        @keyframes pwaSlideIn {
          from { opacity: 0; transform: translateY(24px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pwaPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,179,237,0.3); }
          50%       { box-shadow: 0 0 0 8px rgba(99,179,237,0); }
        }
        .pwa-install-btn {
          background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          letter-spacing: 0.3px;
          transition: transform 0.15s, box-shadow 0.15s;
          animation: pwaPulse 2.5s infinite;
        }
        .pwa-install-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(59,130,246,0.5);
          animation: none;
        }
        .pwa-install-btn:active { transform: translateY(0); }
        .pwa-dismiss-btn {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.5);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 10px 16px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, color 0.15s;
        }
        .pwa-dismiss-btn:hover {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.75);
        }
        .pwa-close-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.35);
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .pwa-close-btn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
      `}</style>

      <div style={{
        width: 340,
        background: 'linear-gradient(145deg, #0F2A45 0%, #0B1E35 60%, #081728 100%)',
        border: '1px solid rgba(59,130,246,0.25)',
        borderRadius: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
      }}>

        {/* Accent top bar */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #3B82F6, #60A5FA, #93C5FD, #3B82F6)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
        }} />

        <style>{`
          @keyframes shimmer {
            0%   { background-position: 0% 0%; }
            100% { background-position: 200% 0%; }
          }
        `}</style>

        <div style={{ padding: '20px 20px 20px 20px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* App Icon */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                overflow: 'hidden',
                flexShrink: 0,
                background: 'linear-gradient(135deg, #1e3a5f, #0f2a45)',
                border: '1px solid rgba(59,130,246,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <img
                  src="/icons/icon-192.png"
                  alt="Super Escola"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#F0F6FF',
                  letterSpacing: 0.2,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  Super Escola
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'rgba(147,197,253,0.75)',
                  marginTop: 2,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 500,
                }}>
                  Instalar aplicação
                </div>
              </div>
            </div>
            <button className="pwa-close-btn" onClick={dismiss} title="Fechar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Description */}
          {installed ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 10,
              marginBottom: 16,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span style={{ fontSize: 13, color: '#4ADE80', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600 }}>
                Instalado com sucesso!
              </span>
            </div>
          ) : (
            <p style={{
              fontSize: 13,
              color: 'rgba(203,213,225,0.8)',
              lineHeight: 1.6,
              margin: '0 0 16px 0',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              Adicione o SIGA ao seu dispositivo para acesso rápido, offline e sem abrir o browser.
            </p>
          )}

          {/* Feature pills */}
          {!installed && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
              {[
                { icon: '⚡', label: 'Acesso rápido' },
                { icon: '📶', label: 'Funciona offline' },
                { icon: '🔔', label: 'Notificações' },
              ].map(({ icon, label }) => (
                <div key={label} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.18)',
                  borderRadius: 20,
                  fontSize: 11.5,
                  color: 'rgba(147,197,253,0.9)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 500,
                }}>
                  <span>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {!installed && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="pwa-install-btn"
                onClick={handleInstall}
                disabled={installing}
                style={{ flex: 1, opacity: installing ? 0.7 : 1 }}
              >
                {installing ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    A instalar...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Instalar
                  </span>
                )}
              </button>
              <button className="pwa-dismiss-btn" onClick={dismiss}>
                Agora não
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
