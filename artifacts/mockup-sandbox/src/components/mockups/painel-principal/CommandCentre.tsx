import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  ChevronRight, 
  ChevronDown, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Percent, 
  CheckCircle, 
  Award, 
  Sparkles, 
  Activity, 
  ThumbsUp, 
  ThumbsDown, 
  Heart,
  Wifi,
  Monitor
} from 'lucide-react';

export default function CommandCentre() {
  const [time, setTime] = useState('07:48:48 / Quarta, 01/07');

  return (
    <div className="min-h-screen bg-[#0D1F35] text-[#E8EEF6] font-sans selection:bg-[#4A90D9] selection:text-white pb-8">
      <style>{`
        .glass-panel {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.10);
          backdrop-filter: blur(10px);
        }
        .pulse-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid #8B5CF6;
          animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes ping-slow {
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>

      {/* STICKY HEADER */}
      <header className="sticky top-0 z-50 glass-panel border-x-0 border-t-0 flex items-center justify-between px-6 py-3 bg-[#0D1F35]/80">
        <div className="flex items-center gap-4">
          <div className="bg-[#C89A2A]/20 text-[#E8C060] border border-[#C89A2A]/30 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#C89A2A] animate-pulse"></div>
            CEO — Controlo Total
          </div>
          <div className="font-semibold text-[#E8EEF6]">Super Escola</div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
          <h1 className="text-lg font-bold tracking-wide">Painel Principal</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="font-mono text-sm text-[rgba(232,238,246,0.62)] hidden sm:block">
            {time}
          </div>
          
          <div className="relative">
            <Bell className="w-5 h-5 text-[rgba(232,238,246,0.62)] hover:text-white transition-colors cursor-pointer" />
            <span className="absolute -top-1.5 -right-1.5 bg-[#D94F4F] text-white text-[10px] font-bold px-1.5 rounded-full border-2 border-[#0D1F35]">
              70
            </span>
          </div>

          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#4A90D9] flex items-center justify-center font-bold text-sm border border-[rgba(255,255,255,0.15)] shadow-[0_0_10px_rgba(74,144,217,0.3)] cursor-pointer hover:opacity-90 transition-opacity">
            OQ
          </div>
        </div>
      </header>

      {/* HERO BANNER */}
      <div className="w-full bg-gradient-to-r from-[#1E3A5F] to-[#0D1F35] border-b border-[rgba(255,255,255,0.08)] px-8 py-6 shadow-inner relative overflow-hidden">
        {/* Abstract decor background */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[rgba(74,144,217,0.15)] via-transparent to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <h2 className="text-[#C89A2A] text-2xl md:text-3xl font-bold tracking-tight">
            Bom dia — O sucesso começa cedo — parabéns!
          </h2>
          <p className="text-[rgba(232,238,246,0.62)] mt-1.5 text-sm md:text-base">
            Ano Lectivo 2025-2026 <span className="mx-2 opacity-30">|</span> Visão Global da Instituição
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-8 flex flex-col gap-8">
        
        {/* KPI SECTION */}
        <section>
          <div className="flex items-center gap-2 mb-4 cursor-pointer group w-fit">
            <ChevronDown className="w-5 h-5 text-[rgba(232,238,246,0.62)] group-hover:text-white transition-colors" />
            <h3 className="text-sm font-bold tracking-widest text-[rgba(232,238,246,0.62)] group-hover:text-white transition-colors">
              INDICADORES PRINCIPAIS
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* KPI 1: Alunos */}
            <div className="glass-panel rounded-2xl relative overflow-hidden flex flex-col h-32 hover:bg-[rgba(255,255,255,0.06)] transition-all duration-300 cursor-pointer group">
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="bg-[#3E9BD4]/20 text-[#3E9BD4] p-1.5 rounded-lg border border-[#3E9BD4]/10">
                    <Users className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-[rgba(232,238,246,0.35)] group-hover:text-[rgba(232,238,246,0.8)] group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <div className="text-[#3E9BD4] text-4xl font-bold font-mono tracking-tight drop-shadow-[0_0_8px_rgba(62,155,212,0.3)]">222</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-xs text-[rgba(232,238,246,0.8)] font-medium tracking-wide">Alunos</div>
                    <div className="text-[10px] text-[rgba(232,238,246,0.4)]">Matriculados</div>
                  </div>
                </div>
              </div>
              <div className="h-1 w-full bg-[#3E9BD4] shadow-[0_0_12px_#3E9BD4]" />
            </div>

            {/* KPI 2: Professores */}
            <div className="glass-panel rounded-2xl relative overflow-hidden flex flex-col h-32 hover:bg-[rgba(255,255,255,0.06)] transition-all duration-300 cursor-pointer group">
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="bg-[#C89A2A]/20 text-[#C89A2A] p-1.5 rounded-lg border border-[#C89A2A]/10">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-[rgba(232,238,246,0.35)] group-hover:text-[rgba(232,238,246,0.8)] group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <div className="text-[#C89A2A] text-4xl font-bold font-mono tracking-tight drop-shadow-[0_0_8px_rgba(200,154,42,0.3)]">15</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-xs text-[rgba(232,238,246,0.8)] font-medium tracking-wide">Professores</div>
                    <div className="text-[10px] text-[rgba(232,238,246,0.4)]">Corpo docente</div>
                  </div>
                </div>
              </div>
              <div className="h-1 w-full bg-[#C89A2A] shadow-[0_0_12px_#C89A2A]" />
            </div>

            {/* KPI 3: Turmas */}
            <div className="glass-panel rounded-2xl relative overflow-hidden flex flex-col h-32 hover:bg-[rgba(255,255,255,0.06)] transition-all duration-300 cursor-pointer group">
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="bg-[#22C47A]/20 text-[#22C47A] p-1.5 rounded-lg border border-[#22C47A]/10">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-[rgba(232,238,246,0.35)] group-hover:text-[rgba(232,238,246,0.8)] group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <div className="text-[#22C47A] text-4xl font-bold font-mono tracking-tight drop-shadow-[0_0_8px_rgba(34,196,122,0.3)]">16</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-xs text-[rgba(232,238,246,0.8)] font-medium tracking-wide">Turmas</div>
                    <div className="text-[10px] text-[rgba(232,238,246,0.4)]">Em funcionamento</div>
                  </div>
                </div>
              </div>
              <div className="h-1 w-full bg-[#22C47A] shadow-[0_0_12px_#22C47A]" />
            </div>

            {/* KPI 4: Ocupação */}
            <div className="glass-panel rounded-2xl relative overflow-hidden flex flex-col h-32 hover:bg-[rgba(255,255,255,0.06)] transition-all duration-300 cursor-pointer group">
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="bg-[#D4920E]/20 text-[#D4920E] p-1.5 rounded-lg border border-[#D4920E]/10">
                    <Percent className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-[rgba(232,238,246,0.35)] group-hover:text-[rgba(232,238,246,0.8)] group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <div className="text-[#D4920E] text-4xl font-bold font-mono tracking-tight drop-shadow-[0_0_8px_rgba(212,146,14,0.3)]">41%</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-xs text-[rgba(232,238,246,0.8)] font-medium tracking-wide">Ocupação</div>
                    <div className="text-[10px] text-[rgba(232,238,246,0.4)] text-[#D4920E]/80">Abaixo do ideal</div>
                  </div>
                </div>
              </div>
              <div className="h-1 w-full bg-[#D4920E] shadow-[0_0_12px_#D4920E]" />
            </div>

            {/* KPI 5: Aprovação */}
            <div className="glass-panel rounded-2xl relative overflow-hidden flex flex-col h-32 hover:bg-[rgba(255,255,255,0.06)] transition-all duration-300 cursor-pointer group">
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="bg-[#22C47A]/20 text-[#22C47A] p-1.5 rounded-lg border border-[#22C47A]/10">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-[rgba(232,238,246,0.35)] group-hover:text-[rgba(232,238,246,0.8)] group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <div className="text-[#22C47A] text-4xl font-bold font-mono tracking-tight drop-shadow-[0_0_8px_rgba(34,196,122,0.3)]">87%</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-xs text-[rgba(232,238,246,0.8)] font-medium tracking-wide">Aprovação</div>
                    <div className="text-[10px] text-[rgba(232,238,246,0.4)]">Taxa global</div>
                  </div>
                </div>
              </div>
              <div className="h-1 w-full bg-[#22C47A] shadow-[0_0_12px_#22C47A]" />
            </div>

            {/* KPI 6: Média Geral */}
            <div className="glass-panel rounded-2xl relative overflow-hidden flex flex-col h-32 hover:bg-[rgba(255,255,255,0.06)] transition-all duration-300 cursor-pointer group">
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="bg-[#4A90D9]/20 text-[#4A90D9] p-1.5 rounded-lg border border-[#4A90D9]/10">
                    <Award className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-[rgba(232,238,246,0.35)] group-hover:text-[rgba(232,238,246,0.8)] group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <div className="text-[#4A90D9] text-4xl font-bold font-mono tracking-tight drop-shadow-[0_0_8px_rgba(74,144,217,0.3)]">13.2</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-xs text-[rgba(232,238,246,0.8)] font-medium tracking-wide">Média Geral</div>
                    <div className="text-[10px] text-[rgba(232,238,246,0.4)]">Valores (0-20)</div>
                  </div>
                </div>
              </div>
              <div className="h-1 w-full bg-[#4A90D9] shadow-[0_0_12px_#4A90D9]" />
            </div>
          </div>
        </section>

        {/* BOTTOM WIDGETS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          
          {/* AI ASSISTANT */}
          <section className="glass-panel rounded-2xl overflow-hidden flex flex-col">
            <div className="bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.05)] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-4 bg-[#8B5CF6] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                <h3 className="font-semibold text-sm tracking-wide">Assistente IA</h3>
              </div>
              <a href="#" className="text-[#8B5CF6] text-xs font-bold uppercase tracking-wider hover:text-[#A78BFA] transition-colors flex items-center gap-1">
                Abrir <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            
            <div className="p-6">
              <div className="flex items-start md:items-center gap-5 flex-col md:flex-row">
                <div className="relative shrink-0 mx-auto md:mx-0">
                  <div className="pulse-ring"></div>
                  <div className="w-16 h-16 bg-[#1A334F] rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)] relative z-10 shadow-lg">
                    <Sparkles className="w-7 h-7 text-[#8B5CF6]" />
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#D94F4F] border-2 border-[#122540] rounded-full z-20 shadow-[0_0_5px_rgba(217,79,79,0.5)]"></div>
                </div>
                <div className="text-center md:text-left">
                  <div className="flex flex-col md:flex-row items-center md:items-baseline gap-2">
                    <span className="text-xl font-bold tracking-tight">Inactivo</span>
                    <span className="bg-[#D94F4F]/10 text-[#D94F4F] text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-[#D94F4F]/20">
                      OFFLINE
                    </span>
                  </div>
                  <p className="text-[rgba(232,238,246,0.62)] text-sm mt-1.5 leading-relaxed">
                    Nenhuma chave de API configurada. O assistente inteligente não pode processar pedidos até ser activado no painel de controlo.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[rgba(255,255,255,0.05)] p-6 bg-[rgba(0,0,0,0.15)] flex-1 flex flex-col justify-end">
              <h4 className="text-[10px] font-bold tracking-[0.2em] text-[rgba(232,238,246,0.4)] mb-4 uppercase">
                Feedback dos Utilizadores
              </h4>
              
              <div className="flex gap-3 mb-5">
                <div className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                  <div className="text-[#22C47A] flex items-center gap-1.5">
                    <ThumbsUp className="w-4 h-4" />
                    <span className="font-bold text-xl font-mono">5</span>
                  </div>
                  <span className="text-[10px] text-[rgba(232,238,246,0.62)] uppercase tracking-wider font-medium">Positivas</span>
                </div>
                
                <div className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                  <div className="text-[#D94F4F] flex items-center gap-1.5">
                    <ThumbsDown className="w-4 h-4" />
                    <span className="font-bold text-xl font-mono">1</span>
                  </div>
                  <span className="text-[10px] text-[rgba(232,238,246,0.62)] uppercase tracking-wider font-medium">Negativas</span>
                </div>
                
                <div className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                  <div className="text-[#8B5CF6] flex items-center gap-1.5">
                    <Heart className="w-4 h-4" />
                    <span className="font-bold text-xl font-mono">83%</span>
                  </div>
                  <span className="text-[10px] text-[rgba(232,238,246,0.62)] uppercase tracking-wider font-medium">Satisfação</span>
                </div>
              </div>

              <div className="w-full bg-[#1A334F] h-1.5 rounded-full overflow-hidden mb-2 relative">
                <div className="bg-gradient-to-r from-[#8B5CF6] to-[#22C47A] h-full shadow-[0_0_10px_rgba(34,196,122,0.5)]" style={{ width: '83%' }}></div>
              </div>
              <p className="text-[10px] text-[rgba(232,238,246,0.4)] text-right font-medium">
                6 avaliações no total (últimos 30 dias)
              </p>
            </div>
          </section>

          {/* ACTIVE SESSIONS */}
          <section className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full">
            <div className="bg-[rgba(255,255,255,0.02)] border-b border-[rgba(255,255,255,0.05)] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-4 bg-[#06B6D4] rounded-full shadow-[0_0_8px_rgba(6,182,212,0.5)]"></div>
                <h3 className="font-semibold text-sm tracking-wide">Sessões Activas</h3>
              </div>
              <a href="#" className="text-[#06B6D4] text-xs font-bold uppercase tracking-wider hover:text-[#22D3EE] transition-colors flex items-center gap-1">
                Ver detalhes <ChevronRight className="w-3 h-3" />
              </a>
            </div>
            
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/20 rounded-xl flex items-center justify-center shadow-inner">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold font-mono tracking-tight text-white flex items-center gap-3">
                      3
                      <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C47A] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#22C47A] shadow-[0_0_5px_#22C47A]"></span>
                      </span>
                    </div>
                    <div className="text-xs text-[rgba(232,238,246,0.62)] mt-0.5 font-medium">Utilizadores online agora</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mt-auto">
                {/* Session item 1 */}
                <div className="bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.05)] rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#3E9BD4]/20 text-[#3E9BD4] border border-[#3E9BD4]/30 flex items-center justify-center text-xs font-bold shadow-inner">
                      OQ
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-wide">Osvaldo Queta</div>
                      <div className="text-[10px] text-[rgba(232,238,246,0.4)] flex items-center gap-1.5 mt-0.5">
                        <Monitor className="w-3 h-3" /> Chrome / macOS
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#22C47A]/10 text-[#22C47A] text-[9px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border border-[#22C47A]/20 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22C47A]"></div> Activo
                  </div>
                </div>

                {/* Session item 2 */}
                <div className="bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors border border-[rgba(255,255,255,0.05)] rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#C89A2A]/20 text-[#C89A2A] border border-[#C89A2A]/30 flex items-center justify-center text-xs font-bold shadow-inner">
                      AM
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-wide">Ana Maria</div>
                      <div className="text-[10px] text-[rgba(232,238,246,0.4)] flex items-center gap-1.5 mt-0.5">
                        <Wifi className="w-3 h-3" /> Safari / iOS
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#22C47A]/10 text-[#22C47A] text-[9px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border border-[#22C47A]/20 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22C47A]"></div> Activo
                  </div>
                </div>

                {/* Session item 3 */}
                <div className="bg-[rgba(255,255,255,0.01)] border border-[rgba(255,255,255,0.02)] rounded-xl p-3 flex items-center justify-between opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.6)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-xs font-bold">
                      JP
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-wide text-[rgba(255,255,255,0.8)]">João Paulo</div>
                      <div className="text-[10px] text-[rgba(232,238,246,0.4)] flex items-center gap-1.5 mt-0.5">
                        <Monitor className="w-3 h-3" /> Edge / Windows
                      </div>
                    </div>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.4)] text-[9px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border border-[rgba(255,255,255,0.1)] flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[rgba(255,255,255,0.3)]"></div> Inactivo
                  </div>
                </div>
              </div>

            </div>
          </section>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-8 pt-12 pb-4 text-center">
        <div className="text-[10px] tracking-[0.3em] font-bold text-[rgba(232,238,246,0.2)] uppercase">
          Super Escola v1.03
        </div>
      </footer>
    </div>
  );
}
