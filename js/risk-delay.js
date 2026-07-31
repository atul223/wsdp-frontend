
/* ============================================================
   risk-delay.js — Delay Analysis & Risk Register CRUD
   Requires: js/api.js, js/shell.js, js/main.js
   ============================================================ */

(function () {
  "use strict";

  const state = {
    projectId: null,
    delays: [],
    risks: [],
    editingDelayId: null,
    editingRiskId: null,
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
      .replace(/'/g, "&#039;");
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

  function resolveProjectId() {
    const stored = readProjectIdFromStorage();
    if (stored) return stored;

    const payload = getTokenPayload();

    if (payload?.project_ids?.length) {
      return payload.project_ids[0];
    }

    return null;
  }

  function ensureUiEnhancements() {
    const delaySection = document.getElementById("delay-analysis");
    const riskSection = document.getElementById("risk-register");

    const delayHeading = delaySection?.querySelector(".section-heading");
    const riskHeading = riskSection?.querySelector(".section-heading");

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

    const delayTable = delaySection?.querySelector(".data-table");
    const riskTable = riskSection?.querySelector(".col-span-7 .data-table");

    if (delayTable && !delayTable.querySelector("thead th.actions-col")) {
      delayTable.querySelector("thead tr").insertAdjacentHTML(
        "beforeend",
        `<th scope="col" class="actions-col">Actions</th>`
      );
    }

    if (riskTable && !riskTable.querySelector("thead th.actions-col")) {
      riskTable.querySelector("thead tr").insertAdjacentHTML(
        "beforeend",
        `<th scope="col" class="actions-col">Actions</th>`
      );
    }

    injectRiskDelayStyles();
    createModalShell();
  }

  function injectRiskDelayStyles() {
    if (document.getElementById("riskDelayCrudStyles")) return;

    const style = document.createElement("style");
    style.id = "riskDelayCrudStyles";
    style.textContent = `
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
  }

  async function loadAll() {
    ensureUiEnhancements();

    state.projectId = resolveProjectId();

    if (!state.projectId) {
      renderProjectMissing();
      return;
    }

    try {
      const [delayResult, riskResult] = await Promise.all([
        window.WSDP_API.request("GET", `/projects/${state.projectId}/delays?limit=100`),
        window.WSDP_API.request("GET", `/projects/${state.projectId}/risks?limit=100`),
      ]);

      state.delays = normalizeResponse(delayResult) || [];
      state.risks = normalizeResponse(riskResult) || [];

      renderDelays();
      renderRisks();
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
        <td colspan="6" class="risk-delay-empty-cell">
          No project id found. Login again or ensure the seeded project is assigned to your user.
        </td>
      </tr>
    `;

    getDelayTbody().innerHTML = message;
    getRiskTbody().innerHTML = message;
  }

  function renderLoadError(err) {
    const message = `
      <tr>
        <td colspan="6" class="risk-delay-empty-cell">
          ${escapeHtml(err.message || "Failed to load data")}
        </td>
      </tr>
    `;

    getDelayTbody().innerHTML = message;
    getRiskTbody().innerHTML = message;
  }

  function getDelayTbody() {
    return document.querySelector("#delay-analysis .data-table tbody");
  }

  function getRiskTbody() {
    return document.querySelector("#risk-register .col-span-7 .data-table tbody");
  }

  function chipClass(value) {
    const normalized = String(value || "").toLowerCase();

    if (["high", "open"].includes(normalized)) return "crit";
    if (["medium", "in_progress", "mitigated"].includes(normalized)) return "warn";
    return "ok";
  }

  function chipIcon(value) {
    const normalized = String(value || "").toLowerCase();

    if (["high", "open"].includes(normalized)) return "fa-circle-exclamation";
    if (["medium", "in_progress", "mitigated"].includes(normalized)) return "fa-triangle-exclamation";
    return "fa-circle-check";
  }

  function renderDelays() {
    const tbody = getDelayTbody();

    if (!tbody) return;

    if (!state.delays.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="risk-delay-empty-cell">
            No delay records found. Click <strong>Add Delay</strong> to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.delays
      .map(function (delay) {
        return `
          <tr>
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
          <td colspan="5" class="risk-delay-empty-cell">
            No risks found. Click <strong>Add Risk</strong> to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.risks
      .map(function (risk) {
        return `
          <tr>
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

  function renderRiskMatrix() {
    const grid = document.getElementById("riskMatrix");

    if (!grid) return;

    grid.innerHTML = "";

    const levelScore = {
      low: 1,
      medium: 3,
      high: 5,
    };

    const counts = new Map();

    state.risks.forEach(function (risk) {
      const impact = levelScore[risk.impact] || 1;
      const probability = levelScore[risk.probability] || 1;
      const key = `${impact}:${probability}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    function colorFor(row, col) {
      const score = row + col;

      if (score <= 2) return "var(--color-success)";
      if (score <= 5) return "var(--color-warning)";
      return "var(--color-critical)";
    }

    for (let r = 4; r >= 0; r--) {
      for (let c = 0; c < 5; c++) {
        const impact = r + 1;
        const probability = c + 1;
        const key = `${impact}:${probability}`;

        const cell = document.createElement("div");
        cell.className = "risk-cell";
        cell.style.background = colorFor(r, c);
        cell.textContent = counts.get(key) || impact * probability;
        grid.appendChild(cell);
      }
    }
  }

  function renderKpis() {
    const kpiValues = document.querySelectorAll("#delay-analysis .kpi-card__value");

    if (kpiValues.length < 4) return;

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

    kpiValues[0].textContent = `${totalSlip} days`;
    kpiValues[1].textContent = String(openDelayCount);
    kpiValues[2].textContent = String(mitigatedCount);
    kpiValues[3].textContent = String(criticalPathCount);
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