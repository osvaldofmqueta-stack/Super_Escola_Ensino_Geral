#!/usr/bin/env python3
import base64, subprocess, os, sys

# Encode director photo
with open("attached_assets/Queta_1784520684171.jpeg", "rb") as f:
    photo_b64 = base64.b64encode(f.read()).decode()

photo_src = f"data:image/jpeg;base64,{photo_b64}"

HTML = f"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

  * {{ margin:0; padding:0; box-sizing:border-box; }}

  body {{
    font-family: 'Inter', Arial, sans-serif;
    background: #0a1628;
    color: #e0e8f0;
    font-size: 13px;
    line-height: 1.5;
  }}

  .page {{
    width: 794px;
    min-height: 1123px;
    background: #0a1628;
    position: relative;
    page-break-after: always;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }}

  /* ── COLORS ── */
  :root {{
    --gold: #f5a623;
    --gold-light: #ffd166;
    --blue-dark: #0a1628;
    --blue-mid: #112240;
    --blue-card: #0d1f3c;
    --blue-card2: #0f2548;
    --accent-green: #00d4a0;
    --accent-purple: #7c3aed;
    --accent-cyan: #00b4d8;
    --accent-red: #ef4444;
    --text-muted: #8ca0b8;
  }}

  /* ── COVER PAGE ── */
  .cover {{
    background: linear-gradient(160deg, #0a1628 0%, #112240 50%, #0a1f3a 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 1123px; padding: 60px 50px; position: relative;
  }}
  .cover-accent-top {{
    position: absolute; top: 0; left: 0; right: 0; height: 6px;
    background: linear-gradient(90deg, #ef4444 0%, #ef4444 33%, #0a1628 33%, #0a1628 66%, #f5a623 66%, #f5a623 100%);
  }}
  .cover-accent-bottom {{
    position: absolute; bottom: 0; left: 0; right: 0; height: 6px;
    background: linear-gradient(90deg, #ef4444 0%, #ef4444 33%, #0a1628 33%, #0a1628 66%, #f5a623 66%, #f5a623 100%);
  }}
  .cover-orb {{
    width: 120px; height: 120px; border-radius: 50%;
    background: radial-gradient(circle, #f5a623 0%, #e8850a 60%, #c4690a 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 42px; font-weight: 900; color: #0a1628;
    box-shadow: 0 0 60px rgba(245,166,35,0.5);
    margin-bottom: 28px;
  }}
  .cover-badge {{
    border: 1px solid #f5a623; color: #f5a623; letter-spacing: 3px;
    font-size: 10px; font-weight: 600; padding: 6px 20px; border-radius: 20px;
    margin-bottom: 24px; text-transform: uppercase;
  }}
  .cover-title {{
    font-size: 52px; font-weight: 900; color: #fff; text-align: center;
    line-height: 1.1; margin-bottom: 8px;
  }}
  .cover-title span {{ color: #f5a623; }}
  .cover-subtitle {{ font-size: 20px; color: #f5a623; font-weight: 600; margin-bottom: 18px; }}
  .cover-desc {{ font-size: 14px; color: #8ca0b8; text-align: center; max-width: 520px; line-height: 1.7; margin-bottom: 40px; }}
  .cover-stats {{
    display: flex; gap: 40px; margin-bottom: 44px;
  }}
  .cover-stat {{ text-align: center; }}
  .cover-stat-n {{ font-size: 36px; font-weight: 900; color: #f5a623; }}
  .cover-stat-l {{ font-size: 10px; color: #8ca0b8; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }}
  .cover-tags {{
    display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 40px;
  }}
  .cover-tag {{
    border: 1px solid #1e3a5f; color: #8ca0b8; font-size: 11px;
    padding: 5px 14px; border-radius: 20px;
  }}
  .cover-footer {{
    position: absolute; bottom: 30px; left: 50px; right: 50px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid #1e3a5f; padding-top: 18px;
  }}
  .cover-footer-left {{ color: #8ca0b8; font-size: 11px; }}
  .cover-footer-center {{ color: #f5a623; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; }}
  .cover-footer-right {{ color: #8ca0b8; font-size: 11px; }}

  /* ── INNER PAGE HEADER ── */
  .page-header {{
    padding: 28px 40px 20px; border-bottom: 1px solid #1a3050;
    display: flex; justify-content: space-between; align-items: center;
  }}
  .page-header-left h2 {{ font-size: 22px; font-weight: 800; color: #fff; }}
  .page-header-left p {{ font-size: 11px; color: #8ca0b8; margin-top: 2px; }}
  .page-badge {{
    font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    padding: 5px 14px; border-radius: 20px; border: 1px solid;
  }}
  .badge-core {{ color: #f5a623; border-color: #f5a623; }}
  .badge-portal {{ color: #00d4a0; border-color: #00d4a0; }}
  .badge-finance {{ color: #00b4d8; border-color: #00b4d8; }}
  .badge-docs {{ color: #7c3aed; border-color: #7c3aed; }}
  .badge-cloud {{ color: #f5a623; border-color: #f5a623; }}
  .badge-support {{ color: #00d4a0; border-color: #00d4a0; }}
  .badge-plans {{ color: #f5a623; border-color: #f5a623; }}
  .badge-infra {{ color: #00b4d8; border-color: #00b4d8; }}
  .badge-team {{ color: #00d4a0; border-color: #00d4a0; }}
  .badge-intro {{ color: #8ca0b8; border-color: #8ca0b8; }}
  .badge-history {{ color: #f5a623; border-color: #f5a623; }}
  .badge-scale {{ color: #00d4a0; border-color: #00d4a0; }}

  /* ── PAGE CONTENT ── */
  .page-content {{ padding: 24px 40px; flex: 1; }}

  /* ── PAGE FOOTER ── */
  .page-footer {{
    padding: 14px 40px; border-top: 1px solid #1a3050;
    display: flex; justify-content: space-between; align-items: center;
  }}
  .page-footer-brand {{ color: #f5a623; font-size: 11px; font-weight: 700; }}
  .page-footer-num {{ color: #8ca0b8; font-size: 11px; }}
  .page-footer-date {{ color: #8ca0b8; font-size: 11px; }}

  /* ── SECTION LABEL ── */
  .section-label {{
    font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase;
    color: #8ca0b8; margin-bottom: 14px; padding-bottom: 6px;
    border-bottom: 1px solid #1a3050;
  }}

  /* ── CARDS GRID ── */
  .cards-3 {{ display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 20px; }}
  .cards-2 {{ display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; margin-bottom: 20px; }}

  .card {{
    background: #0d1f3c; border-radius: 10px; padding: 16px;
    border: 1px solid #1a3050;
  }}
  .card-icon {{ font-size: 22px; margin-bottom: 8px; }}
  .card-title {{ font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 6px; }}
  .card-desc {{ font-size: 11px; color: #8ca0b8; line-height: 1.6; }}
  .card-tags {{ display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }}
  .tag {{
    font-size: 9px; padding: 2px 8px; border-radius: 10px;
    background: #112240; color: #8ca0b8; border: 1px solid #1e3a5f;
  }}

  .card.gold {{ border-color: rgba(245,166,35,0.3); }}
  .card.green {{ border-color: rgba(0,212,160,0.3); }}
  .card.cyan {{ border-color: rgba(0,180,216,0.3); }}
  .card.purple {{ border-color: rgba(124,58,237,0.3); }}

  /* ── HIGHLIGHT BOX ── */
  .highlight-box {{
    background: #0f2548; border-left: 4px solid #f5a623;
    border-radius: 8px; padding: 18px 20px; margin-bottom: 20px;
  }}
  .highlight-box.cyan {{ border-color: #00b4d8; }}
  .highlight-box.green {{ border-color: #00d4a0; }}
  .highlight-box.purple {{ border-color: #7c3aed; }}
  .highlight-box h3 {{ font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 8px; }}
  .highlight-box p {{ font-size: 12px; color: #8ca0b8; line-height: 1.7; }}
  .highlight-box strong {{ color: #f5a623; }}

  /* ── PILARES ── */
  .pilares {{ display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 20px; }}
  .pilar {{
    background: #0d1f3c; border-radius: 10px; padding: 20px 16px; text-align: center;
    border: 1px solid #1a3050;
  }}
  .pilar-icon {{ font-size: 28px; margin-bottom: 10px; }}
  .pilar-title {{ font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 6px; }}
  .pilar-desc {{ font-size: 11px; color: #8ca0b8; line-height: 1.5; }}

  /* ── ROWS (perfis) ── */
  .rows {{ display: flex; flex-direction: column; gap: 10px; }}
  .row-item {{
    background: #0d1f3c; border-radius: 8px; padding: 14px 18px;
    display: flex; align-items: center; gap: 14px; border: 1px solid #1a3050;
  }}
  .row-icon {{ font-size: 22px; width: 36px; flex-shrink: 0; }}
  .row-main {{ flex: 1; }}
  .row-title {{ font-size: 13px; font-weight: 700; color: #fff; }}
  .row-desc {{ font-size: 11px; color: #8ca0b8; margin-top: 2px; line-height: 1.5; }}
  .row-badge {{
    font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    padding: 3px 10px; border-radius: 10px;
  }}
  .rb-gestao {{ background: rgba(245,166,35,0.15); color: #f5a623; }}
  .rb-secretaria {{ background: rgba(0,180,216,0.15); color: #00b4d8; }}
  .rb-pedagogico {{ background: rgba(0,212,160,0.15); color: #00d4a0; }}
  .rb-portal {{ background: rgba(124,58,237,0.15); color: #7c3aed; }}
  .rb-externo {{ background: rgba(245,166,35,0.15); color: #f5a623; }}
  .rb-cloud {{ background: rgba(0,180,216,0.15); color: #00b4d8; }}

  /* ── DIRECTOR BIO ── */
  .director-card {{
    background: #0d1f3c; border-radius: 12px; padding: 28px;
    display: flex; gap: 28px; align-items: flex-start;
    border: 1px solid rgba(245,166,35,0.3); margin-bottom: 20px;
  }}
  .director-photo {{
    width: 130px; height: 160px; border-radius: 10px; object-fit: cover; flex-shrink: 0;
    border: 3px solid #f5a623;
  }}
  .director-info {{ flex: 1; }}
  .director-name {{ font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 4px; }}
  .director-role {{ font-size: 12px; color: #f5a623; font-weight: 600; margin-bottom: 14px; }}
  .director-bio {{ font-size: 12px; color: #8ca0b8; line-height: 1.8; margin-bottom: 14px; }}
  .director-contacts {{ display: flex; flex-direction: column; gap: 7px; }}
  .contact-row {{ display: flex; align-items: center; gap: 10px; }}
  .contact-icon {{ font-size: 15px; width: 22px; }}
  .contact-text {{ font-size: 12px; color: #e0e8f0; }}

  /* ── STATS GRID ── */
  .stats-grid {{ display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }}
  .stat-box {{
    background: #0d1f3c; border-radius: 10px; padding: 20px 14px; text-align: center;
    border: 1px solid #1a3050;
  }}
  .stat-num {{ font-size: 32px; font-weight: 900; color: #f5a623; }}
  .stat-label {{ font-size: 10px; color: #8ca0b8; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px; }}

  .stats-grid-2 {{ display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 20px; }}
  .stat-box-2 {{
    background: #0d1f3c; border-radius: 10px; padding: 16px 14px; text-align: center;
    border: 1px solid #1a3050;
  }}
  .stat-num-2 {{ font-size: 24px; font-weight: 900; color: #00d4a0; }}
  .stat-label-2 {{ font-size: 10px; color: #8ca0b8; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 4px; }}

  /* ── PLAN CARDS ── */
  .plans-grid {{ display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 20px; }}
  .plan-card {{
    background: #0d1f3c; border-radius: 12px; padding: 22px 18px;
    border: 1px solid #1a3050; display: flex; flex-direction: column;
    position: relative;
  }}
  .plan-card.featured {{
    border-color: rgba(245,166,35,0.6);
    background: linear-gradient(160deg, #0f2548 0%, #0d1f3c 100%);
  }}
  .plan-badge-top {{
    position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
    background: #f5a623; color: #0a1628; font-size: 9px; font-weight: 800;
    padding: 3px 14px; border-radius: 10px; letter-spacing: 1px; white-space: nowrap;
  }}
  .plan-icon {{ font-size: 28px; margin-bottom: 10px; }}
  .plan-name {{ font-size: 16px; font-weight: 900; color: #fff; margin-bottom: 4px; }}
  .plan-tagline {{ font-size: 11px; color: #8ca0b8; margin-bottom: 14px; }}
  .plan-price {{ font-size: 13px; font-weight: 700; color: #f5a623; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #1a3050; }}
  .plan-features {{ list-style: none; flex: 1; }}
  .plan-features li {{
    font-size: 11px; color: #8ca0b8; padding: 5px 0;
    display: flex; align-items: flex-start; gap: 8px; line-height: 1.4;
  }}
  .plan-features li .check {{ color: #00d4a0; flex-shrink: 0; font-size: 13px; }}
  .plan-features li .check-no {{ color: #3a5070; flex-shrink: 0; font-size: 13px; }}
  .plan-cta {{
    margin-top: 16px; padding: 10px; text-align: center; border-radius: 8px;
    font-size: 11px; font-weight: 700; color: #0a1628; background: #f5a623;
  }}
  .plan-cta.outline {{
    background: transparent; color: #f5a623; border: 1px solid #f5a623;
  }}

  /* ── TECH STACK ── */
  .tech-grid {{ display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }}
  .tech-box {{
    background: #0d1f3c; border-radius: 8px; padding: 16px 12px; text-align: center;
    border: 1px solid #1a3050;
  }}
  .tech-icon {{ font-size: 24px; margin-bottom: 6px; }}
  .tech-name {{ font-size: 12px; font-weight: 700; color: #fff; }}
  .tech-sub {{ font-size: 10px; color: #8ca0b8; }}

  /* ── ROADMAP ── */
  .roadmap {{ display: flex; flex-direction: column; gap: 0; }}
  .roadmap-item {{
    display: flex; gap: 18px; align-items: flex-start; padding: 12px 0;
    border-bottom: 1px solid #1a3050;
  }}
  .roadmap-item:last-child {{ border-bottom: none; }}
  .roadmap-dot {{
    width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; margin-top: 3px;
  }}
  .dot-done {{ background: #00d4a0; }}
  .dot-next {{ background: #f5a623; }}
  .dot-future {{ background: #1e3a5f; border: 2px solid #3a5070; }}
  .roadmap-title {{ font-size: 13px; font-weight: 700; color: #fff; }}
  .roadmap-desc {{ font-size: 11px; color: #8ca0b8; margin-top: 3px; line-height: 1.5; }}

  /* ── HOSTING ── */
  .hosting-grid {{ display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; margin-bottom: 18px; }}
  .hosting-card {{
    background: #0d1f3c; border-radius: 10px; padding: 18px;
    border: 1px solid #1a3050;
  }}
  .hosting-icon {{ font-size: 26px; margin-bottom: 8px; }}
  .hosting-title {{ font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 6px; }}
  .hosting-desc {{ font-size: 11px; color: #8ca0b8; line-height: 1.6; }}

  /* ── HISTORY ── */
  .history-box {{
    background: #0f2548; border-radius: 10px; padding: 22px; margin-bottom: 18px;
    border-left: 4px solid #f5a623;
  }}
  .history-box h3 {{ font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 10px; }}
  .history-box p {{ font-size: 12px; color: #8ca0b8; line-height: 1.9; }}
  .history-box strong {{ color: #f5a623; }}

  /* ── CONTACT CTA ── */
  .cta-section {{
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    flex: 1; text-align: center; padding: 40px 60px;
  }}
  .cta-icon {{ font-size: 60px; margin-bottom: 20px; }}
  .cta-title {{ font-size: 38px; font-weight: 900; color: #fff; line-height: 1.2; margin-bottom: 16px; }}
  .cta-title span {{ color: #f5a623; }}
  .cta-desc {{ font-size: 14px; color: #8ca0b8; max-width: 500px; line-height: 1.8; margin-bottom: 36px; }}
  .cta-contacts {{
    display: flex; flex-direction: column; gap: 14px; margin-bottom: 36px; width: 100%; max-width: 420px;
  }}
  .cta-contact-row {{
    display: flex; align-items: center; gap: 14px;
    background: #0d1f3c; border-radius: 10px; padding: 14px 20px;
    border: 1px solid #1a3050;
  }}
  .cta-contact-icon {{ font-size: 22px; }}
  .cta-contact-text {{ font-size: 13px; color: #e0e8f0; text-align: left; }}
  .cta-contact-label {{ font-size: 10px; color: #8ca0b8; }}
  .cta-pills {{
    display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 30px;
  }}
  .cta-pill {{
    padding: 8px 20px; border-radius: 20px; font-size: 11px; font-weight: 700;
  }}
  .cta-pill.gold {{ background: #f5a623; color: #0a1628; }}
  .cta-pill.outline {{ border: 1px solid #f5a623; color: #f5a623; background: transparent; }}
  .made-in {{
    font-size: 11px; color: #3a5070; letter-spacing: 3px; text-transform: uppercase;
    display: flex; align-items: center; gap: 10px;
  }}
  .angola-bar {{
    width: 60px; height: 3px;
    background: linear-gradient(90deg, #cc0000 50%, #000 50%);
    border-radius: 2px;
  }}

  /* ── UTIL ── */
  .mt-16 {{ margin-top: 16px; }}
  .mb-16 {{ margin-bottom: 16px; }}
  .flex {{ display: flex; }}
  .gap-12 {{ gap: 12px; }}
  .w-100 {{ width: 100%; }}
  ul.list {{ list-style: none; display: flex; flex-direction: column; gap: 5px; }}
  ul.list li {{ font-size: 11px; color: #8ca0b8; display: flex; gap: 8px; align-items: flex-start; }}
  ul.list li::before {{ content: "›"; color: #f5a623; font-weight: 700; flex-shrink: 0; }}

  @media print {{
    @page {{ size: A4 portrait; margin: 0; }}
    body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .page {{ page-break-after: always; }}
  }}
</style>
</head>
<body>

<!-- ══════════════════════════════════════════
     PAGE 1 — COVER
══════════════════════════════════════════ -->
<div class="page cover">
  <div class="cover-accent-top"></div>
  <div class="cover-orb">SE</div>
  <div class="cover-badge">Sistema Integrado de Gestão Académica</div>
  <div class="cover-title">Super Escola<br><span>SIGA v3</span></div>
  <div class="cover-subtitle">Plataforma Completa de Gestão Escolar</div>
  <div class="cover-desc">
    Desenvolvida em Angola, para Angola. Do aluno ao director,<br>
    do secretariado ao Ministério da Educação — tudo num só sistema,<br>
    100% em cloud, acessível em qualquer dispositivo.
  </div>
  <div class="cover-stats">
    <div class="cover-stat"><div class="cover-stat-n">40+</div><div class="cover-stat-l">Módulos</div></div>
    <div class="cover-stat"><div class="cover-stat-n">6</div><div class="cover-stat-l">Portais</div></div>
    <div class="cover-stat"><div class="cover-stat-n">100%</div><div class="cover-stat-l">Cloud</div></div>
    <div class="cover-stat"><div class="cover-stat-n">24/7</div><div class="cover-stat-l">Online</div></div>
  </div>
  <div class="cover-tags">
    <div class="cover-tag">🎓 Gestão Académica</div>
    <div class="cover-tag">📱 Portais Digitais</div>
    <div class="cover-tag">💰 Finanças Escolares</div>
    <div class="cover-tag">👥 Recursos Humanos</div>
    <div class="cover-tag">💬 Comunicação</div>
    <div class="cover-tag">📊 Relatórios & BI</div>
    <div class="cover-tag">🤖 IA Integrada</div>
    <div class="cover-tag">⚖️ Decreto 04/2026</div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-left">Super Escola — Angola</div>
    <div class="cover-footer-center">Portfólio de Serviços</div>
    <div class="cover-footer-right">Julho 2026</div>
  </div>
  <div class="cover-accent-bottom"></div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 2 — VISÃO GERAL
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Visão Geral da Plataforma</h2>
      <p>O que é o SIGA — Super Escola</p>
    </div>
    <div class="page-badge badge-intro">Introdução</div>
  </div>
  <div class="page-content">

    <div class="highlight-box">
      <h3>Uma plataforma pensada para a realidade angolana</h3>
      <p>
        O SIGA — Super Escola é um sistema integrado de gestão académica desenvolvido
        especificamente para liceus e complexos escolares de Angola. Abrange todo o ciclo
        de vida escolar: da admissão à certificação, passando pelo lançamento de notas
        conforme o <strong>Decreto 04/2026 do Ministério da Educação</strong>, controlo financeiro,
        gestão de recursos humanos e comunicação institucional.
      </p>
    </div>

    <div class="section-label">Pilares da plataforma</div>
    <div class="pilares" style="margin-bottom:18px;">
      <div class="pilar">
        <div class="pilar-icon">🏗️</div>
        <div class="pilar-title">Gestão Total</div>
        <div class="pilar-desc">Controlo completo de alunos, turmas, disciplinas, professores e documentos num único sistema.</div>
      </div>
      <div class="pilar">
        <div class="pilar-icon">🌐</div>
        <div class="pilar-title">Acesso Universal</div>
        <div class="pilar-desc">Funciona em qualquer dispositivo — computador, tablet ou smartphone — sem instalação.</div>
      </div>
      <div class="pilar">
        <div class="pilar-icon">⚖️</div>
        <div class="pilar-title">Conformidade Legal</div>
        <div class="pilar-desc">Alinhado com o Decreto 04/2026 e a regulamentação do Sistema Educativo Angolano (LBSE).</div>
      </div>
    </div>

    <div class="section-label">Quem beneficia</div>
    <div class="rows">
      <div class="row-item">
        <div class="row-icon">🏛️</div>
        <div class="row-main">
          <div class="row-title">Direcção / CEO / PCA</div>
          <div class="row-desc">Dashboard executivo com KPIs em tempo real, controlo de licença, relatórios financeiros e académicos consolidados.</div>
        </div>
        <div class="row-badge rb-gestao">Gestão</div>
      </div>
      <div class="row-item">
        <div class="row-icon">🗂️</div>
        <div class="row-main">
          <div class="row-title">Secretaria Académica</div>
          <div class="row-desc">Emissão de documentos oficiais, matrícula em lote, gestão de turmas, pautas e controlo de admissões.</div>
        </div>
        <div class="row-badge rb-secretaria">Secretaria</div>
      </div>
      <div class="row-item">
        <div class="row-icon">👨‍🏫</div>
        <div class="row-main">
          <div class="row-title">Professores</div>
          <div class="row-desc">Lançamento de mini-pautas, planos de aula, registo de presenças, comunicação com turmas e pautas finais.</div>
        </div>
        <div class="row-badge rb-pedagogico">Pedagógico</div>
      </div>
      <div class="row-item">
        <div class="row-icon">👩‍🎓</div>
        <div class="row-main">
          <div class="row-title">Alunos & Encarregados</div>
          <div class="row-desc">Portal de consulta de notas, presenças, propinas, boletins digitais e notificações em tempo real.</div>
        </div>
        <div class="row-badge rb-portal">Portal</div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 2</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 3 — HISTÓRIA & DIRECTOR
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>A Nossa História & Equipa</h2>
      <p>De onde viemos e quem construiu o SIGA</p>
    </div>
    <div class="page-badge badge-history">História</div>
  </div>
  <div class="page-content">

    <div class="history-box">
      <h3>🌍 Nascemos em Malanje</h3>
      <p>
        O SIGA nasceu de uma necessidade real: as escolas angolanas geriam tudo em papel,
        em folhas de cálculo dispersas e processos manuais lentos. Em <strong>Malanje</strong>,
        vimos de perto a dificuldade das secretarias em emitir documentos, dos directores em
        ter informação consolidada e dos encarregados em acompanhar os filhos.<br><br>
        Em 2024, começámos a construir a primeira versão do sistema. Hoje, o
        <strong>SIGA v3</strong> é uma plataforma completa com mais de 40 módulos, construída
        de raiz para a realidade angolana — cumprindo o <strong>Decreto 04/2026</strong>,
        integrando o sistema bancário nacional (Multicaixa/RUPE) e comunicando com o ecossistema
        digital das famílias angolanas (WhatsApp, Telegram, email).
      </p>
    </div>

    <div class="director-card">
      <img class="director-photo" src="{photo_src}" alt="Osvaldo Fernando Muondo Queta" />
      <div class="director-info">
        <div class="director-name">Osvaldo Fernando Muondo Queta</div>
        <div class="director-role">📌 Director Geral & Desenvolvedor Principal — Super Escola</div>
        <div class="director-bio">
          Engenheiro e empreendedor angolano, natural de Malanje. Fundador e arquitecto
          principal do SIGA v3 — Sistema Integrado de Gestão Académica. Com formação em
          engenharia de software e experiência no sector educativo angolano, desenvolveu
          uma plataforma que coloca Angola na vanguarda da digitalização escolar em África,
          cumprindo todas as exigências legais do Ministério da Educação.
        </div>
        <div class="director-contacts">
          <div class="contact-row"><span class="contact-icon">📞</span><span class="contact-text">+244 926 219 731</span></div>
          <div class="contact-row"><span class="contact-icon">💬</span><span class="contact-text">+244 926 219 731 (WhatsApp)</span></div>
          <div class="contact-row"><span class="contact-icon">📧</span><span class="contact-text">osvaldo.f.m.queta@gmail.com</span></div>
          <div class="contact-row"><span class="contact-icon">🌐</span><span class="contact-text">superescola.ao</span></div>
          <div class="contact-row"><span class="contact-icon">📍</span><span class="contact-text">Malanje, Angola</span></div>
        </div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 3</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 4 — DIMENSÃO REAL
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Dimensão Real da Plataforma</h2>
      <p>Números concretos do que o SIGA oferece</p>
    </div>
    <div class="page-badge badge-scale">Escala</div>
  </div>
  <div class="page-content">

    <div class="stats-grid">
      <div class="stat-box"><div class="stat-num">40+</div><div class="stat-label">Módulos activos</div></div>
      <div class="stat-box"><div class="stat-num">6</div><div class="stat-label">Portais digitais</div></div>
      <div class="stat-box"><div class="stat-num">44+</div><div class="stat-label">Templates PDF</div></div>
      <div class="stat-box"><div class="stat-num">18k</div><div class="stat-label">Linhas de API</div></div>
    </div>

    <div class="section-label">Capacidades por área</div>
    <div class="stats-grid-2">
      <div class="stat-box-2"><div class="stat-num-2">70+</div><div class="stat-label-2">Ecrãs de app</div></div>
      <div class="stat-box-2"><div class="stat-num-2">5</div><div class="stat-label-2">Perfis de acesso</div></div>
      <div class="stat-box-2"><div class="stat-num-2">∞</div><div class="stat-label-2">Alunos suportados</div></div>
      <div class="stat-box-2"><div class="stat-num-2">3</div><div class="stat-label-2">Planos de licença</div></div>
      <div class="stat-box-2"><div class="stat-num-2">24/7</div><div class="stat-label-2">Disponibilidade</div></div>
      <div class="stat-box-2"><div class="stat-num-2">100%</div><div class="stat-label-2">Sem instalação</div></div>
    </div>

    <div class="section-label">Conformidade & Cobertura</div>
    <div class="cards-3">
      <div class="card gold">
        <div class="card-icon">⚖️</div>
        <div class="card-title">Decreto 04/2026</div>
        <div class="card-desc">Implementação completa: Mini-Pauta (Art.30º), Pauta Final, Exame Nacional (Art.38º), EJA e fórmulas NT/NF configuráveis.</div>
      </div>
      <div class="card cyan">
        <div class="card-icon">🏦</div>
        <div class="card-title">Sistema Bancário Nacional</div>
        <div class="card-desc">Integração EMIS / Multicaixa / RUPE para geração de referências de pagamento. Alunos pagam em qualquer terminal ou app bancária.</div>
      </div>
      <div class="card green">
        <div class="card-icon">🔒</div>
        <div class="card-title">Segurança de Dados</div>
        <div class="card-desc">Autenticação JWT, controlo de acessos por perfil, auditoria completa de acções, backups diários automáticos na cloud Neon.</div>
      </div>
    </div>

    <div class="highlight-box green">
      <h3>🌐 Endereço Web & Hospedagem</h3>
      <p>
        O SIGA está disponível em <strong>superescola.ao</strong> — domínio angolano próprio.
        A plataforma é hospedada em infraestrutura cloud de alta disponibilidade:
        base de dados <strong>Neon PostgreSQL</strong> (cloud serverless, backups automáticos),
        servidor de aplicação <strong>Hetzner Cloud</strong> (Europa, 99.9% uptime),
        e entrega de conteúdo global sem latência. Nenhuma escola precisa de instalar
        ou manter servidores locais — tudo é gerido centralmente pela equipa Super Escola.
      </p>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 4</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 5 — MÓDULOS ACADÉMICOS
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Módulos Académicos</h2>
      <p>Gestão completa do processo de ensino-aprendizagem</p>
    </div>
    <div class="page-badge badge-core">Módulo Core</div>
  </div>
  <div class="page-content">

    <div class="section-label">Matrículas & Admissões</div>
    <div class="cards-3">
      <div class="card">
        <div class="card-icon">📋</div>
        <div class="card-title">Processo de Admissão</div>
        <div class="card-desc">Registo de candidatos, avaliação de requisitos, confirmação de vaga e emissão de documentos de admissão.</div>
        <div class="card-tags"><span class="tag">Candidaturas</span><span class="tag">Triagem</span></div>
      </div>
      <div class="card">
        <div class="card-icon">👥</div>
        <div class="card-title">Matrícula em Lote</div>
        <div class="card-desc">Registo simultâneo de múltiplos alunos com atribuição automática de turma, BI e encarregado.</div>
        <div class="card-tags"><span class="tag">Novos Alunos</span><span class="tag">Importação</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🔄</div>
        <div class="card-title">Rematrícula em Lote</div>
        <div class="card-desc">Renovação massiva de matrículas com regras automáticas de bloqueio financeiro e académico.</div>
        <div class="card-tags"><span class="tag">Alunos Activos</span><span class="tag">Renovação</span></div>
      </div>
    </div>

    <div class="section-label">Turmas & Organização</div>
    <div class="cards-3">
      <div class="card">
        <div class="card-icon">🏫</div>
        <div class="card-title">Gestão de Turmas</div>
        <div class="card-desc">Criação e configuração de turmas por classe, turno e ciclo, com atribuição de director e sala.</div>
        <div class="card-tags"><span class="tag">I Ciclo</span><span class="tag">II Ciclo</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🔀</div>
        <div class="card-title">Organizar Alunos em Turmas</div>
        <div class="card-desc">Distribuição e reatribuição de alunos entre turmas com geração de listas de turma em PDF.</div>
        <div class="card-tags"><span class="tag">PDF</span><span class="tag">Transferências</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🗓️</div>
        <div class="card-title">Horários</div>
        <div class="card-desc">Construção visual de horários lectivos com controlo de conflitos de sala, professor e turma.</div>
        <div class="card-tags"><span class="tag">Anti-Conflito</span><span class="tag">PDF</span></div>
      </div>
    </div>

    <div class="section-label">Avaliação & Notas — Decreto 04/2026</div>
    <div class="cards-3">
      <div class="card gold">
        <div class="card-icon">📝</div>
        <div class="card-title">Mini-Pauta (MAC/PP/NT)</div>
        <div class="card-desc">Lançamento por período com prazos configuráveis, pedidos de reabertura e auditoria de alterações.</div>
        <div class="card-tags"><span class="tag">Art. 30º</span><span class="tag">Prazos</span></div>
      </div>
      <div class="card gold">
        <div class="card-icon">📊</div>
        <div class="card-title">Pauta Final & Geral</div>
        <div class="card-desc">Cálculo automático de NF/NT com fórmulas configuráveis, situação de transição e melhoria de nota.</div>
        <div class="card-tags"><span class="tag">NF</span><span class="tag">Transição</span></div>
      </div>
      <div class="card gold">
        <div class="card-icon">🏛️</div>
        <div class="card-title">Exame Nacional</div>
        <div class="card-desc">Gestão de exames nacionais com permissões específicas e inclusão de classes EJA (Art. 38º D. 04/2026).</div>
        <div class="card-tags"><span class="tag">EJA</span><span class="tag">12ª/13ª</span></div>
      </div>
    </div>

    <div class="cards-3">
      <div class="card">
        <div class="card-icon">🔬</div>
        <div class="card-title">Avaliação Diagnóstica</div>
        <div class="card-desc">Avaliação inicial do nível dos alunos para orientar a planificação pedagógica.</div>
      </div>
      <div class="card">
        <div class="card-icon">📈</div>
        <div class="card-title">Avaliação Formativa</div>
        <div class="card-desc">Acompanhamento contínuo do processo de aprendizagem ao longo do período lectivo.</div>
      </div>
      <div class="card">
        <div class="card-icon">🏆</div>
        <div class="card-title">Quadro de Honra</div>
        <div class="card-desc">Reconhecimento automático dos melhores alunos por classe e curso, com foto e publicação.</div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 5</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 6 — PORTAIS DIGITAIS
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Portais Digitais</h2>
      <p>Acesso personalizado para cada perfil de utilizador</p>
    </div>
    <div class="page-badge badge-portal">Externos & Internos</div>
  </div>
  <div class="page-content">

    <div class="highlight-box cyan">
      <h3>📱 Acesso 24/7 em qualquer dispositivo</h3>
      <p>Todos os portais funcionam no browser — sem aplicação a instalar. Basta um smartphone com internet para um encarregado consultar as notas do filho ou um professor lançar as presenças da aula.</p>
    </div>

    <div class="section-label">Portais por perfil</div>
    <div class="cards-3" style="margin-bottom:16px;">
      <div class="card cyan">
        <div class="card-icon">👩‍🎓</div>
        <div class="card-title">Portal do Aluno</div>
        <ul class="list" style="margin-top:8px;">
          <li>Notas por período e disciplina</li>
          <li>Histórico de presenças</li>
          <li>Propinas e RUPE/EMIS</li>
          <li>Boletim digital PDF</li>
          <li>Horário da turma</li>
          <li>Notificações em tempo real</li>
          <li>Chat com professor</li>
        </ul>
      </div>
      <div class="card green">
        <div class="card-icon">👨‍👩‍👧</div>
        <div class="card-title">Portal do Encarregado</div>
        <ul class="list" style="margin-top:8px;">
          <li>Acompanhamento de notas</li>
          <li>Alertas de presenças</li>
          <li>Estado financeiro</li>
          <li>Comunicados escolares</li>
          <li>Solicitação de documentos</li>
          <li>Contacto com directores</li>
        </ul>
      </div>
      <div class="card purple">
        <div class="card-icon">👨‍🏫</div>
        <div class="card-title">Hub do Professor</div>
        <ul class="list" style="margin-top:8px;">
          <li>Lançamento de notas</li>
          <li>Registo de presenças</li>
          <li>Planos de aula</li>
          <li>Sumários lectivos</li>
          <li>Minhas turmas e horário</li>
          <li>Solicitação de reabertura</li>
          <li>Chat interno</li>
        </ul>
      </div>
    </div>

    <div class="section-label">Portais de gestão interna</div>
    <div class="cards-2">
      <div class="card gold">
        <div class="card-icon">📊</div>
        <div class="card-title">Dashboard Executivo (CEO/PCA)</div>
        <div class="card-desc">KPIs em tempo real: total de alunos, receita mensal, taxa de assiduidade, desempenho académico por classe e tendências.</div>
        <div class="card-tags"><span class="tag">KPIs</span><span class="tag">BI</span><span class="tag">Exportação Excel</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🗂️</div>
        <div class="card-title">Hub da Secretaria</div>
        <div class="card-desc">Centro de emissão de documentos, gestão de solicitações, controlo de admissões e atendimento ao público.</div>
        <div class="card-tags"><span class="tag">Documentos</span><span class="tag">Solicitações</span></div>
      </div>
      <div class="card cyan">
        <div class="card-icon">💳</div>
        <div class="card-title">Hub Financeiro</div>
        <div class="card-desc">Registo de pagamentos, RUPE/EMIS, fecho de caixa, bolsas de estudo, extractos e relatórios financeiros.</div>
        <div class="card-tags"><span class="tag">EMIS</span><span class="tag">RUPE</span><span class="tag">Caixa</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🚪</div>
        <div class="card-title">Portaria & Controlo de Acesso</div>
        <div class="card-desc">Validação de cartão escolar, registo de entradas/saídas, leitura QR e bloqueio por inadimplência.</div>
        <div class="card-tags"><span class="tag">QR Code</span><span class="tag">Cartão</span></div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 6</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 7 — FINANÇAS & RH
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Finanças Escolares & Recursos Humanos</h2>
      <p>Controlo financeiro completo e gestão de pessoal</p>
    </div>
    <div class="page-badge badge-finance">Financeiro & RH</div>
  </div>
  <div class="page-content">

    <div class="section-label">Tesouraria & Propinas</div>
    <div class="cards-3">
      <div class="card gold">
        <div class="card-icon">💵</div>
        <div class="card-title">Gestão de Pagamentos</div>
        <div class="card-desc">Registo de mensalidades, taxas e emolumentos com emissão de recibo oficial e histórico por aluno.</div>
        <div class="card-tags"><span class="tag">Recibos</span><span class="tag">Histórico</span></div>
      </div>
      <div class="card gold">
        <div class="card-icon">🏦</div>
        <div class="card-title">EMIS / Multicaixa / RUPE</div>
        <div class="card-desc">Geração de referências de pagamento Multicaixa e RUPE para propinas, taxas e emolumentos.</div>
        <div class="card-tags"><span class="tag">Multicaixa</span><span class="tag">RUPE</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🎓</div>
        <div class="card-title">Bolsas de Estudo</div>
        <div class="card-desc">Gestão de candidatos, atribuição e acompanhamento de bolsas internas e externas por critério académico.</div>
        <div class="card-tags"><span class="tag">Critérios</span><span class="tag">Atribuição</span></div>
      </div>
    </div>

    <div class="cards-3">
      <div class="card">
        <div class="card-icon">🔐</div>
        <div class="card-title">Fecho de Caixa</div>
        <div class="card-desc">Fecho formal diário com controlo de reabertura, auditoria de movimentos e exportação de relatórios.</div>
        <div class="card-tags"><span class="tag">Fecho</span><span class="tag">Auditoria</span></div>
      </div>
      <div class="card">
        <div class="card-icon">📋</div>
        <div class="card-title">Orçamentos & Contas</div>
        <div class="card-desc">Plano de contas, orçamentação por rúbrica e controlo de contas a pagar, com exportação contabilística.</div>
        <div class="card-tags"><span class="tag">Rúbricas</span><span class="tag">Contas</span></div>
      </div>
      <div class="card">
        <div class="card-icon">📊</div>
        <div class="card-title">Estatísticas de Matrículas</div>
        <div class="card-desc">Relatórios de admissão por classe, curso, turno e género com gráficos comparativos e totais.</div>
        <div class="card-tags"><span class="tag">Género</span><span class="tag">Por Classe</span></div>
      </div>
    </div>

    <div class="section-label">Recursos Humanos</div>
    <div class="cards-3">
      <div class="card cyan">
        <div class="card-icon">👤</div>
        <div class="card-title">Ficha do Professor</div>
        <div class="card-desc">Perfil completo com habilitações, foto, disponibilidade horária, disciplinas leccionadas e histórico.</div>
        <div class="card-tags"><span class="tag">Habilitações</span><span class="tag">Disponibilidade</span></div>
      </div>
      <div class="card cyan">
        <div class="card-icon">💰</div>
        <div class="card-title">Processamento Salarial</div>
        <div class="card-desc">Cálculo de vencimentos por tempos lectivos, descontos, faltas e emissão de recibo de vencimento PDF.</div>
        <div class="card-tags"><span class="tag">Tempos Lectivos</span><span class="tag">Recibo PDF</span></div>
      </div>
      <div class="card">
        <div class="card-icon">📅</div>
        <div class="card-title">Faltas & Desempenho</div>
        <div class="card-desc">Registo de faltas do pessoal docente e não-docente, avaliação de desempenho e relatório anual.</div>
        <div class="card-tags"><span class="tag">Faltas</span><span class="tag">Desempenho</span></div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 7</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 8 — DOCUMENTOS & COMUNICAÇÃO
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Documentos Oficiais & Comunicação</h2>
      <p>Motor de documentos e canais de comunicação integrados</p>
    </div>
    <div class="page-badge badge-docs">Documentos & Comms</div>
  </div>
  <div class="page-content">

    <div class="highlight-box purple">
      <h3>📄 +44 templates de documentos pré-configurados</h3>
      <p>Todos os documentos são gerados automaticamente a partir dos dados do sistema, com timbre personalizado, assinatura digital e código QR de verificação. Personalizáveis pelo administrador.</p>
    </div>

    <div class="section-label">Motor de documentos oficiais</div>
    <div class="cards-3">
      <div class="card purple">
        <div class="card-icon">📜</div>
        <div class="card-title">Certificados</div>
        <div class="card-desc">Certificado de habilitações (I e II Ciclo), certificado de frequência e de aprovação, com QR de autenticidade.</div>
        <div class="card-tags"><span class="tag">QR</span><span class="tag">PDF</span></div>
      </div>
      <div class="card purple">
        <div class="card-icon">📊</div>
        <div class="card-title">Pautas Finais</div>
        <div class="card-desc">Pauta final oficial com situação de transição, Mini-Pauta por período e Pauta Geral do ano lectivo.</div>
        <div class="card-tags"><span class="tag">Art. 38º</span><span class="tag">Oficial</span></div>
      </div>
      <div class="card purple">
        <div class="card-icon">📋</div>
        <div class="card-title">Boletins de Notas</div>
        <div class="card-desc">Boletim individual por aluno (I Ciclo e II Ciclo) com notas, situação, assiduidade e observações.</div>
        <div class="card-tags"><span class="tag">Aluno</span><span class="tag">I/II Ciclo</span></div>
      </div>
    </div>

    <div class="cards-3">
      <div class="card">
        <div class="card-icon">🪪</div>
        <div class="card-title">Cartão Escolar</div>
        <div class="card-desc">Cartão digital com foto, código QR e dados do aluno, para uso na portaria e na biblioteca.</div>
      </div>
      <div class="card">
        <div class="card-icon">🧾</div>
        <div class="card-title">Recibos & Declarações</div>
        <div class="card-desc">Declarações de matrícula, declarações financeiras de propina com numeração sequencial.</div>
      </div>
      <div class="card">
        <div class="card-icon">✍️</div>
        <div class="card-title">Reconfirmação de Matrícula</div>
        <div class="card-desc">Ficha formal de reconfirmação com assinatura do encarregado e arquivo digital para o processo.</div>
      </div>
    </div>

    <div class="section-label">Canais de comunicação</div>
    <div class="cards-3">
      <div class="card green">
        <div class="card-icon">💬</div>
        <div class="card-title">Chat Interno</div>
        <div class="card-desc">Mensagens em tempo real entre professores, secretaria e direcção, com anexos e reacções.</div>
        <div class="card-tags"><span class="tag">Tempo Real</span><span class="tag">Anexos</span></div>
      </div>
      <div class="card green">
        <div class="card-icon">🔔</div>
        <div class="card-title">Notificações Push</div>
        <div class="card-desc">Alertas automáticos no browser para novas notas, pagamentos, comunicados e solicitações.</div>
        <div class="card-tags"><span class="tag">Browser Push</span></div>
      </div>
      <div class="card green">
        <div class="card-icon">✉️</div>
        <div class="card-title">Email Institucional</div>
        <div class="card-desc">Envio automático de credenciais, alertas de pagamento e comunicados via e-mail com domínio próprio.</div>
        <div class="card-tags"><span class="tag">Resend</span><span class="tag">SMTP</span></div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 8</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 9 — SERVIÇOS EXTERNOS & IA
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Serviços Externos & Inteligência Artificial</h2>
      <p>Integrações com serviços externos e IA embarcada</p>
    </div>
    <div class="page-badge badge-cloud">Cloud & IA</div>
  </div>
  <div class="page-content">

    <div class="section-label">Serviços externos integrados</div>
    <div class="rows" style="margin-bottom:18px;">
      <div class="row-item">
        <div class="row-icon">🏦</div>
        <div class="row-main">
          <div class="row-title">EMIS / Multicaixa Express</div>
          <div class="row-desc">Geração automática de referências de pagamento para propinas e taxas escolares. Alunos pagam em qualquer terminal Multicaixa ou App de banco angolano.</div>
        </div>
        <div class="row-badge rb-externo">Externo</div>
      </div>
      <div class="row-item">
        <div class="row-icon">✉️</div>
        <div class="row-main">
          <div class="row-title">Resend — Email Transaccional</div>
          <div class="row-desc">Envio de e-mails com domínio próprio (@liceun303.live): credenciais, alertas de notas, confirmações de pagamento e comunicados institucionais.</div>
        </div>
        <div class="row-badge rb-externo">Externo</div>
      </div>
      <div class="row-item">
        <div class="row-icon">💬</div>
        <div class="row-main">
          <div class="row-title">WhatsApp Business & Telegram</div>
          <div class="row-desc">Notificações automáticas de novas notas, alertas de propinas em atraso e comunicados via WhatsApp e Telegram para encarregados.</div>
        </div>
        <div class="row-badge rb-externo">Externo</div>
      </div>
      <div class="row-item">
        <div class="row-icon">🗄️</div>
        <div class="row-main">
          <div class="row-title">Neon PostgreSQL — Base de Dados Cloud</div>
          <div class="row-desc">Base de dados em cloud com backups automáticos, alta disponibilidade e sincronização em tempo real. Sem servidor local a manter.</div>
        </div>
        <div class="row-badge rb-cloud">Cloud</div>
      </div>
      <div class="row-item">
        <div class="row-icon">🐙</div>
        <div class="row-main">
          <div class="row-title">GitHub — Repositório & Versionamento</div>
          <div class="row-desc">Código-fonte protegido em repositório privado com histórico completo de alterações e possibilidade de rollback imediato.</div>
        </div>
        <div class="row-badge rb-externo">Externo</div>
      </div>
    </div>

    <div class="section-label">Inteligência Artificial</div>
    <div class="cards-2" style="margin-bottom:14px;">
      <div class="card gold">
        <div class="card-icon">🤖</div>
        <div class="card-title">Assistente IA (Google Gemini)</div>
        <div class="card-desc">Assistente inteligente embarcado que responde a dúvidas pedagógicas, ajuda a redigir comunicados, sugere acções com base nos dados do sistema e guia o utilizador.</div>
        <div class="card-tags"><span class="tag">Gemini</span><span class="tag">Chat IA</span><span class="tag">Contexto Escolar</span></div>
      </div>
      <div class="card">
        <div class="card-icon">📈</div>
        <div class="card-title">Analytics & Business Intelligence</div>
        <div class="card-desc">Relatórios automáticos de desempenho académico, identificação de alunos em risco, tendências de aprovação e exportação para Excel.</div>
        <div class="card-tags"><span class="tag">Relatórios</span><span class="tag">Excel</span><span class="tag">Gráficos</span></div>
      </div>
    </div>

    <div class="section-label">Segurança & Conformidade</div>
    <div class="cards-2">
      <div class="card">
        <div class="card-icon">🔑</div>
        <div class="card-title">Autenticação JWT + Sessões</div>
        <div class="card-desc">Tokens seguros com renovação automática, sessões activas visíveis e logout remoto.</div>
      </div>
      <div class="card">
        <div class="card-icon">🕵️</div>
        <div class="card-title">Auditoria Completa</div>
        <div class="card-desc">Registo de todas as acções: quem fez, o quê, quando — com histórico de alterações de notas.</div>
      </div>
      <div class="card">
        <div class="card-icon">🛡️</div>
        <div class="card-title">Controlo de Acessos por Perfil</div>
        <div class="card-desc">Permissões granulares por função: CEO, Director, Secretário, Professor, Aluno e Encarregado.</div>
      </div>
      <div class="card">
        <div class="card-icon">💾</div>
        <div class="card-title">Backup Automático</div>
        <div class="card-desc">Dados sincronizados em cloud Neon com backups diários automáticos e recuperação em minutos.</div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 9</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 10 — APOIO PEDAGÓGICO
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Serviços de Apoio Pedagógico</h2>
      <p>Biblioteca, Alumni, Plano Curricular e mais</p>
    </div>
    <div class="page-badge badge-support">Apoio</div>
  </div>
  <div class="page-content">

    <div class="section-label">Plano Curricular & Disciplinas</div>
    <div class="cards-3">
      <div class="card">
        <div class="card-icon">📚</div>
        <div class="card-title">Catálogo de Disciplinas</div>
        <div class="card-desc">Gestão do catálogo de disciplinas por classe e ciclo, com carga horária, tipo e categoria de formação.</div>
        <div class="card-tags"><span class="tag">Ementa</span><span class="tag">Carga Horária</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🎓</div>
        <div class="card-title">Cursos do II Ciclo</div>
        <div class="card-desc">Configuração de cursos (ex.: Produção Vegetal, Informática) com disciplinas nucleares e portaria legal associada.</div>
        <div class="card-tags"><span class="tag">II Ciclo</span><span class="tag">Cursos</span></div>
      </div>
      <div class="card">
        <div class="card-icon">📝</div>
        <div class="card-title">Plano de Aula & Sumário</div>
        <div class="card-desc">Registo de planificações por professor e sumários lectivos por turma, com arquivo para inspecção pedagógica.</div>
        <div class="card-tags"><span class="tag">Planificação</span><span class="tag">Sumários</span></div>
      </div>
    </div>

    <div class="section-label">Biblioteca & Recursos</div>
    <div class="cards-3">
      <div class="card">
        <div class="card-icon">📖</div>
        <div class="card-title">Gestão de Biblioteca</div>
        <div class="card-desc">Catálogo de livros, empréstimos e devoluções, controlo de presenças na sala de leitura e multas por atraso.</div>
        <div class="card-tags"><span class="tag">Empréstimos</span><span class="tag">Catálogo</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🏛️</div>
        <div class="card-title">Salas de Aula</div>
        <div class="card-desc">Registo e gestão de salas com capacidade, bloco, tipo (laboratório, auditório) e disponibilidade por turno.</div>
        <div class="card-tags"><span class="tag">Capacidade</span><span class="tag">Tipo</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🗓️</div>
        <div class="card-title">Feriados & Calendário</div>
        <div class="card-desc">Calendário de feriados nacionais e escolares integrado no módulo de presenças e planificação lectiva.</div>
        <div class="card-tags"><span class="tag">Nacionais</span><span class="tag">Escolares</span></div>
      </div>
    </div>

    <div class="section-label">Gestão de Ex-Alunos & Pedidos</div>
    <div class="cards-3">
      <div class="card green">
        <div class="card-icon">🏅</div>
        <div class="card-title">Alumni</div>
        <div class="card-desc">Base de dados de ex-alunos com historial académico completo, para emissão de certidões retroactivas.</div>
        <div class="card-tags"><span class="tag">Certidões</span><span class="tag">Histórico</span></div>
      </div>
      <div class="card">
        <div class="card-icon">📤</div>
        <div class="card-title">Solicitação de Documentos</div>
        <div class="card-desc">Pedido online de documentos por alunos e encarregados, com rastreamento de estado e notificação de conclusão.</div>
        <div class="card-tags"><span class="tag">Online</span><span class="tag">Rastreamento</span></div>
      </div>
      <div class="card">
        <div class="card-icon">⚖️</div>
        <div class="card-title">Pedidos de Reapreciação</div>
        <div class="card-desc">Processo formal de contestação de notas conforme Art. 38º do Decreto 04/2026, com workflow de aprovação.</div>
        <div class="card-tags"><span class="tag">Art. 38º</span><span class="tag">Workflow</span></div>
      </div>
    </div>

    <div class="section-label">Conselho Pedagógico</div>
    <div class="cards-2">
      <div class="card">
        <div class="card-icon">🤝</div>
        <div class="card-title">Conselho de Avaliação</div>
        <div class="card-desc">Plataforma para reuniões de conselho com registo de decisões, alunos em análise e actas digitais.</div>
        <div class="card-tags"><span class="tag">Actas</span><span class="tag">Decisões</span></div>
      </div>
      <div class="card">
        <div class="card-icon">🔀</div>
        <div class="card-title">Transferências & Correspondências</div>
        <div class="card-desc">Gestão de transferências internas e externas, com mapeamento de equivalências curriculares entre sistemas.</div>
        <div class="card-tags"><span class="tag">Equivalências</span><span class="tag">Externas</span></div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 10</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 11 — PLANOS & PREÇOS
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Planos & Cobrança</h2>
      <p>Três módulos adaptados à dimensão da sua escola</p>
    </div>
    <div class="page-badge badge-plans">Planos</div>
  </div>
  <div class="page-content">

    <div class="highlight-box">
      <h3>💡 Licenciamento por aluno activo / mês</h3>
      <p>O SIGA cobra por aluno activo matriculado por mês. Quanto maior a escola, menor o custo unitário. Sem taxas de instalação, sem contratos anuais obrigatórios e com suporte incluído em todos os planos.</p>
    </div>

    <div class="plans-grid">

      <!-- PLANO 1: PRATA -->
      <div class="plan-card">
        <div class="plan-icon">🥈</div>
        <div class="plan-name">Prata</div>
        <div class="plan-tagline">Para escolas pequenas que querem começar a digitalizar</div>
        <div class="plan-price">30 Kz · por aluno matriculado / mês</div>
        <ul class="plan-features">
          <li><span class="check">✅</span> Gestão de alunos e turmas</li>
          <li><span class="check">✅</span> Matrículas e rematrículas</li>
          <li><span class="check">✅</span> Mini-Pauta e Pauta Final</li>
          <li><span class="check">✅</span> Portal do Aluno & Encarregado</li>
          <li><span class="check">✅</span> Registo de presenças</li>
          <li><span class="check">✅</span> 10 templates de documentos PDF</li>
          <li><span class="check">✅</span> Notificações por email</li>
          <li><span class="check">✅</span> Suporte por email (48h)</li>
          <li><span class="check-no">✗</span> <span style="color:#3a5070;">Módulo financeiro EMIS/RUPE</span></li>
          <li><span class="check-no">✗</span> <span style="color:#3a5070;">RH & Processamento Salarial</span></li>
          <li><span class="check-no">✗</span> <span style="color:#3a5070;">IA Integrada</span></li>
        </ul>
        <div class="plan-cta outline">Contactar</div>
      </div>

      <!-- PLANO 2: GOLDEN -->
      <div class="plan-card featured">
        <div class="plan-badge-top">⭐ MAIS POPULAR</div>
        <div class="plan-icon">🥇</div>
        <div class="plan-name">Golden</div>
        <div class="plan-tagline">Para liceus completos com gestão financeira integrada</div>
        <div class="plan-price">50 Kz · por aluno matriculado / mês</div>
        <ul class="plan-features">
          <li><span class="check">✅</span> Tudo do plano Prata</li>
          <li><span class="check">✅</span> Finanças & EMIS / RUPE</li>
          <li><span class="check">✅</span> Fecho de Caixa & Orçamentos</li>
          <li><span class="check">✅</span> RH & Processamento Salarial</li>
          <li><span class="check">✅</span> 44+ templates de documentos PDF</li>
          <li><span class="check">✅</span> Horários com anti-conflito</li>
          <li><span class="check">✅</span> Chat interno & Push notifications</li>
          <li><span class="check">✅</span> WhatsApp / Telegram</li>
          <li><span class="check">✅</span> Biblioteca & Portaria QR</li>
          <li><span class="check">✅</span> Dashboard CEO & BI</li>
          <li><span class="check">✅</span> Suporte prioritário (24h)</li>
        </ul>
        <div class="plan-cta">Contactar</div>
      </div>

      <!-- PLANO 3: RUBY -->
      <div class="plan-card">
        <div class="plan-icon">💎</div>
        <div class="plan-name">Ruby</div>
        <div class="plan-tagline">Para complexos escolares e redes de estabelecimentos</div>
        <div class="plan-price">75 Kz · por aluno matriculado / mês</div>
        <ul class="plan-features">
          <li><span class="check">✅</span> Tudo do plano Golden</li>
          <li><span class="check">✅</span> Múltiplos estabelecimentos</li>
          <li><span class="check">✅</span> IA Integrada (Google Gemini)</li>
          <li><span class="check">✅</span> Analytics & BI avançado</li>
          <li><span class="check">✅</span> SAF-T Angola (exportação fiscal)</li>
          <li><span class="check">✅</span> Integração MESCTI / INFOSI</li>
          <li><span class="check">✅</span> Gestor de conta dedicado</li>
          <li><span class="check">✅</span> Formação presencial incluída</li>
          <li><span class="check">✅</span> SLA garantido 99.9% uptime</li>
          <li><span class="check">✅</span> Personalização de marca</li>
          <li><span class="check">✅</span> Suporte 24/7 prioritário</li>
        </ul>
        <div class="plan-cta outline">Pedir Proposta</div>
      </div>

    </div>

    <div class="highlight-box green" style="margin-top:4px;">
      <h3>🎁 Todos os planos incluem</h3>
      <p>
        Formação inicial da equipa &nbsp;·&nbsp; Migração de dados existentes &nbsp;·&nbsp;
        Actualizações automáticas do sistema &nbsp;·&nbsp; Backups diários automáticos &nbsp;·&nbsp;
        Acesso imediato — sem instalação &nbsp;·&nbsp; Conformidade Decreto 04/2026 garantida
      </p>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 11</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 12 — HOSPEDAGEM & ARQUITECTURA
══════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <h2>Hospedagem & Arquitectura Técnica</h2>
      <p>Tecnologias modernas, seguras e escaláveis</p>
    </div>
    <div class="page-badge badge-infra">Stack Tecnológico</div>
  </div>
  <div class="page-content">

    <div class="highlight-box cyan">
      <h3>☁️ 100% Cloud — sem servidor local a gerir</h3>
      <p>
        O SIGA funciona completamente na cloud. Não é necessário instalar nada nos computadores
        da escola. Basta ter acesso à internet para utilizar todos os módulos em qualquer dispositivo.
        O endereço web oficial é <strong>superescola.ao</strong>.
      </p>
    </div>

    <div class="section-label">Infraestrutura de hospedagem</div>
    <div class="hosting-grid">
      <div class="hosting-card">
        <div class="hosting-icon">🗄️</div>
        <div class="hosting-title">Base de Dados — Neon PostgreSQL</div>
        <div class="hosting-desc">Base de dados relacional serverless em cloud. Backups automáticos diários, alta disponibilidade, escalabilidade automática e recuperação em minutos. Todos os dados académicos e financeiros são guardados com encriptação.</div>
      </div>
      <div class="hosting-card">
        <div class="hosting-icon">🖥️</div>
        <div class="hosting-title">Servidor de Aplicação — Hetzner Cloud</div>
        <div class="hosting-desc">Infraestrutura de servidor dedicado na Europa (Hetzner Cloud) com 99.9% de uptime garantido, monitorização 24/7, actualizações automáticas e protecção anti-DDoS.</div>
      </div>
      <div class="hosting-card">
        <div class="hosting-icon">🌐</div>
        <div class="hosting-title">Domínio — superescola.ao</div>
        <div class="hosting-desc">Domínio angolano próprio registado com SSL/HTTPS activo. Todos os emails institucionais são enviados com domínio personalizado da escola para garantir profissionalismo e entregabilidade.</div>
      </div>
      <div class="hosting-card">
        <div class="hosting-icon">📦</div>
        <div class="hosting-title">Código — GitHub Privado</div>
        <div class="hosting-desc">Repositório privado com versionamento completo, histórico de alterações e capacidade de rollback imediato em caso de necessidade. Deploy automático via CI/CD.</div>
      </div>
    </div>

    <div class="section-label">Stack de tecnologia</div>
    <div class="tech-grid">
      <div class="tech-box"><div class="tech-icon">⚛️</div><div class="tech-name">React Native</div><div class="tech-sub">Interface cross-platform</div></div>
      <div class="tech-box"><div class="tech-icon">📱</div><div class="tech-name">Expo / Web</div><div class="tech-sub">Build web optimizado</div></div>
      <div class="tech-box"><div class="tech-icon">🟢</div><div class="tech-name">Node.js / Express</div><div class="tech-sub">API REST robusta</div></div>
      <div class="tech-box"><div class="tech-icon">🐘</div><div class="tech-name">PostgreSQL</div><div class="tech-sub">Base de dados relacional</div></div>
      <div class="tech-box"><div class="tech-icon">☁️</div><div class="tech-name">Neon Cloud</div><div class="tech-sub">DB serverless</div></div>
      <div class="tech-box"><div class="tech-icon">🔑</div><div class="tech-name">JWT Auth</div><div class="tech-sub">Autenticação segura</div></div>
      <div class="tech-box"><div class="tech-icon">🤖</div><div class="tech-name">Google Gemini</div><div class="tech-sub">IA generativa</div></div>
      <div class="tech-box"><div class="tech-icon">✉️</div><div class="tech-name">Resend API</div><div class="tech-sub">Email transaccional</div></div>
    </div>

    <div class="section-label">Roadmap de evolução</div>
    <div class="roadmap">
      <div class="roadmap-item">
        <div class="roadmap-dot dot-done"></div>
        <div><div class="roadmap-title">✅ SIGA v3 — Base Completa (2025–2026)</div><div class="roadmap-desc">Todos os módulos académicos, financeiros, RH, portais e motor de documentos implementados e a funcionar.</div></div>
      </div>
      <div class="roadmap-item">
        <div class="roadmap-dot dot-next"></div>
        <div><div class="roadmap-title">🔄 Aplicação Móvel Nativa (2026)</div><div class="roadmap-desc">Versão nativa para Android e iOS com notificações push, acesso offline a notas e cartão digital.</div></div>
      </div>
      <div class="roadmap-item">
        <div class="roadmap-dot dot-future"></div>
        <div><div class="roadmap-title">⏳ Integração MESCTI / INFOSI (2026–2027)</div><div class="roadmap-desc">Sincronização directa com os sistemas do Ministério da Educação de Angola para reporte estatístico automático.</div></div>
      </div>
      <div class="roadmap-item">
        <div class="roadmap-dot dot-future"></div>
        <div><div class="roadmap-title">⏳ Expansão Multi-Escola (2027)</div><div class="roadmap-desc">Suporte a redes de escolas com painel centralizado de gestão multi-estabelecimento.</div></div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <div class="page-footer-brand">SIGA — Super Escola</div>
    <div class="page-footer-num">Página 12</div>
    <div class="page-footer-date">Julho 2026</div>
  </div>
</div>


<!-- ══════════════════════════════════════════
     PAGE 13 — ENCERRAMENTO / CTA
══════════════════════════════════════════ -->
<div class="page" style="background: linear-gradient(160deg, #0a1628 0%, #112240 60%, #0a1f3a 100%);">
  <div style="position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#ef4444 0%,#ef4444 33%,#0a1628 33%,#0a1628 66%,#f5a623 66%,#f5a623 100%);"></div>

  <div class="cta-section">
    <div class="cta-icon">🏫</div>
    <div class="cta-title">Pronto para transformar<br><span>a gestão da sua escola?</span></div>
    <div class="cta-desc">
      O SIGA — Super Escola está disponível para todos os liceus
      e complexos escolares de Angola. Contacte-nos para uma
      demonstração gratuita ou para receber uma proposta personalizada.
    </div>

    <div class="cta-contacts">
      <div class="cta-contact-row">
        <span class="cta-contact-icon">📞</span>
        <div class="cta-contact-text">
          <div class="cta-contact-label">Telefone / WhatsApp</div>
          +244 926 219 731
        </div>
      </div>
      <div class="cta-contact-row">
        <span class="cta-contact-icon">📧</span>
        <div class="cta-contact-text">
          <div class="cta-contact-label">Email do Director Geral</div>
          osvaldo.f.m.queta@gmail.com
        </div>
      </div>
      <div class="cta-contact-row">
        <span class="cta-contact-icon">🌐</span>
        <div class="cta-contact-text">
          <div class="cta-contact-label">Website</div>
          superescola.ao
        </div>
      </div>
      <div class="cta-contact-row">
        <span class="cta-contact-icon">📍</span>
        <div class="cta-contact-text">
          <div class="cta-contact-label">Sede</div>
          Malanje, Angola
        </div>
      </div>
    </div>

    <div class="cta-pills">
      <div class="cta-pill gold">✅ Decreto 04/2026</div>
      <div class="cta-pill gold">✅ 40+ Módulos</div>
      <div class="cta-pill outline">✅ Suporte Incluído</div>
      <div class="cta-pill outline">✅ Acesso Imediato</div>
    </div>

    <div class="made-in">
      <div class="angola-bar"></div>
      FEITO EM ANGOLA
      <div class="angola-bar"></div>
    </div>
  </div>

  <div style="position:absolute;bottom:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#ef4444 0%,#ef4444 33%,#0a1628 33%,#0a1628 66%,#f5a623 66%,#f5a623 100%);"></div>
</div>

</body>
</html>
"""

# Write HTML
with open("/tmp/portfolio.html", "w", encoding="utf-8") as f:
    f.write(HTML)
print("HTML escrito.")

# Generate PDF with Chromium
CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium"
OUT = "SIGA_Portfolio_Servicos.pdf"

result = subprocess.run([
    CHROMIUM,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=5000",
    f"--print-to-pdf={OUT}",
    "--print-to-pdf-no-header",
    "--no-pdf-header-footer",
    "file:///tmp/portfolio.html"
], capture_output=True, text=True, timeout=60)

print("STDOUT:", result.stdout[-500:] if result.stdout else "(vazio)")
print("STDERR:", result.stderr[-500:] if result.stderr else "(vazio)")
print("Return code:", result.returncode)

import os
if os.path.exists(OUT):
    size = os.path.getsize(OUT)
    print(f"PDF gerado: {OUT} ({size:,} bytes)")
else:
    print("ERRO: PDF não foi gerado.")
