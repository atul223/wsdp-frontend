/* ============================================================
   i18n.js - English / Portuguese translation support
   For WSDP multi-page dashboard

   How it works:
   - Reads selected language from localStorage key: wsdp_language
   - Translates exact matching UI text from English to Portuguese
   - Reverts Portuguese text back to English when English is selected
   - Translates text nodes and common attributes like placeholder,
     aria-label, title and data-tooltip
   - Does not translate free-form database/user-entered text unless
     it has an exact dictionary match
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "wsdp_language";
  var DEFAULT_LANGUAGE = "en";

  var EN_TO_PT = {
    /* Common UI */
    "Dashboard": "Painel",
    "Save": "Guardar",
    "Cancel": "Cancelar",
    "Edit": "Editar",
    "Delete": "Eliminar",
    "Update": "Atualizar",
    "Add": "Adicionar",
    "Export": "Exportar",
    "Search": "Pesquisar",
    "Settings": "Definições",
    "Reports": "Relatórios",
    "Actions": "Ações",
    "Status": "Estado",
    "Type": "Tipo",
    "Method": "Método",
    "Remarks": "Observações",
    "Name": "Nome",
    "Date": "Data",
    "Amount": "Valor",
    "Total": "Total",
    "Completed": "Concluído",
    "Complete": "Concluído",
    "In Progress": "Em Progresso",
    "Not Started": "Não Iniciado",
    "Mobilising": "Em Mobilização",
    "Delayed": "Atrasado",
    "On Track": "Dentro do Prazo",
    "At Risk": "Em Risco",
    "At Risk - Schedule": "Em Risco - Cronograma",
    "At Risk \u2014 Schedule": "Em Risco - Cronograma",
    "Overall project RAG status": "Estado geral RAG do projeto",
    "Notifications": "Notificações",
    "Account menu": "Menu da conta",
    "Log out": "Sair",
    "Logging out...": "A sair...",
    "Logging out…": "A sair...",
    "Language": "Idioma",
    "Language selector": "Seletor de idioma",
    "Toggle dark mode": "Alternar modo escuro",
    "Open menu": "Abrir menu",
    "Collapse": "Recolher",
    "Collapse sidebar": "Recolher barra lateral",
    "Global search": "Pesquisa global",
    "Search villages, IPCs, reports...": "Pesquisar aldeias, IPCs, relatórios...",
    "Search villages, IPCs, reports…": "Pesquisar aldeias, IPCs, relatórios...",
    "No records match these filters.": "Nenhum registo corresponde a estes filtros.",
    "Clear filters": "Limpar filtros",
    "Showing all zones": "A mostrar todas as zonas",
    "Filtered to": "Filtrado para",

    /* Sidebar sections */
    "Overview": "Visão Geral",
    "Progress Tracking": "Acompanhamento do Progresso",
    "Resources & Finance": "Recursos e Finanças",
    "Risk & Safety": "Risco e Segurança",
    "Tools": "Ferramentas",

    /* Sidebar items */
    "Home Dashboard": "Painel Principal",
    "Project Overview": "Visão Geral do Projeto",
    "Construction Progress": "Progresso da Construção",
    "Pipeline Progress": "Progresso da Conduta",
    "House Connections": "Ligações Domiciliárias",
    "Testing & Commissioning": "Ensaios e Comissionamento",
    "Valve Chambers": "Câmaras de Válvulas",
    "Bridge Crossings": "Travessias de Pontes",
    "GIS Map": "Mapa SIG",
    "Financial Dashboard": "Painel Financeiro",
    "Resource Dashboard": "Painel de Recursos",
    "Materials": "Materiais",
    "Equipment": "Equipamento",
    "Manpower": "Mão de Obra",
    "Delay Analysis": "Análise de Atrasos",
    "Risk Register": "Registo de Riscos",
    "EHS Dashboard": "Painel de EHS",
    "Social & Environmental": "Social e Ambiental",

    /* Branding */
    "Water Supply Distribution": "Distribuição de Abastecimento de Água",
    "Water Supply Distribution Project": "Projeto de Distribuição de Abastecimento de Água",
    "PDISA WSDP": "PDISA WSDP",
    "PDISA-2 Lubango": "PDISA-2 Lubango",

    /* Construction progress */
    "Scope": "Âmbito",
    "All Zones": "Todas as Zonas",
    "Zone A": "Zona A",
    "Zone B": "Zona B",
    "Zone C": "Zona C",
    "Zone D": "Zona D",
    "Last 30 days": "Últimos 30 dias",
    "Last 90 days": "Últimos 90 dias",
    "This quarter": "Este trimestre",
    "Year to date": "Ano até à data",
    "Add Section": "Adicionar Secção",
    "Add Cluster": "Adicionar Agrupamento",
    "Add Activity": "Adicionar Atividade",
    "Update Summary": "Atualizar Resumo",
    "Add Crossing": "Adicionar Travessia",
    "Laid": "Assentado",
    "Hydro-Tested": "Testado Hidrostaticamente",
    "Remaining": "Restante",
    "Pipeline Progress by Zone": "Progresso da Conduta por Zona",
    "Chainage-wise Status": "Estado por Estaca",
    "Activity": "Atividade",
    "Planned": "Planeado",
    "Actual": "Real",
    "Chainage": "Estaca",
    "Diameter": "Diâmetro",
    "Length": "Comprimento",
    "Length (km)": "Comprimento (km)",
    "Laying": "Assentamento",
    "Testing": "Teste",
    "Village cluster-wise connection progress": "Progresso das ligações por agrupamento de aldeias",
    "House Connections - Village Cluster Breakdown": "Ligações Domiciliárias - Detalhe por Agrupamento de Aldeias",
    "House Connections \u2014 Village Cluster Breakdown": "Ligações Domiciliárias - Detalhe por Agrupamento de Aldeias",
    "House Connection Clusters": "Agrupamentos de Ligações Domiciliárias",
    "Cluster": "Agrupamento",
    "Hydro-testing, disinfection & handover readiness": "Teste hidrostático, desinfeção e prontidão para entrega",
    "Air valves, scour valves & sluice chambers": "Válvulas de ar, válvulas de descarga e câmaras de seccionamento",
    "Total Planned": "Total Planeado",
    "River, canal & road crossing structures": "Estruturas de travessia de rios, canais e estradas",
    "Crossing": "Travessia",

    /* Construction messages */
    "Pipeline section saved successfully": "Secção da conduta guardada com sucesso",
    "Pipeline section deleted": "Secção da conduta eliminada",
    "House connection cluster saved successfully": "Agrupamento de ligações domiciliárias guardado com sucesso",
    "House connection cluster deleted": "Agrupamento de ligações domiciliárias eliminado",
    "Testing activity saved successfully": "Atividade de teste guardada com sucesso",
    "Testing activity deleted": "Atividade de teste eliminada",
    "Valve chamber summary updated": "Resumo das câmaras de válvulas atualizado",
    "Bridge crossing saved successfully": "Travessia guardada com sucesso",
    "Bridge crossing deleted": "Travessia eliminada",
    "No pipeline sections added yet.": "Ainda não foram adicionadas secções da conduta.",
    "No house connection clusters added yet.": "Ainda não foram adicionados agrupamentos de ligações domiciliárias.",
    "No testing activities added yet.": "Ainda não foram adicionadas atividades de teste.",
    "No bridge crossings added yet.": "Ainda não foram adicionadas travessias.",
    "Delete this pipeline section?": "Eliminar esta secção da conduta?",
    "Delete this house connection cluster?": "Eliminar este agrupamento de ligações domiciliárias?",
    "Delete this testing activity?": "Eliminar esta atividade de teste?",
    "Delete this bridge crossing?": "Eliminar esta travessia?",

    /* GIS */
    "GIS Map - 7 Intervention Areas (Lubango)": "Mapa SIG - 7 Áreas de Intervenção (Lubango)",
    "GIS Map \u2014 7 Intervention Areas (Lubango)": "Mapa SIG - 7 Áreas de Intervenção (Lubango)",
    "GIS Map - Lubango Distribution Network Intervention Areas": "Mapa SIG - Áreas de Intervenção da Rede de Distribuição do Lubango",
    "GIS Map \u2014 Lubango Distribution Network Intervention Areas": "Mapa SIG - Áreas de Intervenção da Rede de Distribuição do Lubango",
    "Pipeline corridor, work fronts and intervention areas": "Corredor da conduta, frentes de trabalho e áreas de intervenção",
    "Intervention Areas": "Áreas de Intervenção",
    "Legend": "Legenda",
    "Reset Filters": "Repor Filtros",
    "Project city center": "Centro da cidade do projeto",
    "Area": "Área",
    "Notional Delay: 6.5 months": "Atraso Estimado: 6,5 meses",
    "Casa Verde": "Casa Verde",
    "Escola Portuguesa": "Escola Portuguesa",
    "Cowboy I": "Cowboy I",
    "Sofrio": "Sofrio",
    "João de Almeida": "João de Almeida",
    "Caixote ou Socombar": "Caixote ou Socombar",
    "Arimba": "Arimba",
    "Western Corridor": "Corredor Oeste",
    "Central Corridor": "Corredor Central",
    "Northern Corridor": "Corredor Norte",
    "Eastern Corridor": "Corredor Este",

    /* Financial */
    "Budget": "Orçamento",
    "Expenditure": "Despesa",
    "Payments": "Pagamentos",
    "IPC Tracker": "Rastreador de IPC",
    "Bank Guarantees": "Garantias Bancárias",
    "Amendments": "Aditamentos",
    "Financial Summary": "Resumo Financeiro",
    "Allocated": "Alocado",
    "Spent": "Gasto",
    "Balance": "Saldo",
    "Approved": "Aprovado",
    "Pending": "Pendente",
    "Rejected": "Rejeitado",
    "Vendor": "Fornecedor",
    "Invoice": "Fatura",
    "Payment Date": "Data de Pagamento",
    "Amount Paid": "Valor Pago",

    /* Resources */
    "Material": "Material",
    "Quantity": "Quantidade",
    "Unit": "Unidade",
    "Source": "Origem",
    "Contractor": "Empreiteiro",
    "Available": "Disponível",
    "Deployed": "Mobilizado",
    "Idle": "Inativo",
    "Under Maintenance": "Em Manutenção",

    /* Risk and delay */
    "Risk": "Risco",
    "Risks": "Riscos",
    "Delay": "Atraso",
    "Delays": "Atrasos",
    "Category": "Categoria",
    "Description": "Descrição",
    "Probability": "Probabilidade",
    "Impact": "Impacto",
    "Owner": "Responsável",
    "Mitigation Plan": "Plano de Mitigação",
    "Root Cause": "Causa Raiz",
    "Days Delayed": "Dias de Atraso",
    "High": "Alto",
    "Medium": "Médio",
    "Low": "Baixo",
    "Open": "Aberto",
    "Closed": "Fechado",

    /* EHS */
    "Environment, Health & Safety": "Ambiente, Saúde e Segurança",
    "Incident": "Incidente",
    "Incidents": "Incidentes",
    "Inspection": "Inspeção",
    "Inspections": "Inspeções",
    "Checklist": "Lista de Verificação",
    "Severity": "Gravidade",
    "Compliance": "Conformidade",
    "Score": "Pontuação",
    "Safe": "Seguro",
    "Unsafe": "Inseguro",

    /* Reports, settings, auth */
    "Generate Report": "Gerar Relatório",
    "Download Report": "Descarregar Relatório",
    "Profile": "Perfil",
    "Users": "Utilizadores",
    "Roles": "Funções",
    "Permissions": "Permissões",
    "Email": "E-mail",
    "Password": "Palavra-passe",
    "Login": "Iniciar sessão",
    "Sign in": "Entrar",
    "Session expired. Please login again.": "Sessão expirada. Inicie sessão novamente.",
    "Save failed": "Falha ao guardar",
    "Action failed": "Ação falhou",
    "Request failed": "Pedido falhou",

    /* Footer */
    "Water Supply Distribution Project - Monitoring Dashboard · Sample data for layout demonstration": "Projeto de Distribuição de Abastecimento de Água - Painel de Monitorização · Dados de exemplo para demonstração do layout",
    "Water Supply Distribution Project \u2014 Monitoring Dashboard · Sample data for layout demonstration": "Projeto de Distribuição de Abastecimento de Água - Painel de Monitorização · Dados de exemplo para demonstração do layout",
    "PDISA-2 Lubango - Construction Progress Dashboard · Contract 44W3/LUBANGO/DNA/18": "PDISA-2 Lubango - Painel de Progresso da Construção · Contrato 44W3/LUBANGO/DNA/18",
    "PDISA-2 Lubango \u2014 Construction Progress Dashboard · Contract 44W3/LUBANGO/DNA/18": "PDISA-2 Lubango - Painel de Progresso da Construção · Contrato 44W3/LUBANGO/DNA/18"
  };

  var PT_TO_EN = {};

  Object.keys(EN_TO_PT).forEach(function (key) {
    PT_TO_EN[EN_TO_PT[key]] = key;
  });

  var initialized = false;
  var applying = false;
  var observer = null;

  function getLanguage() {
    var lang = localStorage.getItem(STORAGE_KEY);
    return lang === "pt" ? "pt" : DEFAULT_LANGUAGE;
  }

  function setLanguage(lang) {
    var nextLang = lang === "pt" ? "pt" : "en";
    localStorage.setItem(STORAGE_KEY, nextLang);
    applyTranslations();

    document.dispatchEvent(
      new CustomEvent("wsdp:languagechange", {
        detail: {
          language: nextLang
        }
      })
    );
  }

  function trimText(value) {
    return String(value || "").replace(/^\s+|\s+$/g, "");
  }

  function getLeadingWhitespace(value) {
    var match = String(value || "").match(/^\s*/);
    return match ? match[0] : "";
  }

  function getTrailingWhitespace(value) {
    var match = String(value || "").match(/\s*$/);
    return match ? match[0] : "";
  }

  function canonicalEnglishText(text) {
    var clean = trimText(text);

    if (!clean) {
      return "";
    }

    if (Object.prototype.hasOwnProperty.call(EN_TO_PT, clean)) {
      return clean;
    }

    if (Object.prototype.hasOwnProperty.call(PT_TO_EN, clean)) {
      return PT_TO_EN[clean];
    }

    return clean;
  }

  function translateText(text, lang) {
    if (text === null || text === undefined) {
      return text;
    }

    var original = String(text);
    var clean = trimText(original);

    if (!clean) {
      return original;
    }

    var leading = getLeadingWhitespace(original);
    var trailing = getTrailingWhitespace(original);
    var canonical = canonicalEnglishText(clean);

    if (lang === "pt") {
      if (Object.prototype.hasOwnProperty.call(EN_TO_PT, canonical)) {
        return leading + EN_TO_PT[canonical] + trailing;
      }

      return original;
    }

    if (Object.prototype.hasOwnProperty.call(PT_TO_EN, clean)) {
      return leading + PT_TO_EN[clean] + trailing;
    }

    return original;
  }

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) {
      return true;
    }

    var tagName = el.tagName.toLowerCase();

    if (
      tagName === "script" ||
      tagName === "style" ||
      tagName === "canvas" ||
      tagName === "svg" ||
      tagName === "path" ||
      tagName === "code" ||
      tagName === "pre"
    ) {
      return true;
    }

    if (el.getAttribute("data-no-translate") === "true") {
      return true;
    }

    return false;
  }

  function translateTextNodes(root, lang) {
    if (!root) {
      return;
    }

    var walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node || !node.parentElement) {
            return NodeFilter.FILTER_REJECT;
          }

          if (shouldSkipElement(node.parentElement)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (!trimText(node.nodeValue)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    var nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(function (node) {
      var translated = translateText(node.nodeValue, lang);

      if (translated !== node.nodeValue) {
        node.nodeValue = translated;
      }
    });
  }

  function translateAttributes(root, lang) {
    if (!root || !root.querySelectorAll) {
      return;
    }

    var selector = [
      "[placeholder]",
      "[aria-label]",
      "[title]",
      "[data-tooltip]",
      "input[value]",
      "button[value]"
    ].join(",");

    var elements = root.querySelectorAll(selector);

    elements.forEach(function (el) {
      if (shouldSkipElement(el)) {
        return;
      }

      translateAttribute(el, "placeholder", lang);
      translateAttribute(el, "aria-label", lang);
      translateAttribute(el, "title", lang);
      translateAttribute(el, "data-tooltip", lang);

      if (el.hasAttribute("value")) {
        var tagName = el.tagName.toLowerCase();
        var inputType = (el.getAttribute("type") || "").toLowerCase();

        if (
          tagName === "button" ||
          inputType === "button" ||
          inputType === "submit" ||
          inputType === "reset"
        ) {
          translateAttribute(el, "value", lang);
        }
      }
    });
  }

  function translateAttribute(el, attrName, lang) {
    if (!el.hasAttribute(attrName)) {
      return;
    }

    var current = el.getAttribute(attrName);
    var translated = translateText(current, lang);

    if (translated !== current) {
      el.setAttribute(attrName, translated);
    }
  }

  function translateDocumentTitle(lang) {
    if (!document.title) {
      return;
    }

    var translated = translateText(document.title, lang);

    if (translated !== document.title) {
      document.title = translated;
    }
  }

  function updateLanguageSelector(lang) {
    var selector = document.getElementById("languageSelector");

    if (selector && selector.value !== lang) {
      selector.value = lang;
    }
  }

  function bindLanguageSelector() {
    var selector = document.getElementById("languageSelector");

    if (!selector) {
      return;
    }

    if (selector.getAttribute("data-i18n-bound") === "true") {
      updateLanguageSelector(getLanguage());
      return;
    }

    selector.setAttribute("data-i18n-bound", "true");
    selector.value = getLanguage();

    selector.addEventListener("change", function () {
      setLanguage(selector.value);
    });
  }

  function applyTranslations() {
    if (applying) {
      return;
    }

    applying = true;

    try {
      var lang = getLanguage();

      document.documentElement.setAttribute("lang", lang === "pt" ? "pt" : "en");

      updateLanguageSelector(lang);
      translateDocumentTitle(lang);

      if (document.body) {
        translateTextNodes(document.body, lang);
        translateAttributes(document.body, lang);
      }
    } finally {
      applying = false;
    }
  }

  function observeDomChanges() {
    if (observer || !document.body || typeof MutationObserver === "undefined") {
      return;
    }

    var timer = null;

    observer = new MutationObserver(function () {
      if (applying) {
        return;
      }

      window.clearTimeout(timer);

      timer = window.setTimeout(function () {
        bindLanguageSelector();
        applyTranslations();
      }, 120);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "placeholder",
        "aria-label",
        "title",
        "data-tooltip",
        "value"
      ]
    });
  }

  function init() {
    if (initialized) {
      bindLanguageSelector();
      applyTranslations();
      return;
    }

    initialized = true;

    bindLanguageSelector();
    applyTranslations();
    observeDomChanges();

    document.addEventListener("wsdp:shellready", function () {
      bindLanguageSelector();
      applyTranslations();
    });

    document.addEventListener("wsdp:authready", function () {
      bindLanguageSelector();
      applyTranslations();
    });

    document.addEventListener("DOMContentLoaded", function () {
      bindLanguageSelector();
      applyTranslations();
      observeDomChanges();
    });
  }

  window.WSDP_I18N = {
    init: init,
    apply: applyTranslations,
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    t: function (text) {
      return translateText(text, getLanguage());
    }
  };

  init();
})();