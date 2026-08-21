/* ============================================================
   risk-delay.js — Delay Analysis & Risk Register CRUD
   Requires: js/api.js, js/shell.js, js/main.js
   Also uses (loaded via CDN in risk-delay.html):
     - html2canvas + jsPDF  -> Export button
     - SheetJS (XLSX)       -> Import button
   ============================================================ */

(function () {
  "use strict";

  const state = {
    projectId: null,
    delays: [],
    risks: [],
    ncrs: [],
    correctiveActions: [],
    summary: null, // { projected_slippage_days, open_delay_items, mitigated_this_quarter, on_critical_path } | null
    editingDelayId: null,
    editingRiskId: null,
    editingNcrId: null,
    editingActionId: null,
  };

  const delayCategoryOptions = [
    ["regulatory", "Regulatory / NOC"],
    ["materials", "Materials"],
    ["weather", "Weather"],
    ["land_row", "Land / ROW"],
    ["resource", "Resource"],
    ["technical", "Technical"],
    ["financial", "Financial"],
    ["general", "General"],
  ];

  const delayStatusOptions = [
    ["open", "Open"],
    ["in_progress", "In Progress"],
    ["mitigated", "Mitigated"],
    ["closed", "Closed"],
  ];

  const riskCategoryOptions = [
    ["regulatory", "Regulatory"],
    ["financial", "Financial"],
    ["resource", "Resource"],
    ["technical", "Technical"],
    ["environmental", "Environmental"],
    ["safety", "Safety"],
    ["contractual", "Contractual"],
    ["general", "General"],
  ];

  const levelOptions = [
    ["low", "Low"],
    ["medium", "Medium"],
    ["high", "High"],
  ];

  const riskStatusOptions = [
    ["open", "Open"],
    ["mitigated", "Mitigated"],
    ["closed", "Closed"],
  ];

  const ncrStatusOptions = [
    ["open", "Open"],
    ["action_plan_requested", "Action Plan Requested"],
    ["pending", "Pending"],
    ["closed", "Closed"],
  ];

  const actionStatusOptions = [
    ["pending", "Pending"],
    ["in_progress", "In Progress"],
    ["completed", "Completed"],
  ];

  function toast(message, icon) {
    if (window.WSDP_TOAST) {
      window.WSDP_TOAST(message, { icon: icon || "fa-circle-check" });
      return;
    }
    console.log(message);
  }

  function normalizeResponse(result) {
    if (!result) return null;

    if (Array.isArray(result)) return result;

    if (Array.isArray(result.data)) return result.data;

    if (result.data && Array.isArray(result.data.data)) return result.data.data;

    if (result.data && result.data.data && Array.isArray(result.data.data.data)) {
      return result.data.data.data;
    }

    return result.data || result;
  }

  function titleCase(value) {
    if (!value) return "—";

    return String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function optionHtml(options, selected) {
    return options
      .map(function ([value, label]) {
        return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
      })
      .join("");
  }

  function getTokenPayload() {
    try {
      const token = window.WSDP_API?.getAccessToken?.();
      if (!token) return null;

      const payload = token.split(".")[1];
      if (!payload) return null;

      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function readProjectIdFromStorage() {
    const directKeys = [
      "current_project_id",
      "project_id",
      "selected_project_id",
      "wsdp_project_id",
    ];

    for (const key of directKeys) {
      const value = localStorage.getItem(key);
      if (value && value !== "undefined" && value !== "null") return value;
    }

    const objectKeys = ["current_project", "selected_project", "wsdp_current_project"];

    for (const key of objectKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.id) return parsed.id;
        if (parsed?.project_id) return parsed.project_id;
      } catch (e) {
        if (raw.length > 20 && raw.includes("-")) return raw;
      }
    }

    return null;
  }

  function ensureUiEnhancements() {
    const delaySection = document.getElementById("delay-analysis");
    const riskSection = document.getElementById("risk-register");
    const ncrSection = document.getElementById("ncr-register");
    const actionSection = document.getElementById("corrective-actions");

    const delayHeading = delaySection?.querySelector(".section-heading");
    const riskHeading = riskSection?.querySelector(".section-heading");
    const ncrHeading = ncrSection?.querySelector(".section-heading");
    const actionHeading = actionSection?.querySelector(".section-heading");

    if (delayHeading && !document.getElementById("addDelayBtn")) {
      const btn = document.createElement("button");
      btn.className = "btn-primary";
      btn.id = "addDelayBtn";
      btn.type = "button";
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add Delay`;
      delayHeading.appendChild(btn);
      btn.addEventListener("click", function () {
        openDelayForm();
      });
    }

    if (delayHeading && !document.getElementById("editSummaryBtn")) {
      const btn = document.createElement("button");
      btn.className = "btn-ghost";
      btn.id = "editSummaryBtn";
      btn.type = "button";
      btn.innerHTML = `<i class="fa-solid fa-gauge-high"></i> Update Summary Cards`;
      delayHeading.appendChild(btn);
      btn.addEventListener("click", function () {
        openSummaryForm();
      });
    }

    if (riskHeading && !document.getElementById("addRiskBtn")) {
      const btn = document.createElement("button");
      btn.className = "btn-primary";
      btn.id = "addRiskBtn";
      btn.type = "button";
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add Risk`;
      riskHeading.appendChild(btn);
      btn.addEventListener("click", function () {
        openRiskForm();
      });
    }

    if (ncrHeading && !document.getElementById("addNcrBtn")) {
      const btn = document.createElement("button");
      btn.className = "btn-primary";
      btn.id = "addNcrBtn";
      btn.type = "button";
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add NCR`;
      ncrHeading.appendChild(btn);
      btn.addEventListener("click", function () {
        openNcrForm();
      });
    }

    if (actionHeading && !document.getElementById("addActionBtn")) {
      const btn = document.createElement("button");
      btn.className = "btn-primary";
      btn.id = "addActionBtn";
      btn.type = "button";
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add Action`;
      actionHeading.appendChild(btn);
      btn.addEventListener("click", function () {
        openActionForm();
      });
    }

    const delayTable = delaySection?.querySelector(".data-table");
    const riskTable = riskSection?.querySelector(".data-table");
    const ncrTable = ncrSection?.querySelector(".data-table");
    const actionTable = actionSection?.querySelector(".data-table");

    [delayTable, riskTable, ncrTable, actionTable].forEach(function (table) {
      if (table && !table.querySelector("thead th.actions-col")) {
        table.querySelector("thead tr").insertAdjacentHTML(
          "beforeend",
          `<th scope="col" class="actions-col">Actions</th>`
        );
      }
    });

    injectRiskDelayStyles();
    createModalShell();
    wireExportImportButtons();
  }

  function injectRiskDelayStyles() {
    if (document.getElementById("riskDelayCrudStyles")) return;

    const style = document.createElement("style");
    style.id = "riskDelayCrudStyles";
    style.textContent = `
      .sno-col { width: 60px; text-align: center; }
      .actions-col { width: 120px; text-align: right; }
      .row-actions { display: flex; justify-content: flex-end; gap: 6px; }
      .btn-icon-sm {
        width: 30px; height: 30px; border-radius: 8px;
        border: 1px solid var(--border-color, #E3E7EB);
        background: var(--card-bg, #fff); color: var(--text-primary, #16232F);
        cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      }
      .btn-icon-sm:hover { background: rgba(0,0,0,0.04); }
      .btn-icon-sm.danger { color: var(--color-critical, #C0392B); }
      .section-heading { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .risk-delay-modal-backdrop {
        position: fixed; inset: 0; z-index: 100;
        background: rgba(16, 30, 54, 0.45);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      .risk-delay-modal-backdrop[hidden] { display: none; }
      .risk-delay-modal {
        width: min(680px, 100%);
        max-height: 90vh;
        overflow: auto;
        background: var(--card-bg, #fff);
        border-radius: 16px;
        border: 1px solid var(--border-color, #E3E7EB);
        box-shadow: 0 20px 70px rgba(16, 30, 54, 0.22);
      }
      .risk-delay-modal__header {
        padding: 18px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color, #E3E7EB);
      }
      .risk-delay-modal__header h3 { margin: 0; font-size: 18px; }
      .risk-delay-modal__body { padding: 20px; }
      .risk-delay-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .risk-delay-field { display: flex; flex-direction: column; gap: 6px; }
      .risk-delay-field.full { grid-column: 1 / -1; }
      .risk-delay-field label {
        font-size: 12px;
        font-weight: 700;
        color: var(--text-muted, #6E7C87);
      }
      .risk-delay-field input,
      .risk-delay-field select,
      .risk-delay-field textarea {
        width: 100%;
        border: 1px solid var(--border-color, #D8E0E8);
        border-radius: 10px;
        padding: 10px 11px;
        font: inherit;
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232F);
      }
      .risk-delay-field textarea { min-height: 90px; resize: vertical; }
      .risk-delay-field small.hint { color: var(--text-muted, #6E7C87); font-weight: 400; }
      .risk-delay-modal__footer {
        padding: 16px 20px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        border-top: 1px solid var(--border-color, #E3E7EB);
      }
      .risk-delay-empty-cell {
        text-align: center;
        padding: 28px !important;
        color: var(--text-muted, #6E7C87);
      }
      .import-target-list {
        display: flex; flex-direction: column; gap: 8px; margin-top: 4px;
      }
      .import-target-list label {
        display: flex; align-items: center; gap: 8px;
        border: 1px solid var(--border-color, #D8E0E8);
        border-radius: 10px; padding: 10px 12px; cursor: pointer;
      }
      .import-target-list input { width: auto; }
      @media (max-width: 720px) {
        .risk-delay-form-grid { grid-template-columns: 1fr; }
      }
    `;

    document.head.appendChild(style);
  }

  function createModalShell() {
    if (document.getElementById("riskDelayModalBackdrop")) return;

    const modal = document.createElement("div");
    modal.className = "risk-delay-modal-backdrop";
    modal.id = "riskDelayModalBackdrop";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="risk-delay-modal" role="dialog" aria-modal="true" aria-labelledby="riskDelayModalTitle">
        <div class="risk-delay-modal__header">
          <h3 id="riskDelayModalTitle">Form</h3>
          <button class="btn-icon-sm" type="button" id="riskDelayModalClose" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="risk-delay-modal__body" id="riskDelayModalBody"></div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("riskDelayModalClose").addEventListener("click", closeModal);

    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
  }

  function setModal(title, bodyHtml) {
    document.getElementById("riskDelayModalTitle").textContent = title;
    document.getElementById("riskDelayModalBody").innerHTML = bodyHtml;
    document.getElementById("riskDelayModalBackdrop").hidden = false;
  }

  function closeModal() {
    document.getElementById("riskDelayModalBackdrop").hidden = true;
    document.getElementById("riskDelayModalBody").innerHTML = "";
    state.editingDelayId = null;
    state.editingRiskId = null;
    state.editingNcrId = null;
    state.editingActionId = null;
  }

  async function loadAll() {
    ensureUiEnhancements();

    state.projectId = resolveProjectId();

    if (!state.projectId) {
      renderProjectMissing();
      return;
    }

    try {
      const [delayResult, riskResult, ncrResult, actionResult, summaryResult] = await Promise.all([
        window.WSDP_API.request("GET", `/projects/${state.projectId}/delays?limit=100`),
        window.WSDP_API.request("GET", `/projects/${state.projectId}/risks?limit=100`),
        window.WSDP_API.request("GET", `/projects/${state.projectId}/non-conformities?limit=100`),
        window.WSDP_API.request("GET", `/projects/${state.projectId}/corrective-actions?limit=100`),
        window.WSDP_API.request("GET", `/projects/${state.projectId}/risk-delay-summary`).catch(function () {
          return null;
        }),
      ]);

      state.delays = normalizeResponse(delayResult) || [];
      state.risks = normalizeResponse(riskResult) || [];
      state.ncrs = normalizeResponse(ncrResult) || [];
      state.correctiveActions = normalizeResponse(actionResult) || [];
      state.summary = normalizeResponse(summaryResult) || null;
      if (Array.isArray(state.summary)) state.summary = state.summary[0] || null;

      renderDelays();
      renderRisks();
      renderNcrs();
      renderActions();
      renderKpis();

      toast("Risk-delay data loaded", "fa-database");
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to load risk-delay data", "fa-triangle-exclamation");
      renderLoadError(err);
    }
  }

  function renderProjectMissing() {
    const message = `
      <tr>
        <td colspan="7" class="risk-delay-empty-cell">
          No project id found. Login again or ensure the seeded project is assigned to your user.
        </td>
      </tr>
    `;

    [getDelayTbody(), getRiskTbody(), getNcrTbody(), getActionTbody()].forEach(function (tbody) {
      if (tbody) tbody.innerHTML = message;
    });
  }

  function renderLoadError(err) {
    const message = `
      <tr>
        <td colspan="7" class="risk-delay-empty-cell">
          ${escapeHtml(err.message || "Failed to load data")}
        </td>
      </tr>
    `;

    [getDelayTbody(), getRiskTbody(), getNcrTbody(), getActionTbody()].forEach(function (tbody) {
      if (tbody) tbody.innerHTML = message;
    });
  }

  function getDelayTbody() {
    return document.querySelector("#delay-analysis .data-table tbody");
  }

  function getRiskTbody() {
    return document.querySelector("#risk-register .data-table tbody");
  }

  function getNcrTbody() {
    return document.querySelector("#ncr-register .data-table tbody");
  }

  function getActionTbody() {
    return document.querySelector("#corrective-actions .data-table tbody");
  }

  function chipClass(value) {
    const normalized = String(value || "").toLowerCase();

    if (["high", "open"].includes(normalized)) return "crit";
    if (["medium", "in_progress", "mitigated", "pending", "action_plan_requested"].includes(normalized)) return "warn";
    return "ok";
  }

  function chipIcon(value) {
    const normalized = String(value || "").toLowerCase();

    if (["high", "open"].includes(normalized)) return "fa-circle-exclamation";
    if (["medium", "in_progress", "mitigated", "pending", "action_plan_requested"].includes(normalized)) return "fa-triangle-exclamation";
    return "fa-circle-check";
  }

  function renderDelays() {
    const tbody = getDelayTbody();

    if (!tbody) return;

    if (!state.delays.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="risk-delay-empty-cell">
            No delay records found. Click <strong>Add Delay</strong> to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.delays
      .map(function (delay, index) {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(delay.reason)}</td>
            <td>${escapeHtml(titleCase(delay.category))}</td>
            <td class="num">${escapeHtml(delay.days_delayed)}</td>
            <td>${escapeHtml(delay.root_cause || "—")}</td>
            <td>
              <span class="status-chip ${chipClass(delay.status)}">
                <i class="fa-solid ${chipIcon(delay.status)}"></i>
                ${escapeHtml(titleCase(delay.status))}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button class="btn-icon-sm" type="button" data-edit-delay="${delay.id}" title="Edit delay">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-icon-sm danger" type="button" data-delete-delay="${delay.id}" title="Delete delay">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("[data-edit-delay]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = state.delays.find((d) => d.id === btn.dataset.editDelay);
        openDelayForm(item);
      });
    });

    tbody.querySelectorAll("[data-delete-delay]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteDelay(btn.dataset.deleteDelay);
      });
    });
  }

  function renderRisks() {
    const tbody = getRiskTbody();

    if (!tbody) return;

    if (!state.risks.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="risk-delay-empty-cell">
            No risks found. Click <strong>Add Risk</strong> to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.risks
      .map(function (risk, index) {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(risk.description)}</td>
            <td>${escapeHtml(titleCase(risk.category))}</td>
            <td>
              <span class="status-chip ${chipClass(risk.impact)}">
                <i class="fa-solid ${chipIcon(risk.impact)}"></i>
                ${escapeHtml(titleCase(risk.impact))}
              </span>
            </td>
            <td>${escapeHtml(risk.owner_name || risk.owner_id || "—")}</td>
            <td>
              <div class="row-actions">
                <button class="btn-icon-sm" type="button" data-edit-risk="${risk.id}" title="Edit risk">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-icon-sm danger" type="button" data-delete-risk="${risk.id}" title="Delete risk">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("[data-edit-risk]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = state.risks.find((r) => r.id === btn.dataset.editRisk);
        openRiskForm(item);
      });
    });

    tbody.querySelectorAll("[data-delete-risk]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteRisk(btn.dataset.deleteRisk);
      });
    });
  }

  function renderNcrs() {
    const tbody = getNcrTbody();

    if (!tbody) return;

    if (!state.ncrs.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="risk-delay-empty-cell">
            No non-conformity records found. Click <strong>Add NCR</strong> to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.ncrs
      .map(function (ncr, index) {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(ncr.description)}</td>
            <td>${escapeHtml(ncr.owner || "—")}</td>
            <td>
              <span class="status-chip ${chipClass(ncr.status)}">
                <i class="fa-solid ${chipIcon(ncr.status)}"></i>
                ${escapeHtml(titleCase(ncr.status))}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button class="btn-icon-sm" type="button" data-edit-ncr="${ncr.id}" title="Edit NCR">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-icon-sm danger" type="button" data-delete-ncr="${ncr.id}" title="Delete NCR">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("[data-edit-ncr]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = state.ncrs.find((n) => n.id === btn.dataset.editNcr);
        openNcrForm(item);
      });
    });

    tbody.querySelectorAll("[data-delete-ncr]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteNcr(btn.dataset.deleteNcr);
      });
    });
  }

  function renderActions() {
    const tbody = getActionTbody();

    if (!tbody) return;

    if (!state.correctiveActions.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="risk-delay-empty-cell">
            No corrective actions found. Click <strong>Add Action</strong> to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.correctiveActions
      .map(function (action, index) {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(action.action)}</td>
            <td>${escapeHtml(action.owner || "—")}</td>
            <td>
              <span class="status-chip ${chipClass(action.status)}">
                <i class="fa-solid ${chipIcon(action.status)}"></i>
                ${escapeHtml(titleCase(action.status))}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button class="btn-icon-sm" type="button" data-edit-action="${action.id}" title="Edit action">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn-icon-sm danger" type="button" data-delete-action="${action.id}" title="Delete action">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("[data-edit-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = state.correctiveActions.find((a) => a.id === btn.dataset.editAction);
        openActionForm(item);
      });
    });

    tbody.querySelectorAll("[data-delete-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteAction(btn.dataset.deleteAction);
      });
    });
  }

  function computeKpis() {
    const totalSlip = state.delays.reduce(function (sum, delay) {
      return sum + Number(delay.days_delayed || 0);
    }, 0);

    const openDelayCount = state.delays.filter(function (delay) {
      return delay.status !== "closed";
    }).length;

    const mitigatedCount = state.delays.filter(function (delay) {
      return ["mitigated", "closed"].includes(delay.status);
    }).length;

    const criticalPathCount = state.delays.filter(function (delay) {
      return Number(delay.days_delayed || 0) >= 10 && delay.status !== "closed";
    }).length;

    return {
      projected_slippage_days: totalSlip,
      open_delay_items: openDelayCount,
      mitigated_this_quarter: mitigatedCount,
      on_critical_path: criticalPathCount,
    };
  }

  function renderKpis() {
    const grid = document.getElementById("delayKpiGrid");
    if (!grid) return;

    const computed = computeKpis();
    const override = state.summary || {};

    const slippage = override.projected_slippage_days ?? computed.projected_slippage_days;
    const open = override.open_delay_items ?? computed.open_delay_items;
    const mitigated = override.mitigated_this_quarter ?? computed.mitigated_this_quarter;
    const critical = override.on_critical_path ?? computed.on_critical_path;

    grid.querySelector('[data-kpi="slippage"] .kpi-card__value').textContent = `${slippage} days`;
    grid.querySelector('[data-kpi="open"] .kpi-card__value').textContent = String(open);
    grid.querySelector('[data-kpi="mitigated"] .kpi-card__value').textContent = String(mitigated);
    grid.querySelector('[data-kpi="critical"] .kpi-card__value').textContent = String(critical);
  }

  function openDelayForm(delay) {
    state.editingDelayId = delay?.id || null;

    setModal(
      delay ? "Edit Delay" : "Add Delay",
      `
      <form id="delayForm">
        <div class="risk-delay-form-grid">
          <div class="risk-delay-field full">
            <label for="delayReason">Delay Item</label>
            <input id="delayReason" name="reason" required minlength="5" value="${escapeHtml(delay?.reason || "")}" />
          </div>

          <div class="risk-delay-field">
            <label for="delayCategory">Category</label>
            <select id="delayCategory" name="category">
              ${optionHtml(delayCategoryOptions, delay?.category || "general")}
            </select>
          </div>

          <div class="risk-delay-field">
            <label for="delayDays">Impact Days</label>
            <input id="delayDays" name="days_delayed" type="number" min="0" required value="${escapeHtml(delay?.days_delayed ?? 0)}" />
          </div>

          <div class="risk-delay-field">
            <label for="delayStatus">Status</label>
            <select id="delayStatus" name="status">
              ${optionHtml(delayStatusOptions, delay?.status || "open")}
            </select>
          </div>

          <div class="risk-delay-field">
            <label for="delayWorkPackage">Work Package ID Optional</label>
            <input id="delayWorkPackage" name="work_package_id" value="${escapeHtml(delay?.work_package_id || "")}" />
          </div>

          <div class="risk-delay-field full">
            <label for="delayRootCause">Root Cause</label>
            <textarea id="delayRootCause" name="root_cause">${escapeHtml(delay?.root_cause || "")}</textarea>
          </div>

          <div class="risk-delay-field full">
            <label for="delayMitigation">Mitigation Plan</label>
            <textarea id="delayMitigation" name="mitigation_plan">${escapeHtml(delay?.mitigation_plan || "")}</textarea>
          </div>
        </div>

        <div class="risk-delay-modal__footer">
          <button class="btn-ghost" type="button" id="cancelDelayForm">Cancel</button>
          <button class="btn-primary" type="submit">
            <i class="fa-solid fa-floppy-disk"></i> Save Delay
          </button>
        </div>
      </form>
      `
    );

    document.getElementById("cancelDelayForm").addEventListener("click", closeModal);
    document.getElementById("delayForm").addEventListener("submit", submitDelayForm);
  }

  async function submitDelayForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      reason: formData.get("reason").trim(),
      category: formData.get("category"),
      days_delayed: Number(formData.get("days_delayed") || 0),
      root_cause: formData.get("root_cause").trim() || undefined,
      mitigation_plan: formData.get("mitigation_plan").trim() || undefined,
      status: formData.get("status"),
    };

    const workPackageId = formData.get("work_package_id").trim();

    if (workPackageId) {
      payload.work_package_id = workPackageId;
    }

    try {
      if (state.editingDelayId) {
        await window.WSDP_API.request("PATCH", `/delays/${state.editingDelayId}`, payload);
        toast("Delay updated successfully");
      } else {
        await window.WSDP_API.request("POST", `/projects/${state.projectId}/delays`, payload);
        toast("Delay created successfully");
      }

      closeModal();
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to save delay", "fa-triangle-exclamation");
    }
  }

  async function deleteDelay(id) {
    const ok = confirm("Delete this delay record?");

    if (!ok) return;

    try {
      await window.WSDP_API.request("DELETE", `/delays/${id}`);
      toast("Delay deleted successfully", "fa-trash");
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to delete delay", "fa-triangle-exclamation");
    }
  }

  function openRiskForm(risk) {
    state.editingRiskId = risk?.id || null;

    const today = new Date().toISOString().slice(0, 10);

    setModal(
      risk ? "Edit Risk" : "Add Risk",
      `
      <form id="riskForm">
        <div class="risk-delay-form-grid">
          <div class="risk-delay-field full">
            <label for="riskDescription">Risk Description</label>
            <textarea id="riskDescription" name="description" required minlength="5">${escapeHtml(risk?.description || "")}</textarea>
          </div>

          <div class="risk-delay-field">
            <label for="riskCategory">Category</label>
            <select id="riskCategory" name="category">
              ${optionHtml(riskCategoryOptions, risk?.category || "general")}
            </select>
          </div>

          <div class="risk-delay-field">
            <label for="riskProbability">Probability</label>
            <select id="riskProbability" name="probability">
              ${optionHtml(levelOptions, risk?.probability || "medium")}
            </select>
          </div>

          <div class="risk-delay-field">
            <label for="riskImpact">Impact</label>
            <select id="riskImpact" name="impact">
              ${optionHtml(levelOptions, risk?.impact || "medium")}
            </select>
          </div>

          <div class="risk-delay-field">
            <label for="riskStatus">Status</label>
            <select id="riskStatus" name="status">
              ${optionHtml(riskStatusOptions, risk?.status || "open")}
            </select>
          </div>

          <div class="risk-delay-field">
            <label for="riskOwnerName">Owner Name</label>
            <input id="riskOwnerName" name="owner_name" value="${escapeHtml(risk?.owner_name || "")}" />
          </div>

          <div class="risk-delay-field">
            <label for="riskDate">Identified Date</label>
            <input id="riskDate" name="identified_date" type="date" required value="${escapeHtml(risk?.identified_date || today)}" />
          </div>
        </div>

        <div class="risk-delay-modal__footer">
          <button class="btn-ghost" type="button" id="cancelRiskForm">Cancel</button>
          <button class="btn-primary" type="submit">
            <i class="fa-solid fa-floppy-disk"></i> Save Risk
          </button>
        </div>
      </form>
      `
    );

    document.getElementById("cancelRiskForm").addEventListener("click", closeModal);
    document.getElementById("riskForm").addEventListener("submit", submitRiskForm);
  }

  async function submitRiskForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      description: formData.get("description").trim(),
      category: formData.get("category"),
      probability: formData.get("probability"),
      impact: formData.get("impact"),
      status: formData.get("status"),
      owner_name: formData.get("owner_name").trim() || undefined,
      identified_date: formData.get("identified_date"),
    };

    try {
      if (state.editingRiskId) {
        await window.WSDP_API.request("PATCH", `/risks/${state.editingRiskId}`, payload);
        toast("Risk updated successfully");
      } else {
        await window.WSDP_API.request("POST", `/projects/${state.projectId}/risks`, payload);
        toast("Risk created successfully");
      }

      closeModal();
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to save risk", "fa-triangle-exclamation");
    }
  }

  async function deleteRisk(id) {
    const ok = confirm("Delete this risk? Only open risks can be deleted.");

    if (!ok) return;

    try {
      await window.WSDP_API.request("DELETE", `/risks/${id}`);
      toast("Risk deleted successfully", "fa-trash");
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to delete risk", "fa-triangle-exclamation");
    }
  }

  function openNcrForm(ncr) {
    state.editingNcrId = ncr?.id || null;

    setModal(
      ncr ? "Edit NCR" : "Add NCR",
      `
      <form id="ncrForm">
        <div class="risk-delay-form-grid">
          <div class="risk-delay-field full">
            <label for="ncrDescription">Description</label>
            <textarea id="ncrDescription" name="description" required minlength="5">${escapeHtml(ncr?.description || "")}</textarea>
          </div>

          <div class="risk-delay-field">
            <label for="ncrOwner">Owner</label>
            <input id="ncrOwner" name="owner" required value="${escapeHtml(ncr?.owner || "")}" />
          </div>

          <div class="risk-delay-field">
            <label for="ncrStatus">Status</label>
            <select id="ncrStatus" name="status">
              ${optionHtml(ncrStatusOptions, ncr?.status || "open")}
            </select>
          </div>
        </div>

        <div class="risk-delay-modal__footer">
          <button class="btn-ghost" type="button" id="cancelNcrForm">Cancel</button>
          <button class="btn-primary" type="submit">
            <i class="fa-solid fa-floppy-disk"></i> Save NCR
          </button>
        </div>
      </form>
      `
    );

    document.getElementById("cancelNcrForm").addEventListener("click", closeModal);
    document.getElementById("ncrForm").addEventListener("submit", submitNcrForm);
  }

  async function submitNcrForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      description: formData.get("description").trim(),
      owner: formData.get("owner").trim(),
      status: formData.get("status"),
    };

    try {
      if (state.editingNcrId) {
        await window.WSDP_API.request("PATCH", `/non-conformities/${state.editingNcrId}`, payload);
        toast("NCR updated successfully");
      } else {
        await window.WSDP_API.request("POST", `/projects/${state.projectId}/non-conformities`, payload);
        toast("NCR created successfully");
      }

      closeModal();
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to save NCR", "fa-triangle-exclamation");
    }
  }

  async function deleteNcr(id) {
    const ok = confirm("Delete this non-conformity record?");

    if (!ok) return;

    try {
      await window.WSDP_API.request("DELETE", `/non-conformities/${id}`);
      toast("NCR deleted successfully", "fa-trash");
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to delete NCR", "fa-triangle-exclamation");
    }
  }

  function openActionForm(action) {
    state.editingActionId = action?.id || null;

    setModal(
      action ? "Edit Corrective Action" : "Add Corrective Action",
      `
      <form id="actionForm">
        <div class="risk-delay-form-grid">
          <div class="risk-delay-field full">
            <label for="actionText">Action</label>
            <textarea id="actionText" name="action" required minlength="5">${escapeHtml(action?.action || "")}</textarea>
          </div>

          <div class="risk-delay-field">
            <label for="actionOwner">Owner</label>
            <input id="actionOwner" name="owner" required value="${escapeHtml(action?.owner || "")}" />
          </div>

          <div class="risk-delay-field">
            <label for="actionStatus">Status</label>
            <select id="actionStatus" name="status">
              ${optionHtml(actionStatusOptions, action?.status || "pending")}
            </select>
          </div>
        </div>

        <div class="risk-delay-modal__footer">
          <button class="btn-ghost" type="button" id="cancelActionForm">Cancel</button>
          <button class="btn-primary" type="submit">
            <i class="fa-solid fa-floppy-disk"></i> Save Action
          </button>
        </div>
      </form>
      `
    );

    document.getElementById("cancelActionForm").addEventListener("click", closeModal);
    document.getElementById("actionForm").addEventListener("submit", submitActionForm);
  }

  async function submitActionForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      action: formData.get("action").trim(),
      owner: formData.get("owner").trim(),
      status: formData.get("status"),
    };

    try {
      if (state.editingActionId) {
        await window.WSDP_API.request("PATCH", `/corrective-actions/${state.editingActionId}`, payload);
        toast("Corrective action updated successfully");
      } else {
        await window.WSDP_API.request("POST", `/projects/${state.projectId}/corrective-actions`, payload);
        toast("Corrective action created successfully");
      }

      closeModal();
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to save corrective action", "fa-triangle-exclamation");
    }
  }

  async function deleteAction(id) {
    const ok = confirm("Delete this corrective action?");

    if (!ok) return;

    try {
      await window.WSDP_API.request("DELETE", `/corrective-actions/${id}`);
      toast("Corrective action deleted successfully", "fa-trash");
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to delete corrective action", "fa-triangle-exclamation");
    }
  }

  function openSummaryForm() {
    const computed = computeKpis();
    const override = state.summary || {};

    setModal(
      "Update Summary Cards",
      `
      <form id="summaryForm">
        <p class="risk-delay-field full" style="margin:0 0 4px;">
          <small class="hint">Leave a field blank to auto-calculate it from delay records instead of a fixed value.</small>
        </p>
        <div class="risk-delay-form-grid">
          <div class="risk-delay-field">
            <label for="summarySlippage">Projected Slippage (days)</label>
            <input id="summarySlippage" name="projected_slippage_days" type="number" min="0"
              placeholder="Auto: ${computed.projected_slippage_days}"
              value="${override.projected_slippage_days ?? ""}" />
          </div>
          <div class="risk-delay-field">
            <label for="summaryOpen">Open Delay Items</label>
            <input id="summaryOpen" name="open_delay_items" type="number" min="0"
              placeholder="Auto: ${computed.open_delay_items}"
              value="${override.open_delay_items ?? ""}" />
          </div>
          <div class="risk-delay-field">
            <label for="summaryMitigated">Mitigated This Quarter</label>
            <input id="summaryMitigated" name="mitigated_this_quarter" type="number" min="0"
              placeholder="Auto: ${computed.mitigated_this_quarter}"
              value="${override.mitigated_this_quarter ?? ""}" />
          </div>
          <div class="risk-delay-field">
            <label for="summaryCritical">On Critical Path</label>
            <input id="summaryCritical" name="on_critical_path" type="number" min="0"
              placeholder="Auto: ${computed.on_critical_path}"
              value="${override.on_critical_path ?? ""}" />
          </div>
        </div>

        <div class="risk-delay-modal__footer">
          <button class="btn-ghost" type="button" id="resetSummaryForm">Reset to Auto-Calculated</button>
          <button class="btn-primary" type="submit">
            <i class="fa-solid fa-floppy-disk"></i> Save
          </button>
        </div>
      </form>
      `
    );

    document.getElementById("summaryForm").addEventListener("submit", submitSummaryForm);
    document.getElementById("resetSummaryForm").addEventListener("click", async function () {
      await saveSummary({
        projected_slippage_days: null,
        open_delay_items: null,
        mitigated_this_quarter: null,
        on_critical_path: null,
      });
    });
  }

  async function submitSummaryForm(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    function parseOrNull(name) {
      const raw = formData.get(name);
      if (raw === null || String(raw).trim() === "") return null;
      return Number(raw);
    }

    await saveSummary({
      projected_slippage_days: parseOrNull("projected_slippage_days"),
      open_delay_items: parseOrNull("open_delay_items"),
      mitigated_this_quarter: parseOrNull("mitigated_this_quarter"),
      on_critical_path: parseOrNull("on_critical_path"),
    });
  }

  async function saveSummary(payload) {
    try {
      await window.WSDP_API.request(
        "PUT",
        `/projects/${state.projectId}/risk-delay-summary`,
        payload
      );
      toast("Summary cards updated successfully");
      closeModal();
      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to update summary cards", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     EXPORT — snapshots the module's current tables/cards into a PDF
     using html2canvas + jsPDF (loaded via CDN in risk-delay.html).
     --------------------------------------------------------------- */

  function wireExportImportButtons() {
    const exportBtn = document.getElementById("exportRiskDelayBtn");
    const importBtn = document.getElementById("importRiskDelayBtn");
    const importInput = document.getElementById("riskDelayImportFile");

    if (exportBtn && !exportBtn.dataset.wired) {
      exportBtn.dataset.wired = "true";
      exportBtn.addEventListener("click", exportRiskDelayPdf);
    }

    if (importBtn && importInput && !importBtn.dataset.wired) {
      importBtn.dataset.wired = "true";
      importBtn.addEventListener("click", function () {
        importInput.value = "";
        importInput.click();
      });
      importInput.addEventListener("change", function (event) {
        const file = event.target.files?.[0];
        if (file) openImportForm(file);
      });
    }
  }

  async function exportRiskDelayPdf() {
    if (!window.html2canvas || !window.jspdf) {
      toast("Export libraries failed to load. Check your internet connection.", "fa-triangle-exclamation");
      return;
    }

    const target = document.querySelector("main.main-content");
    if (!target) return;

    toast("Preparing PDF export…", "fa-file-pdf");

    try {
      const canvas = await window.html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "pt", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      const imgData = canvas.toDataURL("image/png");

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      pdf.save(`Delay-Analysis-Risk-Register-${dateStr}.pdf`);

      toast("Export complete", "fa-circle-check");
    } catch (err) {
      console.error(err);
      toast("Failed to export PDF", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     IMPORT — parses an uploaded .csv/.xlsx file with SheetJS and
     bulk-creates records in the table the user selects.
     --------------------------------------------------------------- */

  const importTargets = {
    delay: {
      label: "Delay Analysis",
      endpoint: () => `/projects/${state.projectId}/delays`,
      columns: "reason, category, days_delayed, root_cause, mitigation_plan, status",
      mapRow: (row) => ({
        reason: String(row.reason || row["Delay Item"] || "").trim(),
        category: String(row.category || row.Category || "general").toLowerCase(),
        days_delayed: Number(row.days_delayed || row["Impact (days)"] || 0),
        root_cause: row.root_cause || row["Root Cause"] || undefined,
        mitigation_plan: row.mitigation_plan || row["Mitigation Plan"] || undefined,
        status: String(row.status || row.Status || "open").toLowerCase(),
      }),
    },
    risk: {
      label: "Risk Register",
      endpoint: () => `/projects/${state.projectId}/risks`,
      columns: "description, category, probability, impact, status, owner_name, identified_date",
      mapRow: (row) => ({
        description: String(row.description || row.Risk || "").trim(),
        category: String(row.category || row.Category || "general").toLowerCase(),
        probability: String(row.probability || "medium").toLowerCase(),
        impact: String(row.impact || row.Rating || "medium").toLowerCase(),
        status: String(row.status || "open").toLowerCase(),
        owner_name: row.owner_name || row.Owner || undefined,
        identified_date:
          row.identified_date || new Date().toISOString().slice(0, 10),
      }),
    },
    ncr: {
      label: "Non-Conformity Register",
      endpoint: () => `/projects/${state.projectId}/non-conformities`,
      columns: "description, owner, status",
      mapRow: (row) => ({
        description: String(row.description || row.Description || "").trim(),
        owner: String(row.owner || row.Owner || "").trim(),
        status: String(row.status || row.Status || "open").toLowerCase().replace(/\s+/g, "_"),
      }),
    },
    action: {
      label: "Corrective Actions Tracker",
      endpoint: () => `/projects/${state.projectId}/corrective-actions`,
      columns: "action, owner, status",
      mapRow: (row) => ({
        action: String(row.action || row.Action || "").trim(),
        owner: String(row.owner || row.Owner || "").trim(),
        status: String(row.status || row.Status || "pending").toLowerCase().replace(/\s+/g, "_"),
      }),
    },
  };

  function openImportForm(file) {
    if (!window.XLSX) {
      toast("Import library failed to load. Check your internet connection.", "fa-triangle-exclamation");
      return;
    }

    setModal(
      "Import Data",
      `
      <form id="importForm">
        <p class="risk-delay-field full" style="margin:0 0 10px;">
          File: <strong>${escapeHtml(file.name)}</strong>
        </p>
        <div class="risk-delay-field full">
          <label>Import into</label>
          <div class="import-target-list">
            <label><input type="radio" name="importTarget" value="delay" checked /> Delay Analysis <small class="hint">(${importTargets.delay.columns})</small></label>
            <label><input type="radio" name="importTarget" value="risk" /> Risk Register <small class="hint">(${importTargets.risk.columns})</small></label>
            <label><input type="radio" name="importTarget" value="ncr" /> Non-Conformity Register <small class="hint">(${importTargets.ncr.columns})</small></label>
            <label><input type="radio" name="importTarget" value="action" /> Corrective Actions Tracker <small class="hint">(${importTargets.action.columns})</small></label>
          </div>
        </div>
        <p class="risk-delay-field full">
          <small class="hint">The first row of the sheet must contain column headers matching the field names above (Sno / # columns are ignored).</small>
        </p>
        <div class="risk-delay-modal__footer">
          <button class="btn-ghost" type="button" id="cancelImportForm">Cancel</button>
          <button class="btn-primary" type="submit">
            <i class="fa-solid fa-upload"></i> Import
          </button>
        </div>
      </form>
      `
    );

    document.getElementById("cancelImportForm").addEventListener("click", closeModal);
    document.getElementById("importForm").addEventListener("submit", function (event) {
      event.preventDefault();
      const targetKey = new FormData(event.currentTarget).get("importTarget");
      runImport(file, targetKey);
    });
  }

  function readWorkbookRows(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async function runImport(file, targetKey) {
    const target = importTargets[targetKey];
    if (!target) return;

    try {
      const rows = await readWorkbookRows(file);

      if (!rows.length) {
        toast("No rows found in the uploaded file", "fa-triangle-exclamation");
        return;
      }

      closeModal();
      toast(`Importing ${rows.length} row(s) into ${target.label}…`, "fa-upload");

      let successCount = 0;
      let failCount = 0;

      for (const row of rows) {
        try {
          const payload = target.mapRow(row);
          await window.WSDP_API.request("POST", target.endpoint(), payload);
          successCount++;
        } catch (err) {
          console.error("Import row failed", row, err);
          failCount++;
        }
      }

      toast(
        `Import finished: ${successCount} succeeded, ${failCount} failed`,
        failCount ? "fa-triangle-exclamation" : "fa-circle-check"
      );

      await loadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to parse the import file", "fa-triangle-exclamation");
    }
  }

  function boot() {
    if (!window.WSDP_API) {
      console.error("WSDP_API is not available. Load js/api.js before js/risk-delay.js.");
      return;
    }

    if (window.WSDP_API.getAccessToken && window.WSDP_API.getAccessToken()) {
      loadAll();
      return;
    }

    document.addEventListener(
      "wsdp:authready",
      function () {
        loadAll();
      },
      { once: true }
    );
  }

  document.addEventListener("DOMContentLoaded", boot);
})();

  function resolveProjectId() {
    const stored = readProjectIdFromStorage();
    if (stored) return stored;

    const payload = getTokenPayload();

    if (payload?.project_ids?.length) {
      return payload.project_ids[0];
    }

    return null;
  }
