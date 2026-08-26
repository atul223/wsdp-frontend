/* ============================================================
   home-dashboard.js — Home Dashboard page script
   Load order required (after existing includes):
   api.js, i18n.js, shell.js, main.js, Chart.js, Leaflet, charts.js,
   xlsx.full.min.js, html2canvas.min.js, jspdf.umd.min.js,
   then this file.

   Responsibilities:
   1) Full CRUD (edit + reset-to-default) for the 10 KPI summary
      cards, backed by the HomeSummaryCard model /
      homeSummaryCard.routes.js.
   2) "Cashflow" line chart (Planned vs Actual, M AOA) replacing the
      old "Cumulative Financial Execution" chart.
   3) Functional Import (Excel template -> bulk-updates all summary
      cards) and Export (whole Home Dashboard -> PDF).
   4) Functional module search box: clicking/focusing #globalSearch
      (the SAME shared topbar search input rendered by shell.js on
      every page) shows a dropdown of every sub-section heading
      found on THIS page (Home Dashboard) and jumps to it on click.
      This is wired ONLY here (home-dashboard.js, loaded only by
      index.html), so main.js's shared placeholder search behavior on
      every other page is completely untouched.
   ============================================================ */

(function () {
  "use strict";

  const state = {
    projectId: null,
    cardOverrides: {},
    cashFlow: null,
    cashflowChart: null
  };

  // Keep in sync with backend VALID_CARD_KEYS in homeSummaryCard.validation.js
  const HOME_CARD_META = {
    overall_physical_progress: {
      label: "Overall Physical Progress",
      type: "percent",
      decimals: 0,
      defaultValue: 17,
      defaultDelta: "Weighted across 6 activities"
    },
    pipe_laying: {
      label: "Pipe Laying",
      type: "percent",
      decimals: 1,
      defaultValue: 25.5,
      defaultDelta: "23,628.5 / 92,677 m (DDR)"
    },
    household_connections: {
      label: "Household Connections",
      type: "percent",
      decimals: 0,
      defaultValue: 0,
      defaultDelta: "0 / 5,303 (DDR)"
    },
    months_elapsed_remaining: {
      label: "Months Elapsed / Remaining",
      type: "text",
      defaultValue: "04 / 07",
      defaultDelta: "Delay accrued 6.5 months"
    },
    cumulative_billing: {
      label: "Cumulative Billing",
      type: "percent",
      decimals: 2,
      defaultValue: 17.96,
      defaultDelta: "650.99 M AOA of 3,625.58 M"
    },
    ipc_status: {
      label: "IPC Status",
      type: "text",
      defaultValue: "01 \u2713 / 02 \u2713",
      defaultDelta: "IPC-02: 246.34 M AOA Submitted"
    },
    eshs_compliance: {
      label: "ESHS Compliance",
      type: "percent",
      decimals: 0,
      defaultValue: 78,
      defaultDelta: "Target \u2265 90%"
    },
    lost_time_accidents: {
      label: "Lost-Time Accidents",
      type: "number",
      decimals: 0,
      defaultValue: 0,
      defaultDelta: "Zero injuries"
    },
    grievances_resolved: {
      label: "Grievances Resolved",
      type: "text",
      defaultValue: "1 / 1",
      defaultDelta: "100% \u2014 Satisfied"
    },
    active_work_fronts: {
      label: "Active Work Fronts",
      type: "text",
      defaultValue: "2 / 7",
      defaultDelta: "Casa Verde, Escola Portuguesa"
    }
  };

  const FALLBACK_CASH_FLOW = [
    { month: "Jul-25", planned_aoa: 190564875, actual_aoa: 0 },
    { month: "Aug-25", planned_aoa: 520207699, actual_aoa: 0 },
    { month: "Sep-25", planned_aoa: 634474730, actual_aoa: 0 },
    { month: "Oct-25", planned_aoa: 996854897, actual_aoa: 0 },
    { month: "Nov-25", planned_aoa: 1303737674, actual_aoa: 0 },
    { month: "Dec-25", planned_aoa: 1471077741, actual_aoa: 0 },
    { month: "Jan-26", planned_aoa: 1735527031, actual_aoa: 0 },
    { month: "Feb-26", planned_aoa: 1989719500, actual_aoa: 404659374.56 },
    { month: "Mar-26", planned_aoa: 2172459717, actual_aoa: 0 },
    { month: "Apr-26", planned_aoa: 2386592468, actual_aoa: 246340149.83 },
    { month: "May-26", planned_aoa: 2603568555, actual_aoa: 0 },
    { month: "Jun-26", planned_aoa: 2840961686, actual_aoa: 0 },
    { month: "Jul-26", planned_aoa: 3009788627, actual_aoa: 0 },
    { month: "Aug-26", planned_aoa: 3145635027, actual_aoa: 0 },
    { month: "Sep-26", planned_aoa: 3310810621, actual_aoa: 0 },
    { month: "Oct-26", planned_aoa: 3589866845, actual_aoa: 0 },
    { month: "Nov-26", planned_aoa: 3845037672, actual_aoa: 0 },
    { month: "Dec-26", planned_aoa: 3884384440, actual_aoa: 0 },
    { month: "Jan-27", planned_aoa: 3913725148, actual_aoa: 0 }
  ];

  function api() {
    if (!window.WSDP_API) {
      throw new Error("WSDP_API is not loaded. Ensure js/api.js is loaded before home-dashboard.js.");
    }
    return window.WSDP_API;
  }

  function toast(message, icon) {
    if (window.WSDP_TOAST) {
      window.WSDP_TOAST(message, { icon: icon || "fa-circle-check" });
    } else {
      console.log(message);
    }
  }

  function request(method, path, body) {
    return api().request(method, path, body);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseStoredProject(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
      return parsed.id || parsed.project_id || parsed.projectId || parsed.value || null;
    } catch (err) {
      return value;
    }
  }

  function getProjectId() {
    return (
      parseStoredProject(localStorage.getItem("current_project")) ||
      parseStoredProject(localStorage.getItem("currentProject")) ||
      localStorage.getItem("project_id") ||
      localStorage.getItem("projectId") ||
      null
    );
  }

  function requireProjectOrToast() {
    if (!state.projectId) {
      toast("Project is missing. Set current_project in localStorage before editing cards.", "fa-triangle-exclamation");
      return false;
    }
    return true;
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function formatNumber(value) {
    if (value === null || typeof value === "undefined") return "";
    return Number(value).toLocaleString("en-US");
  }

  async function ensureSession() {
    try {
      const user = await api().restoreSession();
      return Boolean(user);
    } catch (err) {
      return false;
    }
  }

  /* ---------------------------------------------------------------
     Dynamic styles (edit/reset icon buttons, modal, import/export,
     module search dropdown)
     --------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById("homeDashboardDynamicStyles")) return;

    const style = document.createElement("style");
    style.id = "homeDashboardDynamicStyles";
    style.textContent = `
      .lubango-kpi-grid .kpi-card { position: relative; }

      .home-card__actions {
        position: absolute;
        top: 14px;
        right: 14px;
        display: flex;
        gap: 6px;
        z-index: 2;
      }

      .home-card__edit-btn {
        border: 1px solid var(--border-color, #e3e7eb);
        background: var(--bg-card, #fff);
        color: var(--text-muted, #6b7280);
        border-radius: 6px;
        width: 24px;
        height: 24px;
        font-size: 11px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .home-card__edit-btn:hover {
        background: var(--color-neutral-light, #eef3f7);
        color: var(--text-primary, #16232f);
      }

      .home-card__edit-btn.reset { color: #b91c1c; }

      .home-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .home-modal {
        width: min(520px, 100%);
        max-height: 90vh;
        overflow: auto;
        background: var(--bg-card, #fff);
        color: var(--text-primary, #16232f);
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,.22);
        border: 1px solid var(--border-color, #e3e7eb);
      }

      .home-modal__head {
        padding: 18px 20px;
        border-bottom: 1px solid var(--border-color, #e3e7eb);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .home-modal__head h3 { margin: 0; font-size: 17px; }

      .home-modal__body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }

      .home-field { display: flex; flex-direction: column; gap: 6px; }

      .home-field label { font-size: 12px; font-weight: 700; color: var(--text-muted, #6b7280); }

      .home-field input {
        width: 100%;
        border: 1px solid var(--border-color, #d7dee8);
        border-radius: 8px;
        padding: 10px 11px;
        background: var(--bg-card, #fff);
        color: var(--text-primary, #16232f);
        font: inherit;
        font-size: 13px;
      }

      .home-modal__foot {
        padding: 16px 20px;
        border-top: 1px solid var(--border-color, #e3e7eb);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .home-btn {
        border: none;
        border-radius: 8px;
        padding: 9px 14px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }

      .home-btn-primary { background: var(--color-primary, #0A4595); color: #fff; }
      .home-btn-secondary { background: var(--color-neutral-light, #eef3f7); color: var(--text-primary, #16232f); }

      #homeImportFileInput { display: none; }

      /* ---------- Module search dropdown ---------- */
      .home-search-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        width: 100%;
        min-width: 280px;
        max-height: 360px;
        overflow-y: auto;
        background: var(--bg-card, #fff);
        border: 1px solid var(--border-color, #e3e7eb);
        border-radius: 10px;
        box-shadow: 0 16px 40px rgba(16, 35, 61, 0.16);
        z-index: 60;
        padding: 6px;
      }

      .home-search-dropdown__group-label {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--text-muted, #8c9aa8);
        padding: 8px 10px 4px;
      }

      .home-search-dropdown__item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 7px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text-primary, #16232f);
      }

      .home-search-dropdown__item i {
        width: 16px;
        text-align: center;
        color: var(--text-muted, #8c9aa8);
        flex-shrink: 0;
      }

      .home-search-dropdown__item:hover,
      .home-search-dropdown__item.active-hover {
        background: var(--color-primary-light, #e7eef9);
        color: var(--color-primary, #0A4595);
      }

      .home-search-dropdown__item:hover i,
      .home-search-dropdown__item.active-hover i {
        color: var(--color-primary, #0A4595);
      }

      .home-search-dropdown__empty {
        padding: 16px 10px;
        text-align: center;
        font-size: 12.5px;
        color: var(--text-muted, #8c9aa8);
      }

      .home-search-highlight {
        animation: homeSearchPulse 1.6s ease-out;
        border-radius: var(--radius-md, 12px);
      }

      @keyframes homeSearchPulse {
        0% { box-shadow: 0 0 0 0 rgba(10, 69, 149, 0.45); }
        70% { box-shadow: 0 0 0 14px rgba(10, 69, 149, 0); }
        100% { box-shadow: 0 0 0 0 rgba(10, 69, 149, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------
     KPI card rendering / editing
     --------------------------------------------------------------- */

  function findCardEl(cardKey) {
    return document.querySelector('.kpi-card[data-card-key="' + cardKey + '"]');
  }

  function getMerged(cardKey) {
    const meta = HOME_CARD_META[cardKey];
    const override = state.cardOverrides[cardKey];

    if (!override) {
      return {
        value: meta.defaultValue,
        delta: meta.defaultDelta,
        decimals: meta.decimals || 0
      };
    }

    if (meta.type === "text") {
      return {
        value: override.value_text !== null && override.value_text !== undefined ? override.value_text : meta.defaultValue,
        delta: override.delta_text !== null && override.delta_text !== undefined ? override.delta_text : meta.defaultDelta,
        decimals: meta.decimals || 0
      };
    }

    return {
      value: override.value_number !== null && override.value_number !== undefined ? override.value_number : meta.defaultValue,
      delta: override.delta_text !== null && override.delta_text !== undefined ? override.delta_text : meta.defaultDelta,
      decimals: override.decimals !== null && override.decimals !== undefined ? override.decimals : (meta.decimals || 0)
    };
  }

  function renderCard(cardKey) {
    const meta = HOME_CARD_META[cardKey];
    const card = findCardEl(cardKey);
    if (!meta || !card) return;

    const merged = getMerged(cardKey);
    const valueEl = card.querySelector(".kpi-card__value");
    const deltaEl = card.querySelector(".kpi-card__delta");

    if (valueEl) {
      if (meta.type === "text") {
        valueEl.textContent = merged.value;
      } else {
        const numeric = Number(merged.value);
        const fixed = merged.decimals > 0 ? numeric.toFixed(merged.decimals) : String(Math.round(numeric));
        valueEl.innerHTML =
          '<span class="count-up" data-count="' + fixed + '"' +
          (merged.decimals > 0 ? ' data-decimals="' + merged.decimals + '"' : "") +
          '>' + fixed + '</span>' +
          (meta.type === "percent" ? '<span class="unit">%</span>' : "");
      }
    }

    if (deltaEl) {
      deltaEl.textContent = merged.delta || "";
    }
  }

  function renderAllCards() {
    Object.keys(HOME_CARD_META).forEach(renderCard);
  }

  function ensureCardEditButtons() {
    Object.keys(HOME_CARD_META).forEach(function (cardKey) {
      const card = findCardEl(cardKey);
      if (!card) return;

      if (card.querySelector(".home-card__actions")) return; // already wired

      const actions = document.createElement("div");
      actions.className = "home-card__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "home-card__edit-btn";
      editBtn.title = "Edit " + HOME_CARD_META[cardKey].label;
      editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      editBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!requireProjectOrToast()) return;
        openCardModal(cardKey);
      });

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "home-card__edit-btn reset";
      resetBtn.title = "Reset " + HOME_CARD_META[cardKey].label + " to default";
      resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
      resetBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        resetCard(cardKey);
      });

      actions.appendChild(editBtn);
      actions.appendChild(resetBtn);
      card.appendChild(actions);
    });
  }

  function openCardModal(cardKey) {
    const meta = HOME_CARD_META[cardKey];
    const merged = getMerged(cardKey);

    closeModal();

    const backdrop = document.createElement("div");
    backdrop.className = "home-modal-backdrop";

    const valueFieldHtml =
      meta.type === "text"
        ? `<div class="home-field">
             <label>Value</label>
             <input name="value" maxlength="60" value="${escapeHtml(merged.value)}">
           </div>`
        : `<div class="home-field">
             <label>Value${meta.type === "percent" ? " (%)" : ""}</label>
             <input name="value" type="number" step="0.01" value="${escapeHtml(merged.value)}">
           </div>`;

    backdrop.innerHTML = `
      <div class="home-modal" role="dialog" aria-modal="true">
        <form id="homeModalForm">
          <div class="home-modal__head">
            <h3>Edit ${escapeHtml(meta.label)}</h3>
            <button type="button" class="home-card__edit-btn" id="homeModalClose"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="home-modal__body">
            ${valueFieldHtml}
            <div class="home-field">
              <label>Delta / description text</label>
              <input name="delta" maxlength="200" value="${escapeHtml(merged.delta || "")}">
            </div>
          </div>
          <div class="home-modal__foot">
            <button type="button" class="home-btn home-btn-secondary" id="homeModalCancel">Cancel</button>
            <button type="submit" class="home-btn home-btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    document.getElementById("homeModalClose").addEventListener("click", closeModal);
    document.getElementById("homeModalCancel").addEventListener("click", closeModal);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
    });

    document.getElementById("homeModalForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      const form = new FormData(e.target);

      const payload = {
        value_type: meta.type,
        delta_text: String(form.get("delta") || "").trim() || null,
        decimals: meta.decimals || 0
      };

      if (meta.type === "text") {
        payload.value_text = String(form.get("value") || "").trim() || null;
        payload.value_number = null;
      } else {
        payload.value_number = form.get("value") !== "" ? Number(form.get("value")) : null;
        payload.value_text = null;
      }

      try {
        await request("PUT", "/projects/" + state.projectId + "/home-summary-cards/" + cardKey, payload);
        toast(meta.label + " updated successfully");
        closeModal();
        await loadCardOverrides();
        renderAllCards();
      } catch (err) {
        toast(err.message || "Save failed", "fa-triangle-exclamation");
      }
    });
  }

  function closeModal() {
    const modal = document.querySelector(".home-modal-backdrop");
    if (modal) modal.remove();
  }

  async function resetCard(cardKey) {
    if (!requireProjectOrToast()) return;
    const meta = HOME_CARD_META[cardKey];
    const yes = window.confirm('Reset "' + meta.label + '" back to its default value?');
    if (!yes) return;

    try {
      await request("DELETE", "/projects/" + state.projectId + "/home-summary-cards/" + cardKey);
      toast(meta.label + " reset to default", "fa-rotate-left");
      await loadCardOverrides();
      renderAllCards();
    } catch (err) {
      toast(err.message || "Reset failed", "fa-triangle-exclamation");
    }
  }

  async function loadCardOverrides() {
    if (!state.projectId) return;
    try {
      const result = await request("GET", "/projects/" + state.projectId + "/home-summary-cards");
      state.cardOverrides = result.data || {};
    } catch (err) {
      console.error("Failed to load home summary card overrides:", err);
    }
  }

  /* ---------------------------------------------------------------
     Cashflow chart (replaces "Cumulative Financial Execution")
     --------------------------------------------------------------- */

  async function loadCashFlow() {
    if (!state.projectId) {
      state.cashFlow = FALLBACK_CASH_FLOW;
      return;
    }

    try {
      const result = await request("GET", "/projects/" + state.projectId + "/financial-summary");
      const cashFlow = result && result.data && Array.isArray(result.data.cash_flow) ? result.data.cash_flow : null;
      state.cashFlow = cashFlow && cashFlow.length ? cashFlow : FALLBACK_CASH_FLOW;
    } catch (err) {
      console.error("Failed to load cash flow for Home Dashboard:", err);
      state.cashFlow = FALLBACK_CASH_FLOW;
    }
  }

  function renderCashflowChart() {
    const canvas = document.getElementById("cashflowChart");
    if (!canvas || typeof Chart === "undefined") return;

    const cashFlow = state.cashFlow || FALLBACK_CASH_FLOW;

    const plannedColor = cssVar("--color-success", "#1E8449");
    const actualColor = cssVar("--color-primary", "#0A4595");

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    state.cashflowChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: cashFlow.map(function (item) { return item.month; }),
        datasets: [
          {
            label: "Planned (M AOA)",
            data: cashFlow.map(function (item) {
              const raw = item.planned_m_aoa !== undefined ? item.planned_m_aoa : item.planned_aoa;
              return raw === null || raw === undefined ? null : Number(raw) / 1000000;
            }),
            borderColor: plannedColor,
            backgroundColor: "transparent",
            borderDash: [6, 5],
            borderWidth: 2.5,
            tension: 0.28,
            pointRadius: 3,
            spanGaps: true
          },
          {
            label: "Actual (M AOA)",
            data: cashFlow.map(function (item) {
              const raw = item.actual_m_aoa !== undefined ? item.actual_m_aoa : item.actual_aoa;
              return raw === null || raw === undefined ? null : Number(raw) / 1000000;
            }),
            borderColor: actualColor,
            backgroundColor: "rgba(10, 69, 149, 0.14)",
            borderWidth: 3,
            fill: true,
            tension: 0.28,
            pointRadius: 3,
            spanGaps: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: { maxRotation: 35, minRotation: 25, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: {
              callback: function (value) { return formatNumber(value); },
              font: { size: 11 }
            }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                if (context.parsed.y === null) return "";
                return " " + context.dataset.label + ": " + formatNumber(context.parsed.y.toFixed(2)) + " M AOA";
              }
            }
          }
        }
      }
    });
  }

  /* ---------------------------------------------------------------
     Import (Excel template -> bulk update all summary cards)
     --------------------------------------------------------------- */

  function wireImportButton() {
    const importBtn = document.getElementById("homeImportBtn");
    if (!importBtn) return;

    let fileInput = document.getElementById("homeImportFileInput");
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = "homeImportFileInput";
      fileInput.accept = ".xlsx,.xls";
      document.body.appendChild(fileInput);
    }

    importBtn.addEventListener("click", function () {
      if (!requireProjectOrToast()) return;
      if (typeof XLSX === "undefined") {
        toast("Excel import library not loaded.", "fa-triangle-exclamation");
        return;
      }
      fileInput.value = "";
      fileInput.click();
    });

    fileInput.addEventListener("change", async function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const cards = rows
          .map(function (row) {
            const cardKey = String(row["Card Key"] || row["card_key"] || "").trim();
            if (!cardKey) return null;

            const meta = HOME_CARD_META[cardKey];
            const rawValue = row["Value"] !== undefined ? row["Value"] : row["value"];
            const delta = row["Delta / Description"] !== undefined ? row["Delta / Description"] : row["delta_text"];

            const payload = {
              card_key: cardKey,
              delta_text: delta !== undefined && delta !== "" ? String(delta).trim() : null
            };

            if (meta && meta.type === "text") {
              payload.value_type = "text";
              payload.value_text = String(rawValue || "").trim() || null;
            } else {
              payload.value_type = meta ? meta.type : "number";
              payload.value_number = rawValue !== "" && !isNaN(Number(rawValue)) ? Number(rawValue) : null;
              payload.decimals = meta ? meta.decimals || 0 : 0;
            }

            return payload;
          })
          .filter(Boolean);

        if (!cards.length) {
          toast("No valid rows found in the uploaded file.", "fa-triangle-exclamation");
          return;
        }

        const result = await request("POST", "/projects/" + state.projectId + "/home-summary-cards/import", { cards });
        toast((result && result.message) || "Import completed successfully");

        await loadCardOverrides();
        renderAllCards();
      } catch (err) {
        console.error(err);
        toast(err.message || "Import failed \u2014 check the file format.", "fa-triangle-exclamation");
      }
    });
  }

  /* ---------------------------------------------------------------
     Export (whole Home Dashboard -> PDF)
     --------------------------------------------------------------- */

  function wireExportButton() {
    const exportBtn = document.getElementById("homeExportBtn");
    if (!exportBtn) return;

    exportBtn.addEventListener("click", async function () {
      if (typeof html2canvas === "undefined" || !window.jspdf) {
        toast("PDF export library not loaded.", "fa-triangle-exclamation");
        return;
      }

      const target = document.querySelector(".main-content");
      if (!target) return;

      toast("Preparing PDF export\u2026", "fa-file-export");

      try {
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: target.scrollWidth,
          windowHeight: target.scrollHeight
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
        pdf.save("WSIDP 2 - Lubango-Home-Dashboard-" + dateStr + ".pdf");

        toast("Home Dashboard exported to PDF", "fa-file-pdf");
      } catch (err) {
        console.error(err);
        toast(err.message || "Export failed", "fa-triangle-exclamation");
      }
    });
  }

  /* ---------------------------------------------------------------
     Module search: dropdown of every sub-section heading on this
     page, with click-to-scroll navigation. Wired onto the SAME
     shared #globalSearch input that shell.js renders on every page
     (id + .search-box wrapper class confirmed from the codebase) --
     but since this file only loads on index.html, none of this
     touches any other module/page.
     --------------------------------------------------------------- */

  function buildSearchIndex() {
    const index = [];

    // 1) Headline indicators strip (no <h2> of its own -- single
    //    hardcoded entry pointing at the whole strip).
    const headlineStrip = document.querySelector(".headline-strip");
    if (headlineStrip) {
      index.push({ group: "Overview", label: "Headline Indicators", icon: "fa-bullhorn", el: headlineStrip });
    }

    // 2) Every KPI summary card (label read directly from the DOM,
    //    so it always matches whatever is currently rendered).
    document.querySelectorAll(".lubango-kpi-grid .kpi-card").forEach(function (card) {
      const labelEl = card.querySelector(".kpi-card__label");
      if (!labelEl) return;
      index.push({
        group: "Summary Cards",
        label: labelEl.textContent.trim(),
        icon: "fa-gauge-high",
        el: card
      });
    });

    // 3) Section headings (<h2> inside .section-heading) + each
    //    individual chart card's <h3> underneath it.
    document.querySelectorAll(".section-heading").forEach(function (heading) {
      const h2 = heading.querySelector("h2");
      if (!h2) return;

      const sectionLabel = h2.textContent.trim();
      index.push({ group: "Sections", label: sectionLabel, icon: "fa-layer-group", el: heading });

      // Chart cards live in the very next sibling element (the
      // .grid.grid-12 wrapper, or the GIS Map's .card wrapper).
      const contentBlock = heading.nextElementSibling;
      if (contentBlock) {
        contentBlock.querySelectorAll(".card-header h3").forEach(function (h3) {
          const cardEl = h3.closest(".card");
          if (!cardEl) return;
          index.push({
            group: sectionLabel,
            label: h3.textContent.trim(),
            icon: "fa-chart-line",
            el: cardEl
          });
        });
      }
    });

    return index;
  }

  function getSearchAnchor(input) {
    return input.closest(".search-box") || input.parentElement;
  }

  function highlightElement(el) {
    el.classList.remove("home-search-highlight");
    // force reflow so the animation restarts if the same target is
    // selected twice in a row
    void el.offsetWidth;
    el.classList.add("home-search-highlight");
    setTimeout(function () {
      el.classList.remove("home-search-highlight");
    }, 1700);
  }

  function initModuleSearch() {
    const input = document.getElementById("globalSearch");
    if (!input) return;

    const anchor = getSearchAnchor(input);
    if (getComputedStyle(anchor).position === "static") {
      anchor.style.position = "relative";
    }

    const searchIndex = buildSearchIndex();
    let dropdown = null;
    let activeIndex = -1;
    let visibleItems = [];

    function closeDropdown() {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
      activeIndex = -1;
      visibleItems = [];
    }

    function selectEntry(entry) {
      closeDropdown();
      input.value = "";
      input.blur();
      entry.el.scrollIntoView({ behavior: "smooth", block: "start" });
      highlightElement(entry.el);
    }

    function renderDropdown(query) {
      const q = (query || "").trim().toLowerCase();

      const filtered = q
        ? searchIndex.filter(function (entry) { return entry.label.toLowerCase().includes(q); })
        : searchIndex;

      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "home-search-dropdown";
        anchor.appendChild(dropdown);
      }

      activeIndex = -1;
      visibleItems = [];

      if (!filtered.length) {
        dropdown.innerHTML = '<div class="home-search-dropdown__empty">No matching section found.</div>';
        return;
      }

      let html = "";
      let lastGroup = null;

      filtered.forEach(function (entry, i) {
        if (entry.group !== lastGroup) {
          html += '<div class="home-search-dropdown__group-label">' + escapeHtml(entry.group) + "</div>";
          lastGroup = entry.group;
        }
        html +=
          '<div class="home-search-dropdown__item" data-index="' + i + '">' +
          '<i class="fa-solid ' + entry.icon + '"></i>' +
          "<span>" + escapeHtml(entry.label) + "</span>" +
          "</div>";
      });

      dropdown.innerHTML = html;
      visibleItems = filtered;

      dropdown.querySelectorAll(".home-search-dropdown__item").forEach(function (item) {
        item.addEventListener("mousedown", function (e) {
          // mousedown (not click) so it fires before the input's blur
          e.preventDefault();
          const idx = Number(item.getAttribute("data-index"));
          selectEntry(visibleItems[idx]);
        });
      });
    }

    input.addEventListener("focus", function () {
      renderDropdown(input.value);
    });

    input.addEventListener("click", function () {
      if (!dropdown) renderDropdown(input.value);
    });

    input.addEventListener("input", function () {
      renderDropdown(input.value);
    });

    // Intercept Enter/Escape/Arrow keys ONLY while our dropdown is open,
    // in the capture phase, so main.js's existing keydown handler on
    // this same input (the placeholder "Enter to search" toast) never
    // fires when the module search dropdown is actively being used.
    input.addEventListener(
      "keydown",
      function (e) {
        if (!dropdown || !visibleItems.length) return;

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopImmediatePropagation();
          const items = Array.from(dropdown.querySelectorAll(".home-search-dropdown__item"));
          items.forEach(function (it) { it.classList.remove("active-hover"); });
          activeIndex =
            e.key === "ArrowDown"
              ? Math.min(activeIndex + 1, items.length - 1)
              : Math.max(activeIndex - 1, 0);
          const activeEl = items[activeIndex];
          if (activeEl) {
            activeEl.classList.add("active-hover");
            activeEl.scrollIntoView({ block: "nearest" });
          }
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          e.stopImmediatePropagation();
          const chosen = activeIndex >= 0 ? visibleItems[activeIndex] : visibleItems[0];
          if (chosen) selectEntry(chosen);
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeDropdown();
          input.blur();
        }
      },
      true // capture phase: runs before main.js's own keydown listener
    );

    document.addEventListener("click", function (e) {
      if (!dropdown) return;
      if (e.target === input || anchor.contains(e.target)) return;
      closeDropdown();
    });
  }

  /* ---------------------------------------------------------------
     Init
     --------------------------------------------------------------- */

  async function init() {
    injectStyles();

    renderAllCards();
    renderCashflowChart();

    wireImportButton();
    wireExportButton();
    initModuleSearch();

    const sessionOk = await ensureSession();
    state.projectId = getProjectId();

    ensureCardEditButtons();

    if (!sessionOk || !state.projectId) {
      return; // stays on defaults/fallback (matches other dashboards' graceful degradation)
    }

    await Promise.allSettled([loadCardOverrides(), loadCashFlow()]);

    renderAllCards();
    renderCashflowChart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
