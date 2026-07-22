import React, { useState } from "react";
import { 
  ArrowLeft, Search, Printer, Download, CreditCard, CalendarDays, Wallet, 
  AlertCircle, Receipt, ArrowRight, User
} from "lucide-react";

export default function Redesign() {
  const [activeTab, setActiveTab] = useState("propinas");

  // Mock Data
  const months = [
    { id: 1, name: "SETEMBRO", status: "EM ATRASO" },
    { id: 2, name: "OUTUBRO", status: "EM ATRASO", isCurrent: true },
    { id: 3, name: "NOVEMBRO", status: "EM ATRASO" },
    { id: 4, name: "DEZEMBRO", status: "EM ATRASO" },
    { id: 5, name: "JANEIRO", status: "EM ATRASO" },
    { id: 6, name: "FEVEREIRO", status: "EM ATRASO" },
    { id: 7, name: "MARÇO", status: "EM ATRASO" },
    { id: 8, name: "ABRIL", status: "EM ATRASO" },
    { id: 9, name: "MAIO", status: "EM ATRASO" },
    { id: 10, name: "JUNHO", status: "EM ATRASO" },
    { id: 11, name: "JULHO", status: "EM ATRASO" },
  ];

  const rubricas = [
    { id: 1, name: "Matrícula", amount: "15.000 Kz", type: "Anual", status: "EM ATRASO", gradient: "from-purple-400 to-purple-600" },
    { id: 2, name: "Material Didáctico", amount: "8.500 Kz", type: "Anual", status: "EM ATRASO", gradient: "from-blue-400 to-blue-600" },
    { id: 3, name: "Cartão de Estudante", amount: "2.500 Kz", type: "Único", status: "EM ATRASO", gradient: "from-green-400 to-green-600" },
  ];

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#e2e8f0] font-sans pb-20 selection:bg-blue-500/30">
      {/* Top Toolbar */}
      <header className="sticky top-0 z-30 bg-[#0f1117]/80 backdrop-blur-md border-b border-[#2a2d3e] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-[#1a1d2e] rounded-full transition-colors text-[#64748b] hover:text-[#e2e8f0]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="text-xs font-medium text-[#64748b] flex items-center gap-1.5 mb-0.5">
              <span>Financeiro</span>
              <ArrowRight className="w-3 h-3" />
              <span className="text-blue-400">Caderneta</span>
            </div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-3">
              Caderneta de Propinas / Rubricas
              <span className="text-xs font-medium bg-[#1a1d2e] border border-[#2a2d3e] px-2 py-0.5 rounded text-[#64748b]">
                Ano Lectivo 2025/2026
              </span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#e2e8f0] hover:text-white bg-[#1a1d2e] border border-[#2a2d3e] hover:border-[#64748b] rounded-md transition-all shadow-sm">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#0f1117] bg-white hover:bg-[#e2e8f0] rounded-md transition-all shadow-md">
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Imprimir Resumo</span>
          </button>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col gap-8">
        
        {/* Search */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-[#64748b] group-focus-within:text-blue-500 transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-3 bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm text-sm"
            placeholder="Pesquisar aluno por nome ou nº de matrícula..."
            defaultValue="Eduardo Lima"
          />
        </div>

        {/* Student Hero Card */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden shadow-lg">
          {/* Subtle blue gradient left border */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#3b82f6] to-blue-700" />
          
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#3b82f6] to-blue-800 flex items-center justify-center text-white text-xl font-bold shadow-inner ring-4 ring-[#0f1117]">
              EL
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Eduardo Lima</h2>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2.5 py-1 text-xs font-medium bg-[#0f1117] border border-[#2a2d3e] rounded-full text-[#e2e8f0]">
                  6ª A — EN
                </span>
                <span className="px-2.5 py-1 text-xs font-medium bg-[#0f1117] border border-[#2a2d3e] rounded-full text-[#e2e8f0]">
                  Turma: Manhã
                </span>
                <span className="px-2.5 py-1 text-xs font-medium bg-[#0f1117] border border-[#2a2d3e] rounded-full text-[#e2e8f0]">
                  Sala: 1
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-[#64748b]">
                <div className="flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span>Matrícula: EN6005</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  <span>Ano Lectivo: 2025/2026</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 bg-[#0f1117] p-4 rounded-xl border border-[#2a2d3e] min-w-[140px]">
            {/* Simple QR placeholder */}
            <svg viewBox="0 0 100 100" className="w-16 h-16 opacity-80 text-[#e2e8f0]" fill="currentColor">
              <path d="M0 0h30v30H0zM10 10h10v10H10zM70 0h30v30H70zM80 10h10v10H80zM0 70h30v30H0zM10 80h10v10H10zM40 0h20v10H40zM40 20h20v10H40zM40 40h20v20H40zM0 40h20v20H0zM80 40h20v20H80zM40 80h20v20H40zM70 70h10v10H70zM90 70h10v10H90zM70 90h10v10H70zM90 90h10v10H90z" />
            </svg>
            <div className="flex items-center gap-1.5 text-[#ef4444] font-bold text-xs bg-[#ef4444]/10 px-2.5 py-1 rounded-full border border-[#ef4444]/20">
              <AlertCircle className="w-3.5 h-3.5" />
              EM ATRASO
            </div>
          </div>
        </div>

        {/* Financial Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#1a1d2e] border border-[#2a2d3e] border-t-[#22c55e] border-t-2 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <CalendarDays className="w-5 h-5 text-[#22c55e] opacity-80" />
            </div>
            <div className="text-2xl font-bold text-white mb-1">0 <span className="text-lg text-[#64748b] font-medium">/ 11</span></div>
            <div className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Meses Pagos</div>
          </div>
          
          <div className="bg-[#1a1d2e] border border-[#2a2d3e] border-t-[#ef4444] border-t-2 rounded-xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-5 right-5 w-2 h-2 rounded-full bg-[#ef4444] animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-5 h-5 text-[#ef4444] opacity-80" />
            </div>
            <div className="text-2xl font-bold text-white mb-1">11</div>
            <div className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Em Atraso</div>
          </div>

          <div className="bg-[#1a1d2e] border border-[#2a2d3e] border-t-[#3b82f6] border-t-2 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <Wallet className="w-5 h-5 text-[#3b82f6] opacity-80" />
            </div>
            <div className="text-2xl font-bold text-white mb-1">0 <span className="text-lg text-[#64748b] font-medium">Kz</span></div>
            <div className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Total Pago</div>
          </div>

          <div className="bg-[#1a1d2e] border border-[#2a2d3e] border-t-[#f97316] border-t-2 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <Receipt className="w-5 h-5 text-[#f97316] opacity-80" />
            </div>
            <div className="text-2xl font-bold text-white mb-1">26.000 <span className="text-lg text-[#64748b] font-medium">Kz</span></div>
            <div className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Pendente (Rubricas)</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3 text-sm">
            <span className="font-medium text-[#e2e8f0]">Progresso anual de pagamentos (Propinas)</span>
            <span className="font-bold text-[#64748b]">0%</span>
          </div>
          <div className="h-2 w-full bg-[#0f1117] rounded-full overflow-hidden border border-[#2a2d3e]">
            <div className="h-full bg-[#22c55e] w-[0%] rounded-full transition-all duration-1000" />
          </div>
          <div className="flex justify-between mt-3 text-xs text-[#64748b]">
            <span>0 meses pagos</span>
            <span>11 meses total</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-[#2a2d3e] pb-px overflow-x-auto">
          <button 
            onClick={() => setActiveTab("propinas")}
            className={`px-6 py-3 text-sm font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "propinas" 
                ? "border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10" 
                : "border-transparent text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1a1d2e]"
            }`}
          >
            <span className="flex items-center gap-2">📅 Propinas <span className="px-1.5 py-0.5 rounded-md bg-[#0f1117] text-xs">11</span></span>
          </button>
          <button 
            onClick={() => setActiveTab("rubricas")}
            className={`px-6 py-3 text-sm font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "rubricas" 
                ? "border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10" 
                : "border-transparent text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1a1d2e]"
            }`}
          >
            <span className="flex items-center gap-2">🧾 Rubricas <span className="px-1.5 py-0.5 rounded-md bg-[#0f1117] text-xs">0 / 3</span></span>
          </button>
          <button 
            className={`px-6 py-3 text-sm font-semibold rounded-t-lg transition-colors border-b-2 border-transparent text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1a1d2e] whitespace-nowrap`}
          >
            <span className="flex items-center gap-2">⊕ Combinado</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="transition-opacity duration-300">
          {activeTab === "propinas" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {months.map((month) => (
                <div 
                  key={month.id} 
                  className={`group relative bg-[#1a1d2e] rounded-xl p-5 border transition-all hover:shadow-lg ${
                    month.isCurrent 
                      ? "border-[#f59e0b]/50 shadow-[0_0_15px_rgba(245,158,11,0.1)] ring-1 ring-[#f59e0b]/20" 
                      : month.status === "EM ATRASO" 
                        ? "border-[#ef4444]/30 hover:border-[#ef4444]/50" 
                        : "border-[#2a2d3e]"
                  }`}
                >
                  {month.status === "EM ATRASO" && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#ef4444]/80 rounded-l-xl" />
                  )}
                  {month.isCurrent && (
                    <div className="absolute -top-3 right-4 bg-[#f59e0b] text-[#0f1117] text-[10px] font-black px-2.5 py-1 rounded shadow-sm tracking-wider uppercase border border-[#f59e0b]">
                      Mês Actual
                    </div>
                  )}
                  
                  <h3 className="text-lg font-bold text-white mb-3">{month.name}</h3>
                  
                  <div className="flex items-center gap-1.5 mb-5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#ef4444]" />
                    <span className="text-xs font-bold text-[#ef4444] tracking-wide bg-[#ef4444]/10 px-2 py-0.5 rounded border border-[#ef4444]/20">
                      EM ATRASO
                    </span>
                  </div>

                  <div className="space-y-2.5 mt-auto pt-4 border-t border-[#2a2d3e]/50 text-sm">
                    <div className="flex justify-between items-center text-[#64748b]">
                      <span className="text-xs font-medium">Valor</span>
                      <span className="font-medium text-[#e2e8f0]">--</span>
                    </div>
                    <div className="flex justify-between items-center text-[#64748b]">
                      <span className="text-xs font-medium">Data</span>
                      <span className="font-medium text-[#e2e8f0]">--</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "rubricas" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {rubricas.map((rubrica) => (
                <div 
                  key={rubrica.id} 
                  className={`bg-[#1a1d2e] rounded-xl p-5 border border-[#2a2d3e] relative overflow-hidden flex flex-col`}
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${rubrica.gradient}`} />
                  
                  <div className="flex justify-between items-start mb-5 pl-2">
                    <div>
                      <h3 className="font-bold text-[#e2e8f0] mb-2">{rubrica.name}</h3>
                      <span className="text-[10px] uppercase font-bold text-[#64748b] bg-[#0f1117] px-2.5 py-1 rounded border border-[#2a2d3e]">
                        {rubrica.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#ef4444] bg-[#ef4444]/10 px-2 py-1 rounded-md border border-[#ef4444]/20">
                      <AlertCircle className="w-3.5 h-3.5" />
                      EM ATRASO
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-[#2a2d3e] pl-2">
                    <div className="text-[10px] text-[#64748b] mb-1 font-bold uppercase tracking-wide">Valor a Pagar</div>
                    <div className="text-xl font-black text-white">{rubrica.amount}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Print Actions Bottom */}
        <div className="mt-4 flex flex-wrap gap-3 justify-end items-center border-t border-[#2a2d3e] pt-6">
          <button className="px-5 py-2.5 text-sm font-semibold text-[#e2e8f0] bg-[#1a1d2e] border border-[#2a2d3e] hover:border-[#64748b] hover:bg-[#2a2d3e]/50 rounded-lg transition-all flex items-center gap-2 shadow-sm">
            <Printer className="w-4 h-4" />
            Imprimir Rubricas
          </button>
          <button className="px-5 py-2.5 text-sm font-semibold text-[#e2e8f0] bg-[#1a1d2e] border border-[#2a2d3e] hover:border-[#64748b] hover:bg-[#2a2d3e]/50 rounded-lg transition-all flex items-center gap-2 shadow-sm">
            <Printer className="w-4 h-4" />
            Imprimir Caderneta
          </button>
          <button className="px-6 py-2.5 text-sm font-bold text-[#0f1117] bg-white hover:bg-slate-200 border border-transparent rounded-lg transition-all flex items-center gap-2 shadow-md">
            <Printer className="w-4 h-4" />
            Imprimir Completo
          </button>
        </div>

      </main>
    </div>
  );
}
