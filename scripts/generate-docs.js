const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } = require("docx");
const fs = require("fs");
const path = require("path");

const doc = new Document({
    sections: [
        {
            properties: {},
            children: [
                new Paragraph({
                    text: "Documentação do Sistema SIGA v3",
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                }),
                
                new Paragraph({
                    text: "1. Visão Geral",
                    heading: HeadingLevel.HEADING_1,
                }),
                new Paragraph({
                    children: [
                        new TextRun("O SIGA v3 (Sistema Integral de Gestão Académica) é uma plataforma robusta e moderna para a gestão completa de instituições de ensino em Angola. O sistema integra áreas administrativas, pedagógicas e financeiras em um único ecossistema."),
                    ],
                }),

                // Módulo 1
                new Paragraph({ text: "2. Módulos do Sistema", heading: HeadingLevel.HEADING_1 }),
                
                new Paragraph({ text: "2.1. Centro de Supervisão", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Monitorização em tempo real de todos os utilizadores ativos no sistema, permitindo auditoria visual das operações em curso."),
                
                new Paragraph({ text: "2.2. Super Admin", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Configurações globais do sistema, gestão de anos académicos, períodos letivos e parâmetros técnicos fundamentais."),
                
                new Paragraph({ text: "2.3. Auditoria do Sistema", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Registo detalhado de todas as ações realizadas (logs), garantindo rastreabilidade e segurança contra alterações não autorizadas."),
                
                new Paragraph({ text: "2.4. Integração MED", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Módulo para exportação e sincronização de dados com o Ministério da Educação, assegurando conformidade legal."),
                
                new Paragraph({ text: "2.5. Controlo Financeiro", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Gestão de propinas, emolumentos, pagamentos via multicaixa express, extratos e relatórios de tesouraria."),
                
                new Paragraph({ text: "2.6. Editor de Documentos", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Criação e personalização de modelos de declarações, certificados e guias oficiais da instituição."),
                
                new Paragraph({ text: "2.7. Gestão de Acessos", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Configuração granular de permissões por perfil, definindo exatamente o que cada utilizador pode ver ou editar."),
                
                new Paragraph({ text: "2.8. Painel CEO", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Painel executivo com indicadores de performance (KPIs), visão financeira global e estatísticas estratégicas."),
                
                new Paragraph({ text: "2.9. Académico", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Gestão de matrículas, turmas, alunos, salas e horários. O núcleo operacional da secretaria."),
                
                new Paragraph({ text: "2.10. Pedagógico", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Lançamento de notas, sumários, planos de aula e gestão de pautas pelos professores e coordenadores."),
                
                new Paragraph({ text: "2.11. Análise", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Relatórios estatísticos detalhados, gráficos de aproveitamento e análise de dados para gestão escolar."),
                
                new Paragraph({ text: "2.12. Administração", heading: HeadingLevel.HEADING_2 }),
                new Paragraph("Gestão de recursos humanos (RH), processamento de salários (Payroll) e inventário da escola."),

                new Paragraph({ text: "3. Galeria de Interface", heading: HeadingLevel.HEADING_1 }),
                new Paragraph("Abaixo estão algumas capturas de ecrã que ilustram a interface moderna do sistema:"),
                
                // Adicionando imagens se existirem
                ...(fs.existsSync(path.join(__dirname, "../attached_assets/image_1774054242584.png")) ? [
                    new Paragraph({ text: "Painel de Gestão:", heading: HeadingLevel.HEADING_3 }),
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data: fs.readFileSync(path.join(__dirname, "../attached_assets/image_1774054242584.png")),
                                transformation: { width: 500, height: 300 },
                            }),
                        ],
                    })
                ] : []),
                
                ...(fs.existsSync(path.join(__dirname, "../attached_assets/image_1774075359555.png")) ? [
                    new Paragraph({ text: "Interface Académica:", heading: HeadingLevel.HEADING_3 }),
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data: fs.readFileSync(path.join(__dirname, "../attached_assets/image_1774075359555.png")),
                                transformation: { width: 500, height: 300 },
                            }),
                        ],
                    })
                ] : []),
            ],
        },
    ],
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("Documentacao_SIGA_v3_Completa.docx", buffer);
    console.log("Documentação completa gerada: Documentacao_SIGA_v3_Completa.docx");
});
