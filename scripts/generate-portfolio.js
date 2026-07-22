const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>SIGA — Portfólio de Serviços</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

  :root {
    --gold: #F0B429;
    --gold-light: #FFD166;
    --navy: #0A1628;
    --navy-mid: #0F2044;
    --navy-light: #162952;
    --accent: #1E90FF;
    --accent2: #00C6A7;
    --red: #E63946;
    --surface: #132040;
    --border: rgba(255,255,255,0.08);
    --text: #F0F4FF;
    --text2: #A8B8D8;
    --text3: #6B80A0;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', sans-serif;
    background: var(--navy);
    color: var(--text);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ===== CAPA ===== */
  .cover {
    width: 210mm;
    min-height: 297mm;
    background: linear-gradient(145deg, #060D1F 0%, #0A1628 40%, #0F2044 70%, #0A1628 100%);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    page-break-after: always;
  }

  .cover-bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.06;
  }
  .cover-bg-circle.c1 { width: 600px; height: 600px; background: var(--accent); top: -200px; right: -150px; }
  .cover-bg-circle.c2 { width: 400px; height: 400px; background: var(--gold); bottom: -100px; left: -100px; }
  .cover-bg-circle.c3 { width: 250px; height: 250px; background: var(--accent2); top: 50%; left: 30%; }

  .cover-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .cover-angola-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, #CC0000 33%, #000000 33%, #000000 66%, #F0B429 66%);
  }

  .cover-content {
    position: relative; z-index: 2;
    display: flex; flex-direction: column; align-items: center;
    padding: 60px 40px; text-align: center;
  }

  .cover-logo-ring {
    width: 110px; height: 110px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold) 0%, #FF8C00 100%);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 28px;
    box-shadow: 0 0 60px rgba(240,180,41,0.35), 0 0 120px rgba(240,180,41,0.15);
    position: relative;
  }
  .cover-logo-ring::before {
    content: '';
    position: absolute; inset: -4px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(240,180,41,0.5), transparent);
    z-index: -1;
  }
  .cover-logo-text {
    font-size: 38px; font-weight: 900;
    color: var(--navy); letter-spacing: -1px;
  }

  .cover-badge {
    font-size: 10px; font-weight: 700; letter-spacing: 4px;
    color: var(--gold); text-transform: uppercase;
    background: rgba(240,180,41,0.1);
    border: 1px solid rgba(240,180,41,0.3);
    border-radius: 20px; padding: 5px 18px; margin-bottom: 20px;
  }

  .cover-title {
    font-size: 42px; font-weight: 900;
    line-height: 1.1; letter-spacing: -1.5px;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #FFFFFF 0%, var(--gold-light) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }

  .cover-subtitle {
    font-size: 16px; font-weight: 400; color: var(--text2);
    margin-bottom: 36px; max-width: 420px; line-height: 1.6;
  }

  .cover-divider {
    width: 80px; height: 3px;
    background: linear-gradient(90deg, var(--gold), var(--accent));
    border-radius: 2px; margin-bottom: 36px;
  }

  .cover-stats {
    display: flex; gap: 32px; margin-bottom: 48px;
  }
  .cover-stat {
    text-align: center;
  }
  .cover-stat-num {
    font-size: 32px; font-weight: 900; color: var(--gold);
    line-height: 1;
  }
  .cover-stat-label {
    font-size: 10px; font-weight: 500; color: var(--text3);
    letter-spacing: 1px; text-transform: uppercase; margin-top: 4px;
  }

  .cover-modules {
    display: flex; flex-wrap: wrap; gap: 8px;
    justify-content: center; max-width: 420px; margin-bottom: 40px;
  }
  .cover-module-pill {
    font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
    padding: 5px 14px; border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.1);
    color: var(--text2);
    background: rgba(255,255,255,0.04);
  }
  .cover-module-pill.gold { border-color: rgba(240,180,41,0.4); color: var(--gold-light); background: rgba(240,180,41,0.08); }
  .cover-module-pill.blue { border-color: rgba(30,144,255,0.4); color: #7BBFFF; background: rgba(30,144,255,0.08); }
  .cover-module-pill.green { border-color: rgba(0,198,167,0.4); color: #5DDED0; background: rgba(0,198,167,0.08); }

  .cover-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 18px 40px;
    display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid var(--border);
    background: rgba(0,0,0,0.3);
  }
  .cover-footer-left { font-size: 11px; color: var(--text3); }
  .cover-footer-right { font-size: 11px; color: var(--text3); }
  .cover-footer-center {
    font-size: 10px; font-weight: 700; letter-spacing: 3px;
    color: var(--gold); text-transform: uppercase;
  }

  /* ===== PÁGINAS INTERNAS ===== */
  .page {
    width: 210mm;
    min-height: 297mm;
    background: var(--navy);
    position: relative;
    overflow: hidden;
    page-break-after: always;
    padding: 0 0 80px 0;
  }

  .page-header {
    background: linear-gradient(135deg, var(--navy-mid) 0%, var(--navy-light) 100%);
    padding: 28px 40px 22px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    position: relative; overflow: hidden;
  }
  .page-header::after {
    content: '';
    position: absolute; left: 0; bottom: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--gold), var(--accent), var(--accent2));
  }

  .page-header-left { display: flex; align-items: center; gap: 14px; }
  .page-header-icon {
    width: 42px; height: 42px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
  }
  .page-header-title { font-size: 20px; font-weight: 800; color: var(--text); }
  .page-header-sub { font-size: 12px; color: var(--text2); margin-top: 2px; font-weight: 400; }
  .page-header-badge {
    font-size: 10px; font-weight: 700; letter-spacing: 2px;
    color: var(--gold); text-transform: uppercase;
    padding: 4px 12px; border-radius: 20px;
    border: 1px solid rgba(240,180,41,0.3);
    background: rgba(240,180,41,0.08);
  }

  .page-body { padding: 28px 40px; }

  /* ===== CARDS DE SERVIÇO ===== */
  .section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 3px;
    text-transform: uppercase; color: var(--text3);
    margin-bottom: 14px; margin-top: 24px;
    display: flex; align-items: center; gap: 10px;
  }
  .section-label::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 6px;
  }
  .cards-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 6px;
  }

  .service-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    position: relative;
    overflow: hidden;
    transition: all 0.2s;
  }
  .service-card::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: var(--card-accent, var(--accent));
    border-radius: 14px 14px 0 0;
  }

  .service-card.gold { --card-accent: var(--gold); }
  .service-card.blue { --card-accent: var(--accent); }
  .service-card.green { --card-accent: var(--accent2); }
  .service-card.red { --card-accent: var(--red); }
  .service-card.purple { --card-accent: #9B59B6; }
  .service-card.orange { --card-accent: #FF6B35; }

  .card-icon {
    font-size: 22px; margin-bottom: 8px;
    display: block;
  }
  .card-title {
    font-size: 13px; font-weight: 700; color: var(--text);
    margin-bottom: 5px; line-height: 1.3;
  }
  .card-desc {
    font-size: 10.5px; color: var(--text2); line-height: 1.55;
    font-weight: 400;
  }
  .card-tags {
    display: flex; flex-wrap: wrap; gap: 4px; margin-top: 9px;
  }
  .card-tag {
    font-size: 9px; font-weight: 600; letter-spacing: 0.5px;
    padding: 2px 8px; border-radius: 10px;
    background: rgba(255,255,255,0.05);
    color: var(--text3); border: 1px solid var(--border);
  }

  /* ===== FEATURE LIST ===== */
  .feature-list {
    display: flex; flex-direction: column; gap: 8px;
  }
  .feature-item {
    display: flex; align-items: flex-start; gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 11px 14px;
  }
  .feature-icon {
    font-size: 16px; flex-shrink: 0; margin-top: 1px;
  }
  .feature-text { flex: 1; }
  .feature-title {
    font-size: 12px; font-weight: 700; color: var(--text);
    margin-bottom: 2px;
  }
  .feature-desc {
    font-size: 10.5px; color: var(--text2); line-height: 1.5;
  }
  .feature-badge {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    padding: 2px 8px; border-radius: 10px; flex-shrink: 0;
    text-transform: uppercase; align-self: flex-start; margin-top: 2px;
  }
  .feature-badge.internal { background: rgba(30,144,255,0.15); color: #7BBFFF; border: 1px solid rgba(30,144,255,0.3); }
  .feature-badge.external { background: rgba(0,198,167,0.15); color: #5DDED0; border: 1px solid rgba(0,198,167,0.3); }
  .feature-badge.ai { background: rgba(155,89,182,0.15); color: #C39BD3; border: 1px solid rgba(155,89,182,0.3); }

  /* ===== HIGHLIGHT BOX ===== */
  .highlight-box {
    border-radius: 14px;
    padding: 18px 20px;
    margin-bottom: 16px;
    border-left: 4px solid;
    display: flex; gap: 14px; align-items: flex-start;
  }
  .highlight-box.gold { background: rgba(240,180,41,0.07); border-color: var(--gold); }
  .highlight-box.blue { background: rgba(30,144,255,0.07); border-color: var(--accent); }
  .highlight-box.green { background: rgba(0,198,167,0.07); border-color: var(--accent2); }
  .highlight-box-icon { font-size: 24px; flex-shrink: 0; }
  .highlight-box-content {}
  .highlight-box-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .highlight-box-text { font-size: 11px; color: var(--text2); line-height: 1.6; }

  /* ===== PORTAL COMPARISON ===== */
  .portal-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  }
  .portal-card {
    border-radius: 14px; padding: 18px 14px;
    border: 1px solid var(--border);
    text-align: center;
  }
  .portal-card.student { background: linear-gradient(160deg, rgba(30,144,255,0.12), rgba(30,144,255,0.04)); border-color: rgba(30,144,255,0.25); }
  .portal-card.guardian { background: linear-gradient(160deg, rgba(0,198,167,0.12), rgba(0,198,167,0.04)); border-color: rgba(0,198,167,0.25); }
  .portal-card.teacher { background: linear-gradient(160deg, rgba(240,180,41,0.12), rgba(240,180,41,0.04)); border-color: rgba(240,180,41,0.25); }
  .portal-card-icon { font-size: 28px; margin-bottom: 8px; }
  .portal-card-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
  .portal-card-list { text-align: left; display: flex; flex-direction: column; gap: 5px; }
  .portal-card-item {
    font-size: 10.5px; color: var(--text2);
    display: flex; align-items: flex-start; gap: 6px; line-height: 1.4;
  }
  .portal-card-item::before { content: '›'; color: var(--gold); font-weight: 900; flex-shrink: 0; }

  /* ===== TECH STACK ===== */
  .tech-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  }
  .tech-item {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px 10px; text-align: center;
  }
  .tech-item-icon { font-size: 20px; margin-bottom: 5px; }
  .tech-item-name { font-size: 11px; font-weight: 700; color: var(--text); }
  .tech-item-desc { font-size: 9.5px; color: var(--text3); margin-top: 2px; }

  /* ===== COMPLIANCE BOX ===== */
  .compliance-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
  }
  .compliance-item {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px 16px;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .compliance-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
  .compliance-title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 3px; }
  .compliance-text { font-size: 10px; color: var(--text2); line-height: 1.5; }

  /* ===== PAGE FOOTER ===== */
  .page-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 14px 40px;
    display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid var(--border);
    background: rgba(0,0,0,0.2);
  }
  .page-footer-brand { font-size: 11px; font-weight: 700; color: var(--gold); }
  .page-footer-page { font-size: 10px; color: var(--text3); }
  .page-footer-date { font-size: 10px; color: var(--text3); }

  /* ===== INTRO PAGE ===== */
  .intro-hero {
    background: linear-gradient(135deg, var(--navy-mid) 0%, var(--navy-light) 100%);
    border-radius: 16px; padding: 26px 28px; margin-bottom: 20px;
    border: 1px solid var(--border); position: relative; overflow: hidden;
  }
  .intro-hero::after {
    content: 'SIGA';
    position: absolute; right: -10px; bottom: -20px;
    font-size: 100px; font-weight: 900; color: rgba(255,255,255,0.03);
    letter-spacing: -4px;
  }
  .intro-hero-title {
    font-size: 22px; font-weight: 900; color: var(--text);
    margin-bottom: 8px; line-height: 1.2;
  }
  .intro-hero-text {
    font-size: 12px; color: var(--text2); line-height: 1.65; max-width: 480px;
  }

  .vision-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;
  }
  .vision-item {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px 14px; text-align: center;
  }
  .vision-icon { font-size: 24px; margin-bottom: 8px; }
  .vision-title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .vision-text { font-size: 10.5px; color: var(--text2); line-height: 1.5; }

  .timeline {
    display: flex; flex-direction: column; gap: 0;
    position: relative; padding-left: 28px;
  }
  .timeline::before {
    content: ''; position: absolute; left: 8px; top: 10px; bottom: 10px;
    width: 2px; background: linear-gradient(180deg, var(--gold), var(--accent), var(--accent2));
    border-radius: 1px;
  }
  .timeline-item {
    position: relative; padding: 10px 0 10px 20px;
  }
  .timeline-dot {
    position: absolute; left: -22px; top: 13px;
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--gold); border: 2px solid var(--navy);
  }
  .timeline-title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
  .timeline-text { font-size: 10.5px; color: var(--text2); }

  /* ===== CTA PAGE ===== */
  .cta-page {
    width: 210mm; min-height: 297mm;
    background: linear-gradient(145deg, #060D1F 0%, #0A1628 50%, #0F2044 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
    page-break-after: always;
  }
  .cta-bg-circle {
    position: absolute; border-radius: 50%;
    opacity: 0.05;
  }
  .cta-bg-circle.c1 { width: 500px; height: 500px; background: var(--accent); bottom: -150px; right: -150px; }
  .cta-bg-circle.c2 { width: 300px; height: 300px; background: var(--gold); top: -100px; left: -80px; }
  .cta-content {
    position: relative; z-index: 2; text-align: center; padding: 40px;
  }
  .cta-title {
    font-size: 36px; font-weight: 900; line-height: 1.15;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #FFFFFF 0%, var(--gold-light) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .cta-text {
    font-size: 14px; color: var(--text2); max-width: 400px; margin: 0 auto 36px;
    line-height: 1.65;
  }
  .cta-contacts {
    display: flex; flex-direction: column; gap: 12px; align-items: center; margin-bottom: 44px;
  }
  .cta-contact-item {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: var(--text);
  }
  .cta-contact-icon {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,255,255,0.07);
    border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 15px;
  }
  .cta-angola-flag {
    display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 30px;
  }
  .flag-stripe { height: 8px; border-radius: 4px; }
  .flag-red { width: 60px; background: #CC0000; }
  .flag-black { width: 60px; background: #000000; }

  @media print {
    body { background: var(--navy) !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .cover, .page, .cta-page { page-break-after: always; }
  }
</style>
</head>
<body>

<!-- ======= CAPA ======= -->
<div class="cover">
  <div class="cover-bg-circle c1"></div>
  <div class="cover-bg-circle c2"></div>
  <div class="cover-bg-circle c3"></div>
  <div class="cover-grid"></div>
  <div class="cover-angola-bar"></div>

  <div class="cover-content">
    <div class="cover-logo-ring">
      <span class="cover-logo-text">SE</span>
    </div>

    <div class="cover-badge">Sistema Integrado de Gestão Académica</div>

    <h1 class="cover-title">Super Escola<br/>SIGA v3</h1>
    <p class="cover-subtitle">
      Plataforma completa de gestão escolar desenvolvida para liceus e complexos escolares angolanos — do aluno ao director, do secretariado ao ministério.
    </p>

    <div class="cover-divider"></div>

    <div class="cover-stats">
      <div class="cover-stat">
        <div class="cover-stat-num">40+</div>
        <div class="cover-stat-label">Módulos</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num">6</div>
        <div class="cover-stat-label">Portais</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num">100%</div>
        <div class="cover-stat-label">Cloud</div>
      </div>
      <div class="cover-stat">
        <div class="cover-stat-num">24/7</div>
        <div class="cover-stat-label">Online</div>
      </div>
    </div>

    <div class="cover-modules">
      <span class="cover-module-pill gold">Gestão Académica</span>
      <span class="cover-module-pill blue">Portais Digitais</span>
      <span class="cover-module-pill green">Finanças Escolares</span>
      <span class="cover-module-pill gold">Recursos Humanos</span>
      <span class="cover-module-pill blue">Comunicação</span>
      <span class="cover-module-pill green">Relatórios & BI</span>
      <span class="cover-module-pill gold">IA Integrada</span>
      <span class="cover-module-pill blue">Decreto 04/2026</span>
    </div>
  </div>

  <div class="cover-footer">
    <span class="cover-footer-left">Super Escola — Angola</span>
    <span class="cover-footer-center">Portfólio de Serviços</span>
    <span class="cover-footer-right">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 2 — VISÃO GERAL ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(240,180,41,0.15)">🏫</div>
      <div>
        <div class="page-header-title">Visão Geral da Plataforma</div>
        <div class="page-header-sub">O que é o SIGA — Super Escola</div>
      </div>
    </div>
    <div class="page-header-badge">Introdução</div>
  </div>
  <div class="page-body">
    <div class="intro-hero">
      <div class="intro-hero-title">Uma plataforma pensada para a realidade angolana</div>
      <p class="intro-hero-text">
        O SIGA — Super Escola é um sistema integrado de gestão académica desenvolvido especificamente para liceus e complexos escolares de Angola. Abrange todo o ciclo de vida escolar: da admissão à certificação, passando pelo lançamento de notas conforme o <strong style="color:var(--gold-light)">Decreto 04/2026 do Ministério da Educação</strong>, controlo financeiro, gestão de recursos humanos e comunicação institucional.
      </p>
    </div>

    <div class="section-label">Pilares da Plataforma</div>
    <div class="vision-grid">
      <div class="vision-item">
        <div class="vision-icon">🎯</div>
        <div class="vision-title">Gestão Total</div>
        <div class="vision-text">Controlo completo de alunos, turmas, disciplinas, professores e documentos num único sistema.</div>
      </div>
      <div class="vision-item">
        <div class="vision-icon">📱</div>
        <div class="vision-title">Acesso Universal</div>
        <div class="vision-text">Funciona em qualquer dispositivo — computador, tablet ou smartphone — sem instalação.</div>
      </div>
      <div class="vision-item">
        <div class="vision-icon">🇦🇴</div>
        <div class="vision-title">Conformidade Legal</div>
        <div class="vision-text">Alinhado com o Decreto 04/2026 e a regulamentação do Sistema Educativo Angolano (LBSE).</div>
      </div>
    </div>

    <div class="section-label">Quem Beneficia</div>
    <div class="feature-list">
      <div class="feature-item">
        <div class="feature-icon">👨‍💼</div>
        <div class="feature-text">
          <div class="feature-title">Direcção / CEO / PCA</div>
          <div class="feature-desc">Dashboard executivo com KPIs em tempo real, controlo de licença, relatórios financeiros e académicos consolidados.</div>
        </div>
        <span class="feature-badge internal">Gestão</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">📋</div>
        <div class="feature-text">
          <div class="feature-title">Secretaria Académica</div>
          <div class="feature-desc">Emissão de documentos oficiais, matrícula em lote, gestão de turmas, pautas e controlo de admissões.</div>
        </div>
        <span class="feature-badge internal">Secretaria</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">👨‍🏫</div>
        <div class="feature-text">
          <div class="feature-title">Professores</div>
          <div class="feature-desc">Lançamento de mini-pautas, planos de aula, registo de presenças, comunicação com turmas e pautas finais.</div>
        </div>
        <span class="feature-badge internal">Pedagógico</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">🎓</div>
        <div class="feature-text">
          <div class="feature-title">Alunos & Encarregados</div>
          <div class="feature-desc">Portal de consulta de notas, presenças, propinas, boletins digitais e notificações em tempo real.</div>
        </div>
        <span class="feature-badge external">Portal</span>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 2</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 3 — MÓDULOS ACADÉMICOS ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(30,144,255,0.15)">📚</div>
      <div>
        <div class="page-header-title">Módulos Académicos</div>
        <div class="page-header-sub">Gestão completa do processo de ensino-aprendizagem</div>
      </div>
    </div>
    <div class="page-header-badge">Módulo Core</div>
  </div>
  <div class="page-body">

    <div class="section-label">Matrículas & Admissões</div>
    <div class="cards-grid">
      <div class="service-card blue">
        <span class="card-icon">📝</span>
        <div class="card-title">Processo de Admissão</div>
        <div class="card-desc">Registo de candidatos, avaliação de requisitos, confirmação de vaga e emissão de documentos de admissão.</div>
        <div class="card-tags"><span class="card-tag">Candidaturas</span><span class="card-tag">Triagem</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">👥</span>
        <div class="card-title">Matrícula em Lote</div>
        <div class="card-desc">Registo simultâneo de múltiplos alunos novos com atribuição automática de turma, BI e encarregado.</div>
        <div class="card-tags"><span class="card-tag">Novos Alunos</span><span class="card-tag">Importação</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">🔄</span>
        <div class="card-title">Rematrícula em Lote</div>
        <div class="card-desc">Renovação massiva de matrículas com regras automáticas de bloqueio financeiro e académico.</div>
        <div class="card-tags"><span class="card-tag">Alunos Activos</span><span class="card-tag">Renovação</span></div>
      </div>
    </div>

    <div class="section-label">Turmas & Organização</div>
    <div class="cards-grid">
      <div class="service-card gold">
        <span class="card-icon">🏛️</span>
        <div class="card-title">Gestão de Turmas</div>
        <div class="card-desc">Criação e configuração de turmas por classe, turno e ciclo, com atribuição de director e sala.</div>
        <div class="card-tags"><span class="card-tag">I Ciclo</span><span class="card-tag">II Ciclo</span></div>
      </div>
      <div class="service-card gold">
        <span class="card-icon">📋</span>
        <div class="card-title">Organizar Alunos em Turmas</div>
        <div class="card-desc">Distribuição e reatribuição de alunos entre turmas com geração de listas de turma em PDF.</div>
        <div class="card-tags"><span class="card-tag">PDF</span><span class="card-tag">Transferências</span></div>
      </div>
      <div class="service-card gold">
        <span class="card-icon">📅</span>
        <div class="card-title">Horários</div>
        <div class="card-desc">Construção visual de horários lectivos com controlo de conflitos de sala, professor e turma.</div>
        <div class="card-tags"><span class="card-tag">Anti-Conflito</span><span class="card-tag">PDF</span></div>
      </div>
    </div>

    <div class="section-label">Avaliação & Notas — Decreto 04/2026</div>
    <div class="cards-grid">
      <div class="service-card green">
        <span class="card-icon">✅</span>
        <div class="card-title">Mini-Pauta (MAC/PP/NT)</div>
        <div class="card-desc">Lançamento por período com prazos configuráveis, pedidos de reabertura e auditoria de alterações.</div>
        <div class="card-tags"><span class="card-tag">Art. 30º</span><span class="card-tag">Prazos</span></div>
      </div>
      <div class="service-card green">
        <span class="card-icon">📊</span>
        <div class="card-title">Pauta Final & Geral</div>
        <div class="card-desc">Cálculo automático de NF/NT com fórmulas configuráveis, situação de transição e melhoria de nota.</div>
        <div class="card-tags"><span class="card-tag">NF</span><span class="card-tag">Transição</span></div>
      </div>
      <div class="service-card green">
        <span class="card-icon">🎓</span>
        <div class="card-title">Exame Nacional</div>
        <div class="card-desc">Gestão de exames nacionais com permissões específicas e inclusão de classes EJA (Art. 38º D. 04/2026).</div>
        <div class="card-tags"><span class="card-tag">EJA</span><span class="card-tag">12ª/13ª</span></div>
      </div>
    </div>

    <div class="cards-grid" style="margin-top:12px">
      <div class="service-card purple">
        <span class="card-icon">🔍</span>
        <div class="card-title">Avaliação Diagnóstica</div>
        <div class="card-desc">Avaliação inicial do nível dos alunos para orientar a planificação pedagógica.</div>
      </div>
      <div class="service-card purple">
        <span class="card-icon">📝</span>
        <div class="card-title">Avaliação Formativa</div>
        <div class="card-desc">Acompanhamento contínuo do processo de aprendizagem ao longo do período lectivo.</div>
      </div>
      <div class="service-card purple">
        <span class="card-icon">🏆</span>
        <div class="card-title">Quadro de Honra</div>
        <div class="card-desc">Reconhecimento automático dos melhores alunos por classe e curso, com foto e publicação.</div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 3</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 4 — PORTAIS DIGITAIS ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(0,198,167,0.15)">🌐</div>
      <div>
        <div class="page-header-title">Portais Digitais</div>
        <div class="page-header-sub">Acesso personalizado para cada perfil de utilizador</div>
      </div>
    </div>
    <div class="page-header-badge">Externos & Internos</div>
  </div>
  <div class="page-body">

    <div class="highlight-box blue">
      <div class="highlight-box-icon">💡</div>
      <div class="highlight-box-content">
        <div class="highlight-box-title">Acesso 24/7 em qualquer dispositivo</div>
        <div class="highlight-box-text">Todos os portais funcionam no browser — sem aplicação a instalar. Basta um smartphone com internet para um encarregado consultar as notas do filho ou um professor lançar as presenças da aula.</div>
      </div>
    </div>

    <div class="section-label">Portais por Perfil</div>
    <div class="portal-grid">
      <div class="portal-card student">
        <div class="portal-card-icon">🎓</div>
        <div class="portal-card-title">Portal do Aluno</div>
        <div class="portal-card-list">
          <div class="portal-card-item">Notas por período e disciplina</div>
          <div class="portal-card-item">Histórico de presenças</div>
          <div class="portal-card-item">Propinas e RUPE/EMIS</div>
          <div class="portal-card-item">Boletim digital PDF</div>
          <div class="portal-card-item">Horário da turma</div>
          <div class="portal-card-item">Notificações em tempo real</div>
          <div class="portal-card-item">Chat com professor</div>
        </div>
      </div>
      <div class="portal-card guardian">
        <div class="portal-card-icon">👨‍👩‍👧</div>
        <div class="portal-card-title">Portal do Encarregado</div>
        <div class="portal-card-list">
          <div class="portal-card-item">Acompanhamento de notas</div>
          <div class="portal-card-item">Alertas de presenças</div>
          <div class="portal-card-item">Estado financeiro</div>
          <div class="portal-card-item">Comunicados escolares</div>
          <div class="portal-card-item">Solicitação de documentos</div>
          <div class="portal-card-item">Contacto com directores</div>
        </div>
      </div>
      <div class="portal-card teacher">
        <div class="portal-card-icon">👨‍🏫</div>
        <div class="portal-card-title">Hub do Professor</div>
        <div class="portal-card-list">
          <div class="portal-card-item">Lançamento de notas</div>
          <div class="portal-card-item">Registo de presenças</div>
          <div class="portal-card-item">Planos de aula</div>
          <div class="portal-card-item">Sumários lectivos</div>
          <div class="portal-card-item">Minhas turmas e horário</div>
          <div class="portal-card-item">Solicitação de reabertura</div>
          <div class="portal-card-item">Chat interno</div>
        </div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Portais de Gestão Interna</div>
    <div class="cards-grid-2">
      <div class="service-card gold">
        <span class="card-icon">📊</span>
        <div class="card-title">Dashboard Executivo (CEO/PCA)</div>
        <div class="card-desc">KPIs em tempo real: total de alunos, receita mensal, taxa de assiduidade, desempenho académico por classe e tendências.</div>
        <div class="card-tags"><span class="card-tag">KPIs</span><span class="card-tag">BI</span><span class="card-tag">Exportação Excel</span></div>
      </div>
      <div class="service-card orange">
        <span class="card-icon">🏢</span>
        <div class="card-title">Hub da Secretaria</div>
        <div class="card-desc">Centro de emissão de documentos, gestão de solicitações, controlo de admissões e atendimento ao público.</div>
        <div class="card-tags"><span class="card-tag">Documentos</span><span class="card-tag">Solicitações</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">💰</span>
        <div class="card-title">Hub Financeiro</div>
        <div class="card-desc">Registo de pagamentos, RUPE/EMIS, fecho de caixa, bolsas de estudo, extractos e relatórios financeiros.</div>
        <div class="card-tags"><span class="card-tag">EMIS</span><span class="card-tag">RUPE</span><span class="card-tag">Caixa</span></div>
      </div>
      <div class="service-card green">
        <span class="card-icon">🚪</span>
        <div class="card-title">Portaria & Controlo de Acesso</div>
        <div class="card-desc">Validação de cartão escolar, registo de entradas/saídas, leitura QR e bloqueio por inadimplência.</div>
        <div class="card-tags"><span class="card-tag">QR Code</span><span class="card-tag">Cartão</span></div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 4</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 5 — FINANÇAS & RH ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(240,180,41,0.15)">💼</div>
      <div>
        <div class="page-header-title">Finanças Escolares & Recursos Humanos</div>
        <div class="page-header-sub">Controlo financeiro completo e gestão de pessoal</div>
      </div>
    </div>
    <div class="page-header-badge">Financeiro & RH</div>
  </div>
  <div class="page-body">

    <div class="section-label">Tesouraria & Propinas</div>
    <div class="cards-grid">
      <div class="service-card gold">
        <span class="card-icon">🧾</span>
        <div class="card-title">Gestão de Pagamentos</div>
        <div class="card-desc">Registo de mensalidades, taxas e emolumentos com emissão de recibo oficial e histórico por aluno.</div>
        <div class="card-tags"><span class="card-tag">Recibos</span><span class="card-tag">Histórico</span></div>
      </div>
      <div class="service-card gold">
        <span class="card-icon">🏦</span>
        <div class="card-title">EMIS / Multicaixa / RUPE</div>
        <div class="card-desc">Geração de referências de pagamento Multicaixa e RUPE para propinas, taxas e emolumentos.</div>
        <div class="card-tags"><span class="card-tag">Multicaixa</span><span class="card-tag">RUPE</span></div>
      </div>
      <div class="service-card gold">
        <span class="card-icon">🎓</span>
        <div class="card-title">Bolsas de Estudo</div>
        <div class="card-desc">Gestão de candidatos, atribuição e acompanhamento de bolsas internas e externas por critério académico.</div>
        <div class="card-tags"><span class="card-tag">Critérios</span><span class="card-tag">Atribuição</span></div>
      </div>
    </div>

    <div class="cards-grid" style="margin-top:12px">
      <div class="service-card orange">
        <span class="card-icon">🏪</span>
        <div class="card-title">Fecho de Caixa</div>
        <div class="card-desc">Fecho formal diário com controlo de reabertura, auditoria de movimentos e exportação de relatórios.</div>
        <div class="card-tags"><span class="card-tag">Fecho</span><span class="card-tag">Auditoria</span></div>
      </div>
      <div class="service-card orange">
        <span class="card-icon">📈</span>
        <div class="card-title">Orçamento & Contas</div>
        <div class="card-desc">Plano de contas, orçamentação por rúbrica e controlo de contas a pagar, com exportação contabilística.</div>
        <div class="card-tags"><span class="card-tag">Rúbricas</span><span class="card-tag">Contas</span></div>
      </div>
      <div class="service-card orange">
        <span class="card-icon">📊</span>
        <div class="card-title">Estatísticas de Matrículas</div>
        <div class="card-desc">Relatórios de admissão por classe, curso, turno e género com gráficos comparativos e totais.</div>
        <div class="card-tags"><span class="card-tag">Género</span><span class="card-tag">Por Classe</span></div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Recursos Humanos</div>
    <div class="cards-grid">
      <div class="service-card blue">
        <span class="card-icon">👔</span>
        <div class="card-title">Ficha do Professor</div>
        <div class="card-desc">Perfil completo com habilitações, foto, disponibilidade horária, disciplinas leccionadas e histórico.</div>
        <div class="card-tags"><span class="card-tag">Habilitações</span><span class="card-tag">Disponibilidade</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">💵</span>
        <div class="card-title">Processamento Salarial</div>
        <div class="card-desc">Cálculo de vencimentos por tempos lectivos, descontos, faltas e emissão de recibo de vencimento PDF.</div>
        <div class="card-tags"><span class="card-tag">Tempos Lectivos</span><span class="card-tag">Recibo PDF</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">📋</span>
        <div class="card-title">Faltas & Desempenho</div>
        <div class="card-desc">Registo de faltas do pessoal docente e não-docente, avaliação de desempenho e relatório anual.</div>
        <div class="card-tags"><span class="card-tag">Faltas</span><span class="card-tag">Desempenho</span></div>
      </div>
    </div>

  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 5</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 6 — DOCUMENTOS & COMUNICAÇÃO ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(155,89,182,0.15)">📄</div>
      <div>
        <div class="page-header-title">Documentos Oficiais & Comunicação</div>
        <div class="page-header-sub">Motor de documentos e canais de comunicação integrados</div>
      </div>
    </div>
    <div class="page-header-badge">Documentos & Comms</div>
  </div>
  <div class="page-body">

    <div class="section-label">Motor de Documentos Oficiais</div>
    <div class="highlight-box gold">
      <div class="highlight-box-icon">🖨️</div>
      <div class="highlight-box-content">
        <div class="highlight-box-title">+44 templates de documentos pré-configurados</div>
        <div class="highlight-box-text">Todos os documentos são gerados automaticamente a partir dos dados do sistema, com timbre personalizado, assinatura digital e código QR de verificação. Personalizáveis pelo administrador.</div>
      </div>
    </div>

    <div class="cards-grid">
      <div class="service-card gold">
        <span class="card-icon">📜</span>
        <div class="card-title">Certificados</div>
        <div class="card-desc">Certificado de habilitações (I e II Ciclo), certificado de frequência e de aprovação, com QR de autenticidade.</div>
        <div class="card-tags"><span class="card-tag">QR</span><span class="card-tag">PDF</span></div>
      </div>
      <div class="service-card gold">
        <span class="card-icon">📊</span>
        <div class="card-title">Pautas Finais</div>
        <div class="card-desc">Pauta final oficial com situação de transição, Mini-Pauta por período e Pauta Geral do ano lectivo.</div>
        <div class="card-tags"><span class="card-tag">Art. 38º</span><span class="card-tag">Oficial</span></div>
      </div>
      <div class="service-card gold">
        <span class="card-icon">📋</span>
        <div class="card-title">Boletins de Notas</div>
        <div class="card-desc">Boletim individual por aluno (I Ciclo e II Ciclo) com notas, situação, assiduidade e observações.</div>
        <div class="card-tags"><span class="card-tag">Aluno</span><span class="card-tag">I/II Ciclo</span></div>
      </div>
    </div>

    <div class="cards-grid" style="margin-top:10px">
      <div class="service-card purple">
        <span class="card-icon">🪪</span>
        <div class="card-title">Cartão Escolar</div>
        <div class="card-desc">Cartão digital com foto, código QR e dados do aluno, para uso na portaria e na biblioteca.</div>
      </div>
      <div class="service-card purple">
        <span class="card-icon">💰</span>
        <div class="card-title">Recibos & Declarações</div>
        <div class="card-desc">Declarações de matrícula, declarações financeiras, recibos de propina com numeração sequencial.</div>
      </div>
      <div class="service-card purple">
        <span class="card-icon">📁</span>
        <div class="card-title">Reconfirmação de Matrícula</div>
        <div class="card-desc">Ficha formal de reconfirmação com assinatura do encarregado e arquivo digital para o processo.</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Canais de Comunicação</div>
    <div class="cards-grid">
      <div class="service-card blue">
        <span class="card-icon">💬</span>
        <div class="card-title">Chat Interno</div>
        <div class="card-desc">Mensagens em tempo real entre professores, secretaria e direcção, com anexos e reacções.</div>
        <div class="card-tags"><span class="card-tag">Tempo Real</span><span class="card-tag">Anexos</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">🔔</span>
        <div class="card-title">Notificações Push</div>
        <div class="card-desc">Alertas automáticos no browser para novas notas, pagamentos, comunicados e solicitações.</div>
        <div class="card-tags"><span class="card-tag">Browser Push</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">✉️</span>
        <div class="card-title">Email Institucional</div>
        <div class="card-desc">Envio automático de credenciais, alertas de pagamento e comunicados via e-mail com domínio próprio.</div>
        <div class="card-tags"><span class="card-tag">Resend</span><span class="card-tag">SMTP</span></div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 6</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 7 — SERVIÇOS EXTERNOS & IA ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(0,198,167,0.15)">🤖</div>
      <div>
        <div class="page-header-title">Serviços Externos & Inteligência Artificial</div>
        <div class="page-header-sub">Integrações com serviços externos e IA embarcada</div>
      </div>
    </div>
    <div class="page-header-badge">Cloud & IA</div>
  </div>
  <div class="page-body">

    <div class="section-label">Serviços Externos Integrados</div>
    <div class="feature-list">
      <div class="feature-item">
        <div class="feature-icon">🏦</div>
        <div class="feature-text">
          <div class="feature-title">EMIS / Multicaixa Express</div>
          <div class="feature-desc">Geração automática de referências de pagamento para propinas e taxas escolares. Alunos pagam em qualquer terminal Multicaixa ou App de banco angolano.</div>
        </div>
        <span class="feature-badge external">Externo</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">✉️</div>
        <div class="feature-text">
          <div class="feature-title">Resend — Email Transaccional</div>
          <div class="feature-desc">Envio de e-mails com domínio próprio (@liceun303.live): credenciais, alertas de notas, confirmações de pagamento e comunicados institucionais.</div>
        </div>
        <span class="feature-badge external">Externo</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">📲</div>
        <div class="feature-text">
          <div class="feature-title">WhatsApp Business & Telegram</div>
          <div class="feature-desc">Notificações automáticas de novas notas, alertas de propinas em atraso e comunicados via WhatsApp e Telegram para encarregados.</div>
        </div>
        <span class="feature-badge external">Externo</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">☁️</div>
        <div class="feature-text">
          <div class="feature-title">Neon PostgreSQL — Base de Dados Cloud</div>
          <div class="feature-desc">Base de dados gerida em cloud com backups automáticos, alta disponibilidade e sincronização em tempo real. Sem servidor local a manter.</div>
        </div>
        <span class="feature-badge external">Cloud</span>
      </div>
      <div class="feature-item">
        <div class="feature-icon">🔐</div>
        <div class="feature-text">
          <div class="feature-title">GitHub — Repositório & Versionamento</div>
          <div class="feature-desc">Código-fonte protegido em repositório privado com histórico completo de alterações e possibilidade de rollback imediato.</div>
        </div>
        <span class="feature-badge external">Externo</span>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Inteligência Artificial</div>
    <div class="cards-grid-2">
      <div class="service-card green">
        <span class="card-icon">🤖</span>
        <div class="card-title">Assistente IA (Google Gemini)</div>
        <div class="card-desc">Assistente inteligente embarcado que responde a dúvidas pedagógicas, ajuda a redigir comunicados, sugere acções com base nos dados do sistema e guia o utilizador.</div>
        <div class="card-tags"><span class="card-tag">Gemini</span><span class="card-tag">Chat IA</span><span class="card-tag">Contexto Escolar</span></div>
      </div>
      <div class="service-card green">
        <span class="card-icon">📈</span>
        <div class="card-title">Analytics & Business Intelligence</div>
        <div class="card-desc">Relatórios automáticos de desempenho académico, identificação de alunos em risco, tendências de aprovação e exportação para Excel.</div>
        <div class="card-tags"><span class="card-tag">Relatórios</span><span class="card-tag">Excel</span><span class="card-tag">Gráficos</span></div>
      </div>
    </div>

    <div class="section-label" style="margin-top:16px">Segurança & Conformidade</div>
    <div class="compliance-grid">
      <div class="compliance-item">
        <div class="compliance-icon">🔒</div>
        <div>
          <div class="compliance-title">Autenticação JWT + Sessões</div>
          <div class="compliance-text">Tokens seguros com renovação automática, sessões activas visíveis e logout remoto.</div>
        </div>
      </div>
      <div class="compliance-item">
        <div class="compliance-icon">👁️</div>
        <div>
          <div class="compliance-title">Auditoria Completa</div>
          <div class="compliance-text">Registo de todas as acções: quem fez, o quê, quando — com histórico de alterações de notas.</div>
        </div>
      </div>
      <div class="compliance-item">
        <div class="compliance-icon">🛡️</div>
        <div>
          <div class="compliance-title">Controlo de Acessos por Perfil</div>
          <div class="compliance-text">Permissões granulares por função: CEO, Director, Secretário, Professor, Aluno e Encarregado.</div>
        </div>
      </div>
      <div class="compliance-item">
        <div class="compliance-icon">🔄</div>
        <div>
          <div class="compliance-title">Backup Automático</div>
          <div class="compliance-text">Dados sincronizados em cloud Neon com backups diários automáticos e recuperação em minutos.</div>
        </div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 7</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 8 — PLANO CURRICULAR & BIBLIOTECA ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(255,107,53,0.15)">🏫</div>
      <div>
        <div class="page-header-title">Serviços de Apoio Pedagógico</div>
        <div class="page-header-sub">Biblioteca, Alumni, Plano Curricular e mais</div>
      </div>
    </div>
    <div class="page-header-badge">Apoio</div>
  </div>
  <div class="page-body">

    <div class="section-label">Plano Curricular & Disciplinas</div>
    <div class="cards-grid">
      <div class="service-card blue">
        <span class="card-icon">📚</span>
        <div class="card-title">Catálogo de Disciplinas</div>
        <div class="card-desc">Gestão do catálogo de disciplinas por classe e ciclo, com carga horária, ementa e categoria de formação.</div>
        <div class="card-tags"><span class="card-tag">Ementa</span><span class="card-tag">Carga Horária</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">🎓</span>
        <div class="card-title">Cursos do II Ciclo</div>
        <div class="card-desc">Configuração de cursos (ex.: Produção Vegetal, Informática) com disciplinas nucleares e portaria legal associada.</div>
        <div class="card-tags"><span class="card-tag">II Ciclo</span><span class="card-tag">Cursos</span></div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">📖</span>
        <div class="card-title">Plano de Aula & Sumário</div>
        <div class="card-desc">Registo de planificações por professor e sumários lectivos por turma, com arquivo para inspeção pedagógica.</div>
        <div class="card-tags"><span class="card-tag">Planificação</span><span class="card-tag">Sumários</span></div>
      </div>
    </div>

    <div class="section-label" style="margin-top:18px">Biblioteca & Recursos</div>
    <div class="cards-grid">
      <div class="service-card green">
        <span class="card-icon">📗</span>
        <div class="card-title">Gestão de Biblioteca</div>
        <div class="card-desc">Catálogo de livros, empréstimos e devoluções, controlo de presenças na sala de leitura e multas por atraso.</div>
        <div class="card-tags"><span class="card-tag">Empréstimos</span><span class="card-tag">Catálogo</span></div>
      </div>
      <div class="service-card green">
        <span class="card-icon">🏠</span>
        <div class="card-title">Salas de Aula</div>
        <div class="card-desc">Registo e gestão de salas com capacidade, bloco, tipo (laboratório, auditório) e disponibilidade por turno.</div>
        <div class="card-tags"><span class="card-tag">Capacidade</span><span class="card-tag">Tipo</span></div>
      </div>
      <div class="service-card green">
        <span class="card-icon">📅</span>
        <div class="card-title">Feriados & Calendário</div>
        <div class="card-desc">Calendário de feriados nacionais e escolares integrado no módulo de presenças e planificação lectiva.</div>
        <div class="card-tags"><span class="card-tag">Nacionais</span><span class="card-tag">Escolares</span></div>
      </div>
    </div>

    <div class="section-label" style="margin-top:18px">Gestão de Ex-Alunos & Pedidos</div>
    <div class="cards-grid">
      <div class="service-card purple">
        <span class="card-icon">🎓</span>
        <div class="card-title">Alumni</div>
        <div class="card-desc">Base de dados de ex-alunos com historial académico completo, para emissão de certidões retroactivas.</div>
        <div class="card-tags"><span class="card-tag">Certidões</span><span class="card-tag">Histórico</span></div>
      </div>
      <div class="service-card purple">
        <span class="card-icon">📩</span>
        <div class="card-title">Solicitação de Documentos</div>
        <div class="card-desc">Pedido online de documentos por alunos e encarregados, com rastreamento de estado e notificação de conclusão.</div>
        <div class="card-tags"><span class="card-tag">Online</span><span class="card-tag">Rastreamento</span></div>
      </div>
      <div class="service-card purple">
        <span class="card-icon">🔁</span>
        <div class="card-title">Pedidos de Reapreciação</div>
        <div class="card-desc">Processo formal de contestação de notas conforme Art. 38º do Decreto 04/2026, com workflow de aprovação.</div>
        <div class="card-tags"><span class="card-tag">Art. 38º</span><span class="card-tag">Workflow</span></div>
      </div>
    </div>

    <div class="section-label" style="margin-top:18px">Conselho Pedagógico</div>
    <div class="cards-grid-2">
      <div class="service-card orange">
        <span class="card-icon">🤝</span>
        <div class="card-title">Conselho de Avaliação</div>
        <div class="card-desc">Plataforma para reuniões de conselho com registo de decisões, alunos em análise e actas digitais.</div>
        <div class="card-tags"><span class="card-tag">Actas</span><span class="card-tag">Decisões</span></div>
      </div>
      <div class="service-card orange">
        <span class="card-icon">🔄</span>
        <div class="card-title">Transferências & Correspondências</div>
        <div class="card-desc">Gestão de transferências internas e externas, com mapeamento de equivalências curriculares entre sistemas.</div>
        <div class="card-tags"><span class="card-tag">Equivalências</span><span class="card-tag">Externas</span></div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 8</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= PÁG 9 — TECNOLOGIA ======= -->
<div class="page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-header-icon" style="background:rgba(30,144,255,0.15)">⚙️</div>
      <div>
        <div class="page-header-title">Arquitectura Técnica</div>
        <div class="page-header-sub">Tecnologias modernas, seguras e escaláveis</div>
      </div>
    </div>
    <div class="page-header-badge">Stack Tecnológico</div>
  </div>
  <div class="page-body">

    <div class="highlight-box green">
      <div class="highlight-box-icon">🚀</div>
      <div class="highlight-box-content">
        <div class="highlight-box-title">100% Cloud — sem servidor local a gerir</div>
        <div class="highlight-box-text">O SIGA funciona completamente na cloud. Não é necessário instalar nada nos computadores da escola. Basta ter acesso à internet para utilizar todos os módulos em qualquer dispositivo.</div>
      </div>
    </div>

    <div class="section-label">Stack de Tecnologia</div>
    <div class="tech-grid">
      <div class="tech-item">
        <div class="tech-item-icon">⚛️</div>
        <div class="tech-item-name">React Native</div>
        <div class="tech-item-desc">Interface cross-platform</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">📦</div>
        <div class="tech-item-name">Expo / Web</div>
        <div class="tech-item-desc">Build web otimizado</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">🟢</div>
        <div class="tech-item-name">Node.js / Express</div>
        <div class="tech-item-desc">API REST robusta</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">🐘</div>
        <div class="tech-item-name">PostgreSQL</div>
        <div class="tech-item-desc">Base de dados relacional</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">☁️</div>
        <div class="tech-item-name">Neon Cloud</div>
        <div class="tech-item-desc">DB serverless</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">🔐</div>
        <div class="tech-item-name">JWT Auth</div>
        <div class="tech-item-desc">Autenticação segura</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">🤖</div>
        <div class="tech-item-name">Google Gemini</div>
        <div class="tech-item-desc">IA generativa</div>
      </div>
      <div class="tech-item">
        <div class="tech-item-icon">📧</div>
        <div class="tech-item-name">Resend API</div>
        <div class="tech-item-desc">Email transaccional</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Roadmap de Evolução</div>
    <div class="timeline">
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-title">✅ SIGA v3 — Base Completa (2025–2026)</div>
        <div class="timeline-text">Todos os módulos académicos, financeiros, RH, portais e motor de documentos implementados e a funcionar.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-dot" style="background:var(--accent)"></div>
        <div class="timeline-title">🔄 Aplicação Móvel Nativa (2026)</div>
        <div class="timeline-text">Versão nativa para Android e iOS com notificações push, acesso offline a notas e cartão digital.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-dot" style="background:var(--accent2)"></div>
        <div class="timeline-title">🔮 Integração MESCTI / INFOSI (2026–2027)</div>
        <div class="timeline-text">Sincronização directa com os sistemas do Ministério da Educação de Angola para reporte estatístico automático.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-dot" style="background:#9B59B6"></div>
        <div class="timeline-title">🌍 Expansão Multi-Escola (2027)</div>
        <div class="timeline-text">Suporte a redes de escolas com painel centralizado de gestão multi-estabelecimento.</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:20px">Suporte & Formação</div>
    <div class="cards-grid">
      <div class="service-card blue">
        <span class="card-icon">🎓</span>
        <div class="card-title">Formação Inicial</div>
        <div class="card-desc">Sessões de formação presencial ou remota para toda a equipa pedagógica e administrativa da escola.</div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">🛟</span>
        <div class="card-title">Suporte Técnico</div>
        <div class="card-desc">Suporte via WhatsApp e e-mail com tempo de resposta garantido e actualizações automáticas do sistema.</div>
      </div>
      <div class="service-card blue">
        <span class="card-icon">📚</span>
        <div class="card-title">Manuais & Tour Guiado</div>
        <div class="card-desc">Tour interactivo integrado na plataforma e manuais em PDF para cada perfil de utilizador.</div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span class="page-footer-brand">SIGA — Super Escola</span>
    <span class="page-footer-page">Página 9</span>
    <span class="page-footer-date">Julho 2026</span>
  </div>
</div>

<!-- ======= CONTRACAPA ======= -->
<div class="cta-page">
  <div class="cta-bg-circle c1"></div>
  <div class="cta-bg-circle c2"></div>
  <div class="cover-grid"></div>
  <div class="cover-angola-bar"></div>

  <div class="cta-content">
    <div style="font-size:56px;margin-bottom:20px">🏫</div>
    <h2 class="cta-title">Pronto para transformar<br/>a gestão da sua escola?</h2>
    <p class="cta-text">
      O SIGA — Super Escola está disponível para todos os liceus e complexos escolares de Angola. Contacte-nos para uma demonstração gratuita.
    </p>

    <div class="cta-contacts">
      <div class="cta-contact-item">
        <div class="cta-contact-icon">📧</div>
        <span>geral@liceun303.live</span>
      </div>
      <div class="cta-contact-item">
        <div class="cta-contact-icon">📲</div>
        <span>WhatsApp / Telegram disponível</span>
      </div>
      <div class="cta-contact-item">
        <div class="cta-contact-icon">🌐</div>
        <span>Sistema 100% em cloud — acesso imediato</span>
      </div>
    </div>

    <div style="display:flex;gap:12px;justify-content:center;margin-bottom:32px">
      <div style="background:rgba(240,180,41,0.1);border:1px solid rgba(240,180,41,0.3);border-radius:10px;padding:10px 20px;font-size:12px;color:var(--gold-light);font-weight:600">✓ Decreto 04/2026</div>
      <div style="background:rgba(30,144,255,0.1);border:1px solid rgba(30,144,255,0.3);border-radius:10px;padding:10px 20px;font-size:12px;color:#7BBFFF;font-weight:600">✓ 40+ Módulos</div>
      <div style="background:rgba(0,198,167,0.1);border:1px solid rgba(0,198,167,0.3);border-radius:10px;padding:10px 20px;font-size:12px;color:#5DDED0;font-weight:600">✓ Suporte Incluído</div>
    </div>

    <div class="cta-angola-flag">
      <div class="flag-stripe flag-red"></div>
      <div style="font-size:11px;color:var(--text3);letter-spacing:2px;font-weight:600">FEITO EM ANGOLA</div>
      <div class="flag-stripe flag-black"></div>
    </div>
  </div>
</div>

</body>
</html>`;

async function generatePDF() {
  const outPath = path.join(__dirname, '..', 'SIGA_Portfolio_Servicos.pdf');

  const browser = await puppeteer.launch({
    executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();

  const stats = fs.statSync(outPath);
  console.log(`PDF gerado: ${outPath} (${(stats.size / 1024).toFixed(0)} KB)`);
}

generatePDF().catch(err => { console.error(err); process.exit(1); });
