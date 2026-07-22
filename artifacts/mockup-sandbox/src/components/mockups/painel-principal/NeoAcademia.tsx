import React from 'react';
import { 
  Menu, ArrowLeft, Home, Bell, Cloud, 
  Users, GraduationCap, LayoutGrid, Building, 
  BarChart, Activity, BrainCircuit, ChevronRight,
  Wifi
} from 'lucide-react';

const NeoAcademia = () => {
  return (
    <div className="min-h-screen bg-[#0D1F35] text-[#E8EEF6] font-sans overflow-x-hidden selection:bg-[#4A90D9] selection:text-white">
      {/* Header Row 1 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white/60">
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Menu size={20} /></button>
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Home size={20} /></button>
          </div>
          <div className="h-6 w-px bg-white/10 mx-2"></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#E8EEF6]">Painel Principal</h1>
            <p className="text-[#C89A2A] italic text-sm mt-0.5">✦ Bom dia — O sucesso começa cedo — parabéns!</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block text-white/60 text-sm">
            07:48:48 / Quarta 01/07
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors relative text-white/60 hover:text-[#E8EEF6]">
              <Cloud size={20} />
            </button>
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors relative text-white/60 hover:text-[#E8EEF6]">
              <Bell size={20} />
              <span className="absolute top-1 right-1 h-4 min-w-[16px] px-1 bg-[#D4920E] text-[#E8EEF6] text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#0D1F35]">
                70
              </span>
            </button>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white/60 uppercase tracking-wider">BOM DIA</div>
              <div className="text-sm font-medium text-[#E8EEF6]">Osvaldo Queta</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#4A90D9] to-[#1E3A5F] border-2 border-white/10 shadow-lg flex items-center justify-center text-lg font-bold text-[#E8EEF6]">
              OQ
            </div>
          </div>
        </div>
      </div>

      {/* Header Row 2 - Gradient band */}
      <div className="bg-gradient-to-r from-[#1E3A5F] to-[#122540] px-6 py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-[#C89A2A]/10 text-[#C89A2A] text-xs font-bold uppercase tracking-wider rounded border border-[#C89A2A]/20">
            CEO — Controlo Total
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/80">
          <span>2025-2026 · Ano Activo</span>
          <span className="h-2 w-2 rounded-full bg-[#22C47A] shadow-[0_0_8px_rgba(34,196,122,0.6)] animate-pulse"></span>
        </div>
      </div>

      <div className="p-6 max-w-[1400px] mx-auto space-y-8 pb-20">
        
        {/* KPI Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.15em]">Indicadores Principais</h2>
            <button className="text-xs text-[#4A90D9] hover:text-[#E8EEF6] transition-colors font-medium">
              Ocultar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPI 1 */}
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] p-[18px] relative overflow-hidden group hover:border-[#3E9BD4]/30 transition-colors shadow-lg shadow-black/20">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#3E9BD4]"></div>
              <div className="absolute top-4 right-4 text-[#3E9BD4]/50 group-hover:translate-x-1 transition-transform">
                <ChevronRight size={20} />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-[#3E9BD4]/10 text-[#3E9BD4] flex items-center justify-center shrink-0">
                  <Users size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[32px] font-bold text-[#3E9BD4] leading-none mb-1">222</div>
                  <div className="text-[13px] text-[#E8EEF6] font-medium leading-none mb-1">Alunos</div>
                  <div className="text-[11px] text-white/35">Total matriculados</div>
                </div>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] p-[18px] relative overflow-hidden group hover:border-[#C89A2A]/30 transition-colors shadow-lg shadow-black/20">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#C89A2A]"></div>
              <div className="absolute top-4 right-4 text-[#C89A2A]/50 group-hover:translate-x-1 transition-transform">
                <ChevronRight size={20} />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-[#C89A2A]/10 text-[#C89A2A] flex items-center justify-center shrink-0">
                  <GraduationCap size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[32px] font-bold text-[#C89A2A] leading-none mb-1">15</div>
                  <div className="text-[13px] text-[#E8EEF6] font-medium leading-none mb-1">Professores</div>
                  <div className="text-[11px] text-white/35">Corpo docente activo</div>
                </div>
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] p-[18px] relative overflow-hidden group hover:border-[#22C47A]/30 transition-colors shadow-lg shadow-black/20">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#22C47A]"></div>
              <div className="absolute top-4 right-4 text-[#22C47A]/50 group-hover:translate-x-1 transition-transform">
                <ChevronRight size={20} />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-[#22C47A]/10 text-[#22C47A] flex items-center justify-center shrink-0">
                  <LayoutGrid size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[32px] font-bold text-[#22C47A] leading-none mb-1">16</div>
                  <div className="text-[13px] text-[#E8EEF6] font-medium leading-none mb-1">Turmas</div>
                  <div className="text-[11px] text-white/35">Salas configuradas</div>
                </div>
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] p-[18px] relative overflow-hidden group hover:border-[#D4920E]/30 transition-colors shadow-lg shadow-black/20">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#D4920E]"></div>
              <div className="absolute top-4 right-4 text-[#D4920E]/50 group-hover:translate-x-1 transition-transform">
                <ChevronRight size={20} />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-[#D4920E]/10 text-[#D4920E] flex items-center justify-center shrink-0">
                  <Building size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[32px] font-bold text-[#D4920E] leading-none mb-1">41%</div>
                  <div className="text-[13px] text-[#E8EEF6] font-medium leading-none mb-1">Ocupação</div>
                  <div className="text-[11px] text-white/35">Capacidade da escola</div>
                </div>
              </div>
            </div>

            {/* KPI 5 */}
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] p-[18px] relative overflow-hidden group hover:border-[#22C47A]/30 transition-colors shadow-lg shadow-black/20">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#22C47A]"></div>
              <div className="absolute top-4 right-4 text-[#22C47A]/50 group-hover:translate-x-1 transition-transform">
                <ChevronRight size={20} />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-[#22C47A]/10 text-[#22C47A] flex items-center justify-center shrink-0">
                  <BarChart size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[32px] font-bold text-[#22C47A] leading-none mb-1">87%</div>
                  <div className="text-[13px] text-[#E8EEF6] font-medium leading-none mb-1">Aprovação</div>
                  <div className="text-[11px] text-white/35">Taxa de sucesso</div>
                </div>
              </div>
            </div>

            {/* KPI 6 */}
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] p-[18px] relative overflow-hidden group hover:border-[#4A90D9]/30 transition-colors shadow-lg shadow-black/20">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#4A90D9]"></div>
              <div className="absolute top-4 right-4 text-[#4A90D9]/50 group-hover:translate-x-1 transition-transform">
                <ChevronRight size={20} />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-[#4A90D9]/10 text-[#4A90D9] flex items-center justify-center shrink-0">
                  <Activity size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[32px] font-bold text-[#4A90D9] leading-none mb-1">13.2</div>
                  <div className="text-[13px] text-[#E8EEF6] font-medium leading-none mb-1">Média Geral</div>
                  <div className="text-[11px] text-white/35">Desempenho escolar</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Two column layout for bottom section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* AI Assistant Section */}
          <section className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 bg-[#8B5CF6] rounded-full"></div>
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.15em]">Assistente IA</h2>
              </div>
              <button className="text-[11px] bg-[#8B5CF6]/10 text-[#8B5CF6] hover:bg-[#8B5CF6]/20 transition-colors font-bold px-3 py-1 rounded">
                Abrir
              </button>
            </div>
            
            <div className="bg-[#122540] rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 flex-1 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#8B5CF6]"></div>
              
              <div className="p-5">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-black/20 border border-white/5 flex items-center justify-center relative">
                      <BrainCircuit size={24} className="text-white/40" />
                      <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-[#D94F4F] rounded-full border-2 border-[#122540] animate-pulse"></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[#D94F4F] font-bold text-sm">Inactivo</span>
                      </div>
                      <div className="text-[13px] text-[#E8EEF6]/80 mb-0.5">Nenhuma chave de API configurada</div>
                      <div className="text-[11px] text-white/35">Modelo: OpenAI GPT-4 Não detectado</div>
                    </div>
                  </div>
                  <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-white/30 animate-spin"></div>
                </div>

                <hr className="border-white/5 my-5" />

                {/* Feedback Subsection */}
                <div>
                  <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3 text-center">Feedback dos Utilizadores</h3>
                  
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-[#22C47A]/5 border border-[#22C47A]/10 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">👍</div>
                      <div className="text-lg font-bold text-[#22C47A]">5</div>
                      <div className="text-[10px] text-white/40 font-medium uppercase mt-1 tracking-wide">Positivas</div>
                    </div>
                    <div className="bg-[#D94F4F]/5 border border-[#D94F4F]/10 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">👎</div>
                      <div className="text-lg font-bold text-[#D94F4F]">1</div>
                      <div className="text-[10px] text-white/40 font-medium uppercase mt-1 tracking-wide">Negativas</div>
                    </div>
                    <div className="bg-[#8B5CF6]/5 border border-[#8B5CF6]/10 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">⭐</div>
                      <div className="text-lg font-bold text-[#8B5CF6]">83%</div>
                      <div className="text-[10px] text-white/40 font-medium uppercase mt-1 tracking-wide">Satisfação</div>
                    </div>
                  </div>

                  <div className="bg-black/20 h-2 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full bg-gradient-to-r from-[#22C47A] to-[#22C47A]/70 w-[83%] rounded-full"></div>
                  </div>
                  <div className="text-[11px] text-white/35 text-center mt-3">
                    6 avaliações no total
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Active Sessions Section */}
          <section className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 bg-[#3E9BD4] rounded-full"></div>
                <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.15em]">Sessões Activas</h2>
              </div>
              <button className="text-[11px] text-[#3E9BD4] hover:text-[#E8EEF6] transition-colors font-medium underline underline-offset-2">
                Ver detalhes
              </button>
            </div>

            <button className="w-full text-left bg-[#122540] rounded-2xl border border-white/[0.06] p-5 relative overflow-hidden group hover:border-[#3E9BD4]/30 hover:bg-[#1A334F] transition-all shadow-lg shadow-black/20 flex-1">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#3E9BD4]"></div>
              <div className="absolute top-5 right-5 text-[#3E9BD4]/50 group-hover:translate-x-1 group-hover:text-[#3E9BD4] transition-all">
                <ChevronRight size={20} />
              </div>
              
              <div className="flex items-center gap-4 mb-5">
                <div className="h-12 w-12 rounded-full bg-[#3E9BD4]/10 text-[#3E9BD4] flex items-center justify-center shrink-0 border border-[#3E9BD4]/20 relative">
                  <Wifi size={24} />
                  <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-[#22C47A] rounded-full border-2 border-[#122540] animate-pulse"></div>
                </div>
                <div>
                  <div className="text-lg font-bold text-[#E8EEF6] mb-1 group-hover:text-[#E8EEF6] transition-colors">3 utilizadores online</div>
                  <div className="text-xs text-white/40">Sistema a monitorizar actividades</div>
                </div>
              </div>

              <div className="flex gap-2">
                <span className="px-2.5 py-1 bg-[#22C47A]/10 text-[#22C47A] text-[11px] font-bold rounded border border-[#22C47A]/20">
                  3 online agora
                </span>
                <span className="px-2.5 py-1 bg-[#D4920E]/10 text-[#D4920E] text-[11px] font-bold rounded border border-[#D4920E]/20">
                  X inactivos
                </span>
              </div>
            </button>
          </section>

        </div>
      </div>
    </div>
  );
};

export default NeoAcademia;
