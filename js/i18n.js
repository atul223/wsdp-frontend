/* ============================================================
   i18n.js - WSDP Runtime DOM Translation Engine
   Vanilla JS bilingual support: English <-> Portuguese (Angola)

   Load order on each page:
   js/api.js
   js/i18n.js
   js/shell.js
   js/main.js
   page-specific js

   This file intentionally avoids data-i18n attributes and translates
   visible DOM text at runtime with minimal changes to existing files.
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "wsdp_lang";
  var DEFAULT_LANG = "en";
  var PORTUGUESE_LANG = "pt-AO";

  var textOriginals = new WeakMap();
  var attrOriginals = new WeakMap();
  var optionOriginals = new WeakMap();
  var translateTimer = null;
  var observer = null;
  var initialized = false;

  var DICTIONARY = {
    "Overview": "Visão Geral",
    "Progress Tracking": "Acompanhamento do Progresso",
    "Resources & Finance": "Recursos e Finanças",
    "Risk & Safety": "Risco e Segurança",
    "Tools": "Ferramentas",
    "Home Dashboard": "Painel Inicial",
    "Project Overview": "Visão Geral do Projeto",
    "Construction Progress": "Progresso da Construção",
    "Pipeline Progress": "Progresso das Condutas",
    "House Connections": "Ligações Domiciliárias",
    "Testing & Commissioning": "Ensaios e Comissionamento",
    "Valve Chambers": "Câmaras de Válvulas",
    "Bridge Crossings": "Travessias de Pontes",
    "GIS Map": "Mapa SIG",
    "Financial Dashboard": "Painel Financeiro",
    "Resource Dashboard": "Painel de Recursos",
    "Materials": "Materiais",
    "Material": "Material",
    "Equipment": "Equipamento",
    "Manpower": "Mão de Obra",
    "Delay Analysis": "Análise de Atrasos",
    "Risk Register": "Registo de Riscos",
    "EHS Dashboard": "Painel EHS",
    "Social & Environmental": "Social e Ambiental",
    "Reports": "Relatórios",
    "Settings": "Definições",
    "PDISA WSDP": "PDISA WSDP",
    "Water Supply Distribution": "Distribuição de Abastecimento de Água",
    "Water Supply Distribution Project": "Projeto de Distribuição de Abastecimento de Água",
    "Dashboard": "Painel",
    "Collapse": "Recolher",
    "Search IPCs, Reports": "Pesquisar IPCs, Relatórios",
    "Global search": "Pesquisa global",
    "Overall project RAG status": "Estado RAG global do projeto",
    "Notifications": "Notificações",
    "3 unread alerts": "3 alertas não lidos",
    "Account menu": "Menu da conta",
    "Log out": "Terminar sessão",
    "Logging out...": "A terminar sessão...",
    "Logging out…": "A terminar sessão...",
    "Open menu": "Abrir menu",
    "Toggle dark mode": "Alternar modo escuro",
    "3 Unread Alerts": "3 Alertas Não Lidos",
    "IPC-02 Submitted for Review": "IPC-02 Submetido para Revisão",
    "EOT & Recovery Plan Processing for Approval": "EOT e Plano de Recuperação em Processamento para Aprovação",
    "ESHS Compliance below target (78%)": "Conformidade ESHS abaixo da meta (78%)",
    "Import": "Importar",
    "Export": "Exportar",
    "Save": "Guardar",
    "Cancel": "Cancelar",
    "Edit": "Editar",
    "Delete": "Eliminar",
    "Update": "Atualizar",
    "Close": "Fechar",
    "Actions": "Ações",
    "Action failed": "Falha na ação",
    "Save failed": "Falha ao guardar",
    "Delete failed": "Falha ao eliminar",
    "Add Section": "Adicionar Secção",
    "Add Cluster": "Adicionar Cluster",
    "Add Activity": "Adicionar Atividade",
    "Update Summary": "Atualizar Resumo",
    "Add Crossing": "Adicionar Travessia",
    "Manage Budgets": "Gerir Orçamentos",
    "Add IPC": "Adicionar IPC",
    "Edit IPC": "Editar IPC",
    "Delete IPC": "Eliminar IPC",
    "Edit Budget": "Editar Orçamento",
    "Delete Budget": "Eliminar Orçamento",
    "Save Report": "Guardar Relatório",
    "Update Report": "Atualizar Relatório",
    "Complete": "Concluído",
    "Completed": "Concluído",
    "In Progress": "Em Curso",
    "Mobilising": "Em Mobilização",
    "Not Started": "Não Iniciado",
    "Delayed": "Atrasado",
    "Testing": "Em Ensaio",
    "On Track": "No Prazo",
    "Approved": "Aprovado",
    "Submitted": "Submetido",
    "Certified": "Certificado",
    "Certified 24/06": "Certificado 24/06",
    "Future": "Futuro",
    "Valid": "Válido",
    "Pending": "Pendente",
    "Paid": "Pago",
    "Rejected": "Rejeitado",
    "Draft": "Rascunho",
    "Record pending": "Registo pendente",
    "Under Employer review": "Em revisão pelo Dono da Obra",
    "Pending CTCE": "Pendente CTCE",
    "Expires < 60d · Renew": "Expira em < 60 dias · Renovar",
    "Below Reorder": "Abaixo do Ponto de Reposição",
    "Watch": "Em Observação",
    "Adequate": "Adequado",
    "OK": "OK",
    "Re-order": "Reencomendar",
    "Within Budget": "Dentro do Orçamento",
    "At Risk — Schedule": "Em Risco - Cronograma",
    "At Risk - Schedule": "Em Risco - Cronograma",
    "Project Snapshot": "Resumo do Projeto",
    "Scope, contract, and key parties at a glance": "Âmbito, contrato e principais partes em resumo",
    "Project Information": "Informações do Projeto",
    "Project Name": "Nome do Projeto",
    "Design and Construction of Network and Home Connections for Peri-Urban Areas in the City of Lubango": "Conceção e Construção da Rede e Ligações Domiciliárias para Áreas Periurbanas na Cidade do Lubango",
    "Project Type": "Tipo de Projeto",
    "Water Supply Distribution — Pipe Laying, Home Connections & Ancillary Works": "Distribuição de Abastecimento de Água - Assentamento de Tubagens, Ligações Domiciliárias e Obras Auxiliares",
    "Water Supply Distribution - Pipe Laying, Home Connections & Ancillary Works": "Distribuição de Abastecimento de Água - Assentamento de Tubagens, Ligações Domiciliárias e Obras Auxiliares",
    "Total Pipeline Length (Contract)": "Extensão Total da Conduta (Contrato)",
    "Total House Connections (Contract)": "Total de Ligações Domiciliárias (Contrato)",
    "Contract Start Date": "Data de Início do Contrato",
    "Construction Commencement Date": "Data de Início da Construção",
    "Completion of Construction": "Conclusão da Construção",
    "Current Overall Physical Progress": "Progresso Físico Global Atual",

    "Project Information Panel": "Painel de Informações do Projeto",
    "Contract parties, dates, advance payment and securities": "Partes contratuais, datas, adiantamento e garantias",
    "Contract Information": "Informações do Contrato",
    "Contractor": "Empreiteiro",
    "Consultant": "Consultor",
    "Contract End Date": "Data de Fim do Contrato",
    "Revised Completion Date": "Data de Conclusão Revista",
    "Performance Guarantee": "Garantia de Execução",
    "Advance Payment Guarantee": "Garantia de Adiantamento",
    "Advance Payment %": "% de Adiantamento",

    "Bank of China · USD 559,970.45 · Valid up to 31 Dec 2026": "Bank of China · USD 559.970,45 · Válido até 31 Dez 2026",
    "20% of the Accepted contract amount with Provisional Sum. Employer claimed - 156,248.79 USD against IPC-01 out of 1,119,940.90 USD. Remaining - 963,692.11 USD.": "20% do valor contratual aceite com Soma Provisória. O Dono da Obra deduziu 156.248,79 USD no IPC-01 de um total de 1.119.940,90 USD. Remanescente - 963.692,11 USD.",

    "Key Stakeholders": "Principais Partes Interessadas",
    "Roles & responsibilities": "Funções e responsabilidades",
    "Roles and responsibilities": "Funções e responsabilidades",
    "Client / Owner": "Cliente / Dono da Obra",
    "Funding Agency": "Agência Financiadora",

    "Explore the Dashboard": "Explorar o Painel",
    "Jump to a module": "Ir para um módulo",
    "Pipeline, connections, testing": "Condutas, ligações, ensaios",
    "Corridor & site locations": "Corredor e localizações da obra",
    "Corridor and site locations": "Corredor e localizações da obra",
    "IPCs, cash flow, budget": "IPCs, fluxo de caixa, orçamento",
    "Monthly report exports": "Exportação de relatórios mensais",

    "Water Supply Distribution Project — Monitoring Dashboard": "Projeto de Distribuição de Abastecimento de Água - Painel de Monitorização",
    "Water Supply Distribution Project - Monitoring Dashboard": "Projeto de Distribuição de Abastecimento de Água - Painel de Monitorização",

    "Project overview for the Water Supply Distribution Project.": "Visão geral do projeto para o Projeto de Distribuição de Abastecimento de Água.",
    "Project Overview — Water Supply Distribution Project": "Visão Geral do Projeto - Projeto de Distribuição de Abastecimento de Água",
    "Project Overview - Water Supply Distribution Project": "Visão Geral do Projeto - Projeto de Distribuição de Abastecimento de Água",
    "Landing Dashboard": "Painel Inicial",
    "Construction Progress Dashboard": "Painel de Progresso da Construção",
    "Contract 44W3/LUBANGO/DNA18": "Contrato 44W3/LUBANGO/DNA18",
    "Revised DDR: 92,677 m / 5,303 HSC": "DDR Revisto: 92.677 m / 5.303 HSC",
    "Original Contract: 70,000 m / 5,000 HSC": "Contrato Original: 70.000 m / 5.000 HSC",
    "Contract: 3,625.58 M AOA (USD 5.6 M)": "Contrato: 3.625,58 M AOA (USD 5,6 M)",
    "IPC-01 Approved & IPC-02 Submitted (17.96%)": "IPC-01 Aprovado e IPC-02 Submetido (17,96%)",
    "EOT & Recovery Plan: Processing for Approval": "EOT e Plano de Recuperação: Em Processamento para Aprovação",
    "Overall Physical Progress": "Progresso Físico Global",
    "Weighted across 6 activities": "Ponderado em 6 atividades",
    "Pipe Laying": "Assentamento de Tubagens",
    "Household Connections": "Ligações Domiciliárias",
    "Months Elapsed / Remaining": "Meses Decorridos / Restantes",
    "Delay accrued 6.5 months": "Atraso acumulado de 6,5 meses",
    "Cumulative Billing": "Faturação Acumulada",
    "IPC Status": "Estado do IPC",
    "IPC-02: 246.34 M AOA Submitted": "IPC-02: 246,34 M AOA Submetidos",
    "ESHS Compliance": "Conformidade ESHS",
    "Target ≥ 90%": "Meta ≥ 90%",
    "Lost-Time Accidents": "Acidentes com Perda de Tempo",
    "Zero injuries": "Zero lesões",
    "Grievances Resolved": "Reclamações Resolvidas",
    "100% — Satisfied": "100% - Satisfeito",
    "100% - Satisfied": "100% - Satisfeito",
    "Active Work Fronts": "Frentes de Trabalho Ativas",
    "Progress & Compliance Trends": "Tendências de Progresso e Conformidade",
    "Headline indicators for PDISA Client": "Indicadores principais para o Cliente PDISA",
    "Monthly Pipe Laying — Planned vs Actual (m)": "Assentamento Mensal de Tubagens - Planeado vs Real (m)",
    "Monthly Pipe Laying - Planned vs Actual (m)": "Assentamento Mensal de Tubagens - Planeado vs Real (m)",
    "Cumulative Physical Progress — S-Curve (%)": "Progresso Físico Acumulado - Curva S (%)",
    "Cumulative Physical Progress - S-Curve (%)": "Progresso Físico Acumulado - Curva S (%)",
    "Cumulative Financial Execution (Million AOA)": "Execução Financeira Acumulada (Milhões AOA)",
    "ESHS Compliance by Plan (%)": "Conformidade ESHS por Plano (%)",
    "GIS Map — Lubango Distribution Network Intervention Areas": "Mapa SIG - Áreas de Intervenção da Rede de Distribuição do Lubango",
    "GIS Map - Lubango Distribution Network Intervention Areas": "Mapa SIG - Áreas de Intervenção da Rede de Distribuição do Lubango",
    "Location view using Lubango intervention areas": "Vista de localização usando as áreas de intervenção do Lubango",
    "Scope": "Âmbito",
    "Financial and Contract Management Unit (FCMU) - World Bank/African Development Bank Group, Ministry of Energy and Water, Angola (MINEA)": "Unidade de Gestão Financeira e Contratos (FCMU) - Banco Mundial/Banco Africano de Desenvolvimento, Ministério da Energia e Água, Angola (MINEA)",
    "China Tiesiju Civil Engineering Group Co. Ltd. (CTCE)": "China Tiesiju Grupo de Engenharia Civil Co. Ltd. (CTCE)",
    "China Tiesiju Civil Engineering Group Co. Ltd. (CTCE)": "China Tiesiju Grupo de Engenharia Civil Co. Ltd. (CTCE)",
    "All Zones": "Todas as Zonas",
    "All Areas": "Todas as Áreas",
    "Select date range": "Selecionar intervalo de datas",
    "Pipeline Progress by Area": "Progresso das Condutas por Área",
    "Hydro-testing": "Hidroteste",
    "As per Detailed Design": "Conforme o projeto detalhado",
    "River/Stream Crossing": "Cruzamento Rio/Fluxo",
    "River/Stream crossing structures": "Estruturas de passagem de rios/riachos",
    "System Administrator": "Administrador do sistema",
    "Notional Delay: 6.5 months": "Atraso nocional: 6,5 meses",
    "KMZ-driven project GIS viewer with satellite, street and topographic map layers": "Visor GIS do projeto orientado por KMZ com camadas de satélite, rua e mapa topográfico",
    "Map Orientation": "Orientação do mapa",
    "GIS Mode": "Modo SIG",
    "Satellite, street and topographic base layers are available from the layer switcher.": "As camadas de satélite, rua e base topográfica estão disponíveis a partir do comutador de camadas.",
    "Dynamic scale": "Escala dinâmica",
    "Engineering Legend": "Lenda de Engenharia",
    "Neighborhoods (bairros)": "Bairros (bairros)",
    "Sector connection point": "Ponto de ligação do setor",
    "Water distribution pipeline /63mm HDPE": "Conduta de distribuição de água /63mm HDPE",
    "Water distribution pipeline /75mm HDPE": "Conduta de distribuição de água /75mm HDPE",
    "Water distribution pipeline /90mm HDPE": "Conduta de distribuição de água /90mm HDPE",
    "Water distribution pipeline /110mm HDPE": "Conduta de distribuição de água /110mm HDPE",
    "Water distribution pipeline /160mm HDPE": "Conduta de distribuição de água /160mm HDPE",
    "Water distribution pipeline /200mm HDPE": "Conduta de distribuição de água /200mm HDPE",
    "Water distribution pipeline /250mm HDPE": "Conduta de distribuição de água /250mm HDPE",
    "Gate Valve": "Válvula de Gaveta",
    "Sludge Discharge valve": "Válvula de Descarga de Lamas",
    "Air Valve": "Válvula de Ar",
    "Pressure reducing valve": "Válvula Redutora de Pressão",
    "Flowmeter": "Medidor de Fluxo",
    "Zone A": "Zona A",
    "Zone B": "Zona B",
    "Zone C": "Zona C",
    "Zone D": "Zona D",
    "Last 30 days": "Últimos 30 dias",
    "Last 90 days": "Últimos 90 dias",
    "This quarter": "Este trimestre",
    "Year to date": "Ano até à data",
    "Progress Summaries": "Resumos de Progresso",
    "92.677 km total alignment": "Alinhamento total de 92,677 km",
    "Laid": "Assentado",
    "Hydro-Tested": "Hidrotestado",
    "Remaining": "Restante",
    "Pipeline Progress by Zone": "Progresso das Condutas por Zona",
    "Area-wise Progress": "Progresso por Área",
    "Pipe Diameter Progress Matrix": "Matriz de Progresso por Diâmetro da Tubagem",
    "Monthly Progress Summary": "Resumo do Progresso Mensal",
    "Chainage-wise Status": "Estado por Progressiva",
    "Village cluster-wise connection progress": "Progresso das ligações por cluster de aldeias",
    "House Connections — Village Cluster Breakdown": "Ligações Domiciliárias - Desagregação por Cluster de Aldeias",
    "House Connections - Village Cluster Breakdown": "Ligações Domiciliárias - Desagregação por Cluster de Aldeias",
    "House Connection Clusters": "Clusters de Ligações Domiciliárias",
    "Hydro-testing, disinfection & handover readiness": "Hidroteste, desinfeção e prontidão para entrega",
    "Air valves, scour valves & sluice chambers": "Válvulas de ar, válvulas de descarga e câmaras de seccionamento",
    "River, canal & road crossing structures": "Estruturas de travessia de rios, canais e estradas",
    "Area": "Área",
    "Planned (km)": "Planeado (km)",
    "Actual (km)": "Real (km)",
    "Variance (km)": "Variação (km)",
    "Diameter": "Diâmetro",
    "Installed (km)": "Instalado (km)",
    "Activity": "Atividade",
    "Previous Month": "Mês Anterior",
    "Current Month": "Mês Atual",
    "Cumulative": "Acumulado",
    "Planned": "Planeado",
    "Actual": "Real",
    "Status": "Estado",
    "Cluster": "Cluster",
    "Crossing": "Travessia",
    "Type": "Tipo",
    "Method": "Método",
    "Total Planned": "Total Planeado",
    "No records match these filters.": "Nenhum registo corresponde a estes filtros.",
    "Clear filters": "Limpar filtros",
    "Showing all zones": "A mostrar todas as zonas",
    "No pipeline sections added yet.": "Ainda não foram adicionadas secções de conduta.",
    "No area-wise progress data available.": "Não há dados de progresso por área disponíveis.",
    "No pipe diameter matrix data available.": "Não há dados da matriz de diâmetros da tubagem disponíveis.",
    "No monthly progress data available.": "Não há dados de progresso mensal disponíveis.",
    "No house connection clusters added yet.": "Ainda não foram adicionados clusters de ligações domiciliárias.",
    "No testing activities added yet.": "Ainda não foram adicionadas atividades de ensaio.",
    "No bridge crossings added yet.": "Ainda não foram adicionadas travessias de pontes.",
    "Edit Pipeline Section": "Editar Secção de Conduta",
    "Add Pipeline Section": "Adicionar Secção de Conduta",
    "Pipeline section saved successfully": "Secção de conduta guardada com sucesso",
    "Delete this pipeline section?": "Eliminar esta secção de conduta?",
    "Pipeline section deleted": "Secção de conduta eliminada",
    "Edit House Connection Cluster": "Editar Cluster de Ligações Domiciliárias",
    "Add House Connection Cluster": "Adicionar Cluster de Ligações Domiciliárias",
    "House connection cluster saved successfully": "Cluster de ligações domiciliárias guardado com sucesso",
    "Delete this house connection cluster?": "Eliminar este cluster de ligações domiciliárias?",
    "House connection cluster deleted": "Cluster de ligações domiciliárias eliminado",
    "Edit Testing Activity": "Editar Atividade de Ensaio",
    "Add Testing Activity": "Adicionar Atividade de Ensaio",
    "Testing activity saved successfully": "Atividade de ensaio guardada com sucesso",
    "Delete this testing activity?": "Eliminar esta atividade de ensaio?",
    "Testing activity deleted": "Atividade de ensaio eliminada",
    "Update Valve Chamber Summary": "Atualizar Resumo das Câmaras de Válvulas",
    "Valve chamber summary updated": "Resumo das câmaras de válvulas atualizado",
    "Edit Bridge Crossing": "Editar Travessia de Ponte",
    "Add Bridge Crossing": "Adicionar Travessia de Ponte",
    "Bridge crossing saved successfully": "Travessia de ponte guardada com sucesso",
    "Delete this bridge crossing?": "Eliminar esta travessia de ponte?",
    "Bridge crossing deleted": "Travessia de ponte eliminada",
    "Zone": "Zona",
    "Chainage From": "Progressiva Inicial",
    "Chainage To": "Progressiva Final",
    "Length KM": "Comprimento KM",
    "Laying %": "Assentamento %",
    "Testing %": "Ensaio %",
    "Cluster Name": "Nome do Cluster",
    "Activity Name": "Nome da Atividade",
    "Planned Value": "Valor Planeado",
    "Actual Value": "Valor Real",
    "Unit": "Unidade",
    "Crossing Name": "Nome da Travessia",
    "Remarks": "Observações",
    "Financial Progress": "Progresso Financeiro",
    "Physical Progress": "Progresso Físico",
    "Cumulative Expenditure": "Despesa Acumulada",
    "Cumulative IPC invoiced": "IPC acumulado faturado",
    "Total Contract": "Contrato Total",
    "Advance Payment 20%": "Adiantamento 20%",
    "Contract Balance": "Saldo do Contrato",
    "Prov. Sum (50%)": "Soma Provisória (50%)",
    "Cash Flow": "Fluxo de Caixa",
    "Planned vs. actual monthly expenditure": "Despesa mensal planeada vs real",
    "Financial vs. Physical Progress": "Progresso Financeiro vs Físico",
    "Comparing cumulative % completion": "Comparação da percentagem acumulada de conclusão",
    "Payment Tracking": "Acompanhamento de Pagamentos",
    "Contract value, invoicing, paid and outstanding amounts": "Valor contratual, faturação, pago e montantes pendentes",
    "IPC Tracker": "Rastreador IPC",
    "Interim payment certificates": "Certificados de pagamento intercalares",
    "Bank Guarantees": "Garantias Bancárias",
    "Guarantee validity and renewal status": "Validade da garantia e estado de renovação",
    "Addenda / Amendments": "Adendas / Emendas",
    "Contract amendments and scope changes": "Emendas contratuais e alterações de âmbito",
    "Description": "Descrição",
    "Amount": "Montante",
    "Contract Value": "Valor do Contrato",
    "Amount Invoiced": "Montante Faturado",
    "Amount Paid": "Montante Pago",
    "Outstanding": "Pendente",
    "Period": "Período",
    "Client": "Cliente",
    "Guarantee": "Garantia",
    "Bank": "Banco",
    "Valid Until": "Válido Até",
    "Addendum": "Adenda",
    "Date": "Data",
    "Planned vs actual cumulative expenditure in AOA": "Despesa acumulada planeada vs real em AOA",
    "Planned vs Actual Progress": "Progresso Planeado vs Real",
    "Physical and Financial Progress Comparison": "Comparação do Progresso Físico e Financeiro",
    "Planned Physical %": "Planeado Físico %",
    "Actual Physical %": "Real Físico %",
    "Planned Financial %": "Planeado Financeiro %",
    "Actual Financial %": "Real Financeiro %",
    "Bank of China": "Banco da China",
    "	Contract implementation clarifications and administrative provisions.": "Esclarecimentos sobre a implementação do contrato e disposições administrativas.",
    "Modification and optimization of approved design layouts.": "Modification and optimization of approved design layouts.",
    "Additional network coverage and household connection revisions.": "Cobertura adicional da rede e revisões das ligações domiciliárias.",
    "approved": "aprovado",


    "Planned (M AOA)": "Planeado (M AOA)",
    "Actual (M AOA)": "Real (M AOA)",
    "Physical %": "Físico %",
    "Financial %": "Financeiro %",
    "Contract value in AOA and USD": "Valor contratual em AOA e USD",
    "Advance payment disbursed": "Adiantamento desembolsado",
    "Remaining contract balance": "Saldo remanescente do contrato",
    "Verified in IPC-02": "Verificado no IPC-02",
    "of USD 5.60M contract value": "do valor contratual de USD 5,60M",
    "IPC-01 Approved · IPC-02 Submitted": "IPC-01 Aprovado · IPC-02 Submetido",
    "Budget": "Orçamento",
    "Existing Budgets": "Orçamentos Existentes",
    "Category": "Categoria",
    "FY": "Ano Fiscal",
    "Fiscal Year": "Ano Fiscal",
    "Allocated": "Alocado",
    "Utilized": "Utilizado",
    "Allocated Amount": "Montante Alocado",
    "Currency": "Moeda",
    "Notes": "Notas",
    "IPC / Invoice Number": "Número do IPC / Fatura",
    "Period / Description": "Período / Descrição",
    "AOA Amount": "Montante AOA",
    "Invoice Date": "Data da Fatura",
    "Due Date": "Data de Vencimento",
    "Create a budget first before adding IPC records.": "Crie primeiro um orçamento antes de adicionar registos IPC.",
    "IPC updated successfully": "IPC atualizado com sucesso",
    "IPC created successfully": "IPC criado com sucesso",
    "IPC deleted successfully": "IPC eliminado com sucesso",
    "Budget updated successfully": "Orçamento atualizado com sucesso",
    "Budget created successfully": "Orçamento criado com sucesso",
    "Budget deleted successfully": "Orçamento eliminado com sucesso",
    "Budget delete failed": "Falha ao eliminar orçamento",
    "Failed to load financial dashboard": "Falha ao carregar o painel financeiro",
    "Advance Payment Guarantees (APG)": "Garantias de Adiantamento (APG)",
    "Performance Security (PG)": "Garantia de Execução (PG)",
    "Amendment No. 01": "Emenda N.º 01",
    "Amendment No. 02": "Emenda N.º 02",
    "Amendment No. 03": "Emenda N.º 03",
    "Amendment No. 04": "Emenda N.º 04",
    "Amendment No. 05": "Emenda N.º 05",
    "Initial amendment record to be updated from contract file": "Registo inicial de emenda a atualizar a partir do ficheiro contratual",
    "Second amendment record to be updated from contract file": "Segundo registo de emenda a atualizar a partir do ficheiro contratual",
    "Third amendment record to be updated from contract file": "Terceiro registo de emenda a atualizar a partir do ficheiro contratual",
    "Revised DDR scope: 92.677 km / 5,303 HSC (USD 6,044,736.58)": "Âmbito DDR revisto: 92,677 km / 5.303 HSC (USD 6.044.736,58)",
    "EOT + Price Adjustment": "EOT + Ajustamento de Preço",
    "Drafting": "Em Elaboração",
    "HDPE Pipe Stock (May 2026)": "Stock de Tubos HDPE (Maio de 2026)",
    "Received, used and available HDPE pipe stock summary": "Resumo do stock de tubos HDPE recebido, utilizado e disponível",
    "Received (m)": "Recebido (m)",
    "Used (m)": "Utilizado (m)",
    "Stock (m)": "Stock (m)",
    "Cover": "Cobertura",
    "Equipment Deployment (May 2026)": "Mobilização de Equipamentos (Maio de 2026)",
    "Planned versus deployed equipment summary": "Resumo dos equipamentos planeados versus mobilizados",
    "Deployed": "Mobilizado",
    "Variance": "Variação",
    "Workforce By Employer": "Força de Trabalho por Empregador",
    "Employer, category and headcount breakdown": "Desagregação por empregador, categoria e efetivo",
    "Group": "Grupo",
    "Headcount": "Efetivo",
    "Total": "Total",
    "Total Capacity": "Capacidade Total",
    "Total Capacity / Quantity": "Capacidade Total / Quantidade",
    "Allocated Quantity": "Quantidade Alocada",
    "Remaining Capacity": "Capacidade Restante",
    "Name": "Nome",
    "No material records found.": "Nenhum registo de material encontrado.",
    "No equipment records found.": "Nenhum registo de equipamento encontrado.",
    "No manpower records found.": "Nenhum registo de mão de obra encontrado.",
    "Add Material": "Adicionar Material",
    "Add Equipment": "Adicionar Equipamento",
    "Add Manpower": "Adicionar Mão de Obra",
    "Edit Material": "Editar Material",
    "Edit Equipment": "Editar Equipamento",
    "Edit Manpower": "Editar Mão de Obra",
    "Material updated successfully": "Material atualizado com sucesso",
    "Equipment updated successfully": "Equipamento atualizado com sucesso",
    "Manpower updated successfully": "Mão de obra atualizada com sucesso",
    "Material added successfully": "Material adicionado com sucesso",
    "Equipment added successfully": "Equipamento adicionado com sucesso",
    "Manpower added successfully": "Mão de obra adicionada com sucesso",
    "Resource deleted successfully": "Recurso eliminado com sucesso",
    "Resource data exported": "Dados de recursos exportados",
    "Failed to load resource dashboard data": "Falha ao carregar dados do painel de recursos",
    "Materials - 1 Critical": "Materiais - 1 Crítico",
    "Materials Below Reorder": "Materiais Abaixo do Ponto de Reposição",
    "Equipment Utilization": "Utilização de Equipamentos",
    "Manpower Composition": "Composição da Mão de Obra",
    "Manpower Deployed": "Mão de Obra Mobilizada",
    "Idle / Maintenance": "Inativo / Manutenção",
    "Stock, consumption & critical inventory": "Stock, consumo e inventário crítico",
    "Availability, utilization & maintenance": "Disponibilidade, utilização e manutenção",
    "Projected Slippage": "Atraso Projetado",
    "Open Delay Items": "Itens de Atraso em Aberto",
    "Mitigated This Quarter": "Mitigado Nesta Quarto",
    "On Critical Path": "No Caminho Crítico",
    "Add Delay": "Adicionar Atraso",
    "Not properly planned and coordinated by the contractor.": "Não planejado e coordenado adequadamente pelo contratado.",
    "Delay Item": "Item de Atraso",
    "Root Cause": "Causa Raiz",
    "Risk ownership, compliance tracking & corrective actions": "Propriedade do risco, acompanhamento da conformidade e ações corretivas",
    "Add Risk": "Adicionar Risco",
    "Regulatory": "Regulatório",
    "Project Director": "Diretor do Projeto",
    "Procurement Lead": "Responsável de Aquisições",
    "Site Manager": "Gerente de Obra",
    "Site Engineer": "Engenheiro de Obra",
    "Resource": "Recurso",
    "Technical": "Técnico",
    "High": "Alto",
    "Medium": "Médio",
    "Low": "Baixo",
    "Risk updated successfully": "Risco atualizado com sucesso",
    "Risk added successfully": "Risco adicionado com sucesso",
    "Risk deleted successfully": "Risco eliminado com sucesso",
    "Failed to update risk": "Falha ao atualizar risco",
    "Failed to add risk": "Falha ao adicionar risco",
    "Failed to delete risk": "Falha ao eliminar risco",
    "Failed to update resource": "Falha ao atualizar recurso",
    "Balance": "Saldo",
    "Failed to delete resource": "Falha ao eliminar recurso",
    "Something went wrong": "Ocorreu um erro",
    "No material below reorder": "Nenhum material abaixo do ponto de reposição",
    "Per Month-5 plan": "Conforme plano do Mês 5",
    "CTCE + 2 Subcontractors": "CTCE + 2 Subempreiteiros",
    "Gap": "Diferença",
    "Shortfall": "Défice",
    "Female %": "% Feminino",
    "5 of 115": "5 de 115",
    "Local Nationals": "Nacionais Locais",
    "Subcontracted unqualified": "Subcontratados não qualificados",
    "Foreign Workers": "Trabalhadores Estrangeiros",
    "Subcontracted specialists": "Especialistas subcontratados",
    "No manpower data": "Sem dados de mão de obra",
    "Construction Manager": "Gestor de Construção",
    "Site Engineers": "Engenheiros de Obra",
    "Land Surveyor": "Topógrafo",
    "HSE Officer + Assistant": "Responsável HSE + Assistente",
    "Social Expert + Assistants": "Especialista Social + Assistentes",
    "Other Specialists": "Outros Especialistas",
    "Skilled": "Qualificado",
    "Unskilled": "Não Qualificado",
    "Grand Total": "Total Geral",
    "Project:": "Projeto:",
    "Not loaded": "Não carregado",
    "Unnamed Project": "Projeto sem nome",
    "No reports found. Add your first report above.": "Nenhum relatório encontrado. Adicione o primeiro relatório acima.",
    "No periodic reports found.": "Nenhum relatório periódico encontrado.",
    "No IPCs found.": "Nenhum IPC encontrado.",
    "No amendments found.": "Nenhuma emenda encontrada.",
    "No method statements found.": "Nenhuma declaração de método encontrada.",
    "Loading reports...": "A carregar relatórios...",
    "Loading periodic reports...": "A carregar relatórios periódicos...",
    "Loading IPCs...": "A carregar IPCs...",
    "Loading amendments...": "A carregar emendas...",
    "Loading method statements...": "A carregar declarações de método...",
    "Failed to load reports.": "Falha ao carregar relatórios.",
    "Failed to load periodic reports.": "Falha ao carregar relatórios periódicos.",
    "Failed to load IPCs.": "Falha ao carregar IPCs.",
    "Failed to load amendments.": "Falha ao carregar emendas.",
    "Failed to load method statements.": "Falha ao carregar declarações de método.",
    "Failed to load reports library.": "Falha ao carregar a biblioteca de relatórios.",
    "Report title is required.": "O título do relatório é obrigatório.",
    "Report period is required.": "O período do relatório é obrigatório.",
    "Generated date is required.": "A data de geração é obrigatória.",
    "Date From cannot be later than Date To.": "A Data Inicial não pode ser posterior à Data Final.",
    "Project context is missing. Please seed or create a project first.": "Contexto do projeto em falta. Insira ou crie primeiro um projeto.",
    "Report updated successfully.": "Relatório atualizado com sucesso.",
    "Report created successfully.": "Relatório criado com sucesso.",
    "Failed to save report.": "Falha ao guardar relatório.",
    "Report deleted successfully.": "Relatório eliminado com sucesso.",
    "Failed to delete report.": "Falha ao eliminar relatório.",
    "Export response is missing file content.": "A resposta de exportação não contém o conteúdo do ficheiro.",
    "No reports available to export.": "Não há relatórios disponíveis para exportar.",
    "Reports exported successfully.": "Relatórios exportados com sucesso.",
    "Import failed. No records were saved.": "Importação falhou. Nenhum registo foi guardado.",
    "Failed to import reports.": "Falha ao importar relatórios.",
    "Report Title": "Título do Relatório",
    "Module": "Módulo",
    "Date From": "Data Inicial",
    "Date To": "Data Final",
    "Generated Date": "Data de Geração",
    "Summary": "Resumo",
    "Overall": "Geral",
    "Construction": "Construção",
    "Financial": "Financeiro",
    "Resources": "Recursos",
    "Risk & Delay": "Risco e Atraso",
    "EHS": "EHS",
    "GIS": "SIG",
    "Custom Progress Report": "Relatório Personalizado de Progresso",
    "Custom report draft generated from the Reports module.": "Rascunho de relatório personalizado gerado a partir do módulo de Relatórios.",
    "Custom draft prepared. Review and click Save Report.": "Rascunho personalizado preparado. Reveja e clique em Guardar Relatório.",
    "Session expired. Please login again.": "Sessão expirada. Por favor, inicie sessão novamente.",
    "No project found for construction progress": "Nenhum projeto encontrado para o progresso da construção",
    "Failed to load construction data": "Falha ao carregar dados de construção"
  };

  function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) === PORTUGUESE_LANG ? PORTUGUESE_LANG : DEFAULT_LANG;
  }

  function isPortuguese() {
    return getLanguage() === PORTUGUESE_LANG;
  }

  function getLocale() {
    return isPortuguese() ? "pt-AO" : "en-US";
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function translatePattern(original) {
    var text = String(original == null ? "" : original);

    if (!isPortuguese()) return text;

    text = text.replace(/^Filtered to (.+)$/i, function (_, zone) {
      return "Filtrado para " + translateText(zone);
    });

    text = text.replace(/^Search is a placeholder in this demo [—-] you searched "(.+)"$/i, function (_, term) {
      return "A pesquisa é apenas demonstrativa neste painel - pesquisou \"" + term + "\"";
    });

    text = text.replace(/^(\d+) material item\(s\) need attention$/i, function (_, count) {
      return count + " item(ns) de material precisam de atenção";
    });

    text = text.replace(/^(.+)% utilization · (.+)$/i, function (_, pct, unit) {
      return pct + "% de utilização · " + unit;
    });

    text = text.replace(/^Physical ahead of financial by (.+)pp$/i, function (_, diff) {
      return "Físico à frente do financeiro em " + String(diff).replace(".", ",") + " pp";
    });

    text = text.replace(/^Physical behind financial by (.+)pp$/i, function (_, diff) {
      return "Físico atrás do financeiro em " + String(diff).replace(".", ",") + " pp";
    });

    text = text.replace(/^Delete "(.+)"\? This will remove it from the Reports list\.$/i, function (_, name) {
      return "Eliminar \"" + name + "\"? Isto irá removê-lo da lista de Relatórios.";
    });

    text = text.replace(/^Delete budget "(.+)"\?$/i, function (_, name) {
      return "Eliminar orçamento \"" + name + "\"?";
    });

    text = text.replace(/^Delete resource "(.+)"\? This is allowed only if it has no allocations\.$/i, function (_, name) {
      return "Eliminar recurso \"" + name + "\"? Isto só é permitido se não tiver alocações.";
    });

    text = text.replace(/^(\d+) reports imported\. (\d+) records failed\.$/i, function (_, ok, failed) {
      return ok + " relatórios importados. " + failed + " registos falharam.";
    });

    text = text.replace(/^(\d+) reports imported successfully\.$/i, function (_, ok) {
      return ok + " relatórios importados com sucesso.";
    });

    text = text.replace(/^(.+) exported successfully\.$/i, function (_, label) {
      return translateText(label) + " exportado com sucesso.";
    });

    return text;
  }

  function translateText(value) {
    var raw = String(value == null ? "" : value);
    var trimmed = normalizeText(raw);

    if (!isPortuguese() || !trimmed) return raw;

    if (Object.prototype.hasOwnProperty.call(DICTIONARY, trimmed)) {
      return raw.replace(trimmed, DICTIONARY[trimmed]);
    }

    return translatePattern(raw);
  }

  function translateHtmlString(value) {
    var html = String(value == null ? "" : value);

    if (!html) return html;

    return html
      .split(/(<[^>]+>)/g)
      .map(function (part) {
        if (!part || /^<[^>]+>$/.test(part)) return part;
        return translateText(part);
      })
      .join("");
  }

  function translatePageConfig() {
    var page;

    if (!window.WSDP_PAGE) return;

    page = window.WSDP_PAGE;

    if (!page.__wsdpOriginals) {
      page.__wsdpOriginals = {
        title: page.title,
        breadcrumb: page.breadcrumb,
        statusText: page.statusText
      };
    }

    if (isPortuguese()) {
      if (typeof page.__wsdpOriginals.title === "string") {
        page.title = translateText(page.__wsdpOriginals.title);
      }

      if (typeof page.__wsdpOriginals.breadcrumb === "string") {
        page.breadcrumb = translateHtmlString(page.__wsdpOriginals.breadcrumb);
      }

      if (typeof page.__wsdpOriginals.statusText === "string") {
        page.statusText = translateText(page.__wsdpOriginals.statusText);
      }
    } else {
      page.title = page.__wsdpOriginals.title;
      page.breadcrumb = page.__wsdpOriginals.breadcrumb;
      page.statusText = page.__wsdpOriginals.statusText;
    }
  }

  function updateDocumentMeta() {
    var description;

    if (!document.__wsdpOriginalTitle) {
      document.__wsdpOriginalTitle = document.title;
    }

    if (document.__wsdpOriginalTitle) {
      document.title = isPortuguese() ? translateText(document.__wsdpOriginalTitle) : document.__wsdpOriginalTitle;
    }

    description = document.querySelector('meta[name="description"]');

    if (description) {
      if (!description.__wsdpOriginalContent) {
        description.__wsdpOriginalContent = description.getAttribute("content") || "";
      }

      description.setAttribute(
        "content",
        isPortuguese() ? translateText(description.__wsdpOriginalContent) : description.__wsdpOriginalContent
      );
    }
  }

  function shouldSkipTextNode(node) {
    var parent;
    var tag;

    if (!node || !node.nodeValue || !node.nodeValue.trim()) return true;

    parent = node.parentElement;
    if (!parent) return true;

    tag = parent.tagName;

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "CODE" || tag === "PRE" || tag === "CANVAS") {
      return true;
    }

    if (parent.closest("[data-wsdp-no-translate]")) return true;

    return false;
  }

  function translateTextNode(node) {
    var original;
    var next;

    if (shouldSkipTextNode(node)) return;

    if (!textOriginals.has(node)) {
      textOriginals.set(node, node.nodeValue);
    }

    original = textOriginals.get(node);
    next = isPortuguese() ? translateText(original) : original;

    if (node.nodeValue !== next) {
      node.nodeValue = next;
    }
  }

  function getAttrStore(element) {
    var store = attrOriginals.get(element);

    if (!store) {
      store = {};
      attrOriginals.set(element, store);
    }

    return store;
  }

  function translateAttribute(element, attributeName) {
    var store;
    var original;
    var next;

    if (!element || !element.hasAttribute || !element.hasAttribute(attributeName)) return;

    store = getAttrStore(element);

    if (!Object.prototype.hasOwnProperty.call(store, attributeName)) {
      store[attributeName] = element.getAttribute(attributeName);
    }

    original = store[attributeName];
    next = isPortuguese() ? translateText(original) : original;

    if (element.getAttribute(attributeName) !== next) {
      element.setAttribute(attributeName, next);
    }
  }

  function translateOption(option) {
    var original;
    var next;

    if (!option) return;

    if (!optionOriginals.has(option)) {
      optionOriginals.set(option, option.textContent);
    }

    original = optionOriginals.get(option);
    next = isPortuguese() ? translateText(original) : original;

    if (option.textContent !== next) {
      option.textContent = next;
    }
  }

  function translateAttributes(root) {
    var selector = "[placeholder], [aria-label], [title], [data-tooltip], option";
    var elements = [];

    if (!root) return;

    if (root.nodeType === 1 && root.matches && root.matches(selector)) {
      elements.push(root);
    }

    if (root.querySelectorAll) {
      Array.prototype.forEach.call(root.querySelectorAll(selector), function (element) {
        elements.push(element);
      });
    }

    elements.forEach(function (element) {
      translateAttribute(element, "placeholder");
      translateAttribute(element, "aria-label");
      translateAttribute(element, "title");
      translateAttribute(element, "data-tooltip");

      if (element.tagName === "OPTION") {
        translateOption(element);
      }
    });
  }

  function translateDom(root) {
    var base = root || document.body;
    var walker;
    var nodes = [];

    if (!base) return;

    translateAttributes(base);

    if (base.nodeType === Node.TEXT_NODE) {
      translateTextNode(base);
      return;
    }

    if (base.nodeType !== Node.ELEMENT_NODE && base.nodeType !== Node.DOCUMENT_NODE) return;

    walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return shouldSkipTextNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(translateTextNode);
  }

  function injectStyles() {
    var style;

    if (document.getElementById("wsdpI18nStyles")) return;

    style = document.createElement("style");
    style.id = "wsdpI18nStyles";
    style.textContent = "" +
      ".wsdp-language-wrap{display:inline-flex;align-items:center;}" +
      ".wsdp-language-selector{height:34px;min-width:138px;padding:0 10px;border-radius:999px;border:1px solid var(--border-color,#E3E7EB);background:var(--card-bg,#fff);color:var(--text-primary,#16232F);font-size:12px;font-weight:700;outline:none;cursor:pointer;}" +
      ".wsdp-language-selector:focus{box-shadow:0 0 0 3px rgba(31,122,140,.14);}" +
      "@media(max-width:760px){.wsdp-language-selector{min-width:118px;max-width:132px;}}";

    document.head.appendChild(style);
  }

  function injectLanguageSelector() {
    var target;
    var wrapper;
    var selector;
    var themeButton;

    if (document.getElementById("languageSelector")) return;

    target = document.querySelector(".topbar-right") || document.getElementById("topbarMount");
    if (!target) return;

    wrapper = document.createElement("div");
    wrapper.className = "wsdp-language-wrap";
    wrapper.innerHTML = "" +
      "<select id=\"languageSelector\" class=\"wsdp-language-selector\" aria-label=\"Language\">" +
      "<option value=\"en\">English</option>" +
      "<option value=\"pt-AO\">Português (AO)</option>" +
      "</select>";

    themeButton = document.getElementById("themeToggleBtn");

    if (themeButton && themeButton.parentNode === target) {
      target.insertBefore(wrapper, themeButton);
    } else {
      target.appendChild(wrapper);
    }

    selector = document.getElementById("languageSelector");
    if (!selector) return;

    selector.value = getLanguage();
    selector.addEventListener("change", function () {
      setLanguage(selector.value);
    });
  }

  function updateHeaderDate() {
    var element = document.getElementById("headerDate");
    var options;

    if (!element) return;

    options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    };

    try {
      element.textContent = new Date().toLocaleDateString(getLocale(), options);
    } catch (error) {
      element.textContent = new Date().toLocaleDateString("en-US", options);
    }
  }

  function translateCharts() {
    if (!window.Chart || typeof window.Chart.getChart !== "function") return;

    Array.prototype.forEach.call(document.querySelectorAll("canvas"), function (canvas) {
      var chart;

      try {
        chart = window.Chart.getChart(canvas);
      } catch (error) {
        chart = null;
      }

      if (!chart || !chart.data || !Array.isArray(chart.data.datasets)) return;

      chart.data.datasets.forEach(function (dataset) {
        if (!dataset) return;

        if (!dataset.__wsdpOriginalLabel && dataset.label) {
          dataset.__wsdpOriginalLabel = dataset.label;
        }

        if (dataset.__wsdpOriginalLabel) {
          dataset.label = isPortuguese() ? translateText(dataset.__wsdpOriginalLabel) : dataset.__wsdpOriginalLabel;
        }
      });

      try {
        chart.update();
      } catch (error) {
        // Do not block page translation if a chart update fails.
      }
    });
  }

  function applyTranslations(root) {
    var selector;

    document.documentElement.setAttribute("lang", isPortuguese() ? PORTUGUESE_LANG : DEFAULT_LANG);

    injectStyles();
    injectLanguageSelector();

    selector = document.getElementById("languageSelector");
    if (selector) selector.value = getLanguage();

    translatePageConfig();
    updateDocumentMeta();
    translateDom(root || document.body);
    updateHeaderDate();
    translateCharts();
  }

  function scheduleTranslations(root) {
    window.clearTimeout(translateTimer);

    translateTimer = window.setTimeout(function () {
      applyTranslations(root || document.body);
    }, 80);
  }

  function startObserver() {
    if (observer || !document.body || typeof MutationObserver === "undefined") return;

    observer = new MutationObserver(function (mutations) {
      var shouldTranslate = false;

      mutations.forEach(function (mutation) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldTranslate = true;
        }

        if (mutation.type === "characterData" || mutation.type === "attributes") {
          shouldTranslate = true;
        }
      });

      if (shouldTranslate) {
        scheduleTranslations(document.body);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title", "data-tooltip"]
    });
  }

  function setLanguage(language) {
    var next = language === PORTUGUESE_LANG ? PORTUGUESE_LANG : DEFAULT_LANG;

    localStorage.setItem(STORAGE_KEY, next);
    applyTranslations(document.body);

    document.dispatchEvent(new CustomEvent("wsdp:languagechange", {
      detail: {
        language: next,
        locale: getLocale()
      }
    }));
  }

  function init() {
    if (initialized) return;
    initialized = true;

    injectStyles();
    injectLanguageSelector();
    applyTranslations(document.body);
    startObserver();

    window.setTimeout(function () {
      injectLanguageSelector();
      applyTranslations(document.body);
      startObserver();
    }, 250);

    window.setTimeout(function () {
      applyTranslations(document.body);
    }, 900);
  }

  window.WSDP_I18N = {
    getLang: getLanguage,
    getLanguage: getLanguage,
    setLang: setLanguage,
    setLanguage: setLanguage,
    getLocale: getLocale,
    translate: translateText,
    t: translateText,
    applyTranslations: applyTranslations,
    updateHeaderDate: updateHeaderDate
  };

  window.WSDP_T = translateText;

  document.addEventListener("DOMContentLoaded", init);

  document.addEventListener("wsdp:shellready", function () {
    injectLanguageSelector();
    applyTranslations(document.body);
    startObserver();
  });

  document.addEventListener("wsdp:authready", function () {
    scheduleTranslations(document.body);
  });

  document.addEventListener("wsdp:themechange", function () {
    scheduleTranslations(document.body);
  });

  if (document.readyState !== "loading") {
    init();
  }
})();
