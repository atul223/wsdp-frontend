
// js/i18n.js
(function () {

  const TRANSLATIONS = {

    en: {

      dashboard: "Dashboard",

      searchPlaceholder: "Search villages, IPCs, reports…",

      collapse: "Collapse",

      overview: "Overview",
      progressTracking: "Progress Tracking",
      resourcesFinance: "Resources & Finance",
      riskSafety: "Risk & Safety",
      tools: "Tools",

      homeDashboard: "Home Dashboard",
      projectOverview: "Project Overview",
      constructionProgress: "Construction Progress",
      pipelineProgress: "Pipeline Progress",
      houseConnections: "House Connections",
      testingCommissioning: "Testing & Commissioning",
      valveChambers: "Valve Chambers",
      bridgeCrossings: "Bridge Crossings",
      gisMap: "GIS Map",
      financialDashboard: "Financial Dashboard",
      resourceDashboard: "Resource Dashboard",
      materials: "Materials",
      equipment: "Equipment",
      manpower: "Manpower",
      delayAnalysis: "Delay Analysis",
      riskRegister: "Risk Register",
      ehsDashboard: "EHS Dashboard",
      socialEnvironmental: "Social & Environmental",
      reports: "Reports",
      settings: "Settings"

    },

    pt: {

      dashboard: "Painel",

      searchPlaceholder: "Pesquisar aldeias, IPCs, relatórios...",

      collapse: "Recolher",

      overview: "Visão Geral",
      progressTracking: "Acompanhamento do Progresso",
      resourcesFinance: "Recursos e Finanças",
      riskSafety: "Riscos e Segurança",
      tools: "Ferramentas",

      homeDashboard: "Painel Inicial",
      projectOverview: "Visão Geral do Projeto",
      constructionProgress: "Progresso da Construção",
      pipelineProgress: "Progresso da Tubulação",
      houseConnections: "Ligações Residenciais",
      testingCommissioning: "Testes e Comissionamento",
      valveChambers: "Câmaras de Válvulas",
      bridgeCrossings: "Travessias de Pontes",
      gisMap: "Mapa GIS",
      financialDashboard: "Painel Financeiro",
      resourceDashboard: "Painel de Recursos",
      materials: "Materiais",
      equipment: "Equipamentos",
      manpower: "Mão de Obra",
      delayAnalysis: "Análise de Atrasos",
      riskRegister: "Registro de Riscos",
      ehsDashboard: "Painel EHS",
      socialEnvironmental: "Social e Ambiental",
      reports: "Relatórios",
      settings: "Configurações"

    }

  };

})();

function getLanguage() {
  return localStorage.getItem("wsdp_language") || "en";
}

function setLanguage(lang) {
  localStorage.setItem("wsdp_language", lang);
}