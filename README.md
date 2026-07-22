# SIGA v3 — Sistema Integrado de Gestão Académica

## Visão Geral
Versão 3.0 do Sistema de Gestão Académica para instituições angolanas, desenvolvido com Expo React Native. Evolução do SGAA Angola com melhorias significativas e nova arquitetura.

## Stack Tecnológico
- **Frontend**: Expo SDK 54 + Expo Router (file-based routing) + React Native
- **Backend**: Express.js + TypeScript (porta 5000)
- **Armazenamento**: AsyncStorage (local)
- **Estilização**: React Native StyleSheet + Inter font + LinearGradient
- **Gráficos**: react-native-svg (charts customizados)
- **QR Codes**: react-native-qrcode-svg (exibição) + expo-camera (leitura)
- **Biométrico**: expo-local-authentication
- **Hápticos**: expo-haptics

## Novidades na v3.0
- Arquitetura melhorada e otimizada
- Performance aprimorada
- Novos módulos de gestão
- Interface refinada
- Melhorias de segurança

## Funcionalidades
1. **Login Biométrico** — impressão digital, Face ID + PIN fallback
2. **Dashboard** — estatísticas globais, gráficos de barras/pizza, eventos próximos, ações rápidas
3. **Alunos** — CRUD completo, QR code por aluno, filtro por turma
4. **Professores** — CRUD completo, gestão de disciplinas, QR code
5. **Turmas** — estrutura angolana (Primário, I Ciclo, II Ciclo), turnos (Manhã/Tarde/Noite)
6. **Notas** — escala 0–20 (PP, MT, PT → MAC), filtro por trimestre
7. **Presenças** — marcação individual/em massa, QR scanner por câmara
8. **Eventos/Calendário** — tipos: Académico, Exame, Cultural, Desportivo, Feriado, Reunião
9. **Relatórios** — gráficos de barras, linhas, pizza, métricas detalhadas
10. **Menu Duplo** — gaveta esquerda (navegação) + painel direito (perfil/configurações)

## Estrutura de Ficheiros
```
app/
  _layout.tsx         # Root layout com todos os providers
  index.tsx           # Route guard (auth check)
  login.tsx           # Tela de login com biométrico
  (tabs)/             # Legado - redireciona para (main)
  (main)/
    _layout.tsx       # Layout principal com duplo drawer
    dashboard.tsx     # Dashboard com gráficos
    alunos.tsx        # Módulo alunos
    professores.tsx   # Módulo professores
    turmas.tsx        # Módulo turmas
    notas.tsx         # Módulo notas (0-20)
    presencas.tsx     # Módulo presenças + QR scanner
    eventos.tsx       # Calendário e eventos
    relatorios.tsx    # Relatórios e análises

context/
  AuthContext.tsx     # Autenticação + biométrico
  DataContext.tsx     # Dados académicos (AsyncStorage)
  DrawerContext.tsx   # Estado dos menus laterais

components/
  DrawerLeft.tsx      # Gaveta de navegação (esquerda)
  DrawerRight.tsx     # Painel de perfil (direita)
  TopBar.tsx          # Barra de topo com menu/avatar
  StatCard.tsx        # Cards de estatísticas
  Charts.tsx          # BarChart, LineChart, PieChart
  QRCodeModal.tsx     # Modal de QR code
```

## Sistema de Notas (Angola)
- PP: Produção Parcial
- MT: Mini-Teste
- PT: Prova Trimestral
- MAC: Média (PP + MT + PT) / 3
- Aprovação: MAC >= 10 valores
- Escala: 0–20

## Contas Demo
- Director: director@escola.ao / 1234
- Secretaria: secretaria@escola.ao / 1234
- Professor: professor@escola.ao / 1234

## Paleta de Cores (Angola-inspired)
- Primary: #1A2B5F (azul marinho profundo)
- Accent: #CC1A1A (vermelho Angola)
- Gold: #F0A500 (dourado)
- Background: #0D1B3E (fundo escuro premium)

## Instalação e Execução
```bash
# Instalar dependências
npm install

# Iniciar backend
npm run server:dev

# Iniciar frontend (em outra terminal)
npm run expo:dev
```

## Build e Deploy
```bash
# Build para web
npm run web:build

# Build do servidor
npm run server:build

# Produção
npm run server:prod
```

## Contribuição
Este projeto é mantido por Osvaldo Queta e contribuidores.

## Licença
Todos os direitos reservados © 2026
