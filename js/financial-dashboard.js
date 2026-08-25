/* ============================================================
   financial-dashboard.js
   Financial Dashboard page script

   Keeps existing website theme, layout, colors and API wrapper.

   REVISION SUMMARY (this update):
   - FIX #1 (indirect): duplicate <script> includes of api.js/shell.js/
     main.js removed from financial-dashboard.html (see that file) —
     this is the most likely cause of the navigation freeze between
     multi-section modules.
   - FIX #2: Full CRUD (edit + reset-to-default) added for all 8 KPI
     summary/reference cards (Financial Progress, Physical Progress,
     Cumulative Expenditure, IPC Status, Total Contract, Advance
     Payment 20%, Contract Balance, Prov. Sum (15%)), backed by the new
     financial-summary-card.routes.js / FinancialSummaryCard model.
   - FIX #3: (root cause was data, not code) Payment Tracking edit/
     delete already worked once real rows (with ids) load — now more
     likely to actually load thanks to the FIX #5 resilience change.
   - FIX #4: single "Planned vs Actual Progress" chart split into two:
     #physicalProgressChart (Planned vs Actual Physical %) and
     #financialProgressChart (Planned vs Actual Financial %). Same
     line-chart pattern/colors/legend/tooltip style as before, just
     split across two canvases instead of one with 4 datasets.
   - FIX #5: reloadAll() now uses Promise.allSettled instead of
     Promise.all, so a single failing endpoint (e.g. one table not yet
     migrated) no longer blanks the ENTIRE dashboard back to fallback
     values — each section renders independently with whatever data it
     successfully received.
   - FIX #6: "Addenda / Amendments" heading renamed to "Amendments" in
     financial-dashboard.html (table IDs/wiring left unchanged to avoid
     unnecessary risk).

   Load order required:
   api.js, i18n.js, shell.js, main.js, Chart.js, then this file.
   ============================================================ */

(function () {
  "use strict";

  const state = {
    projectId: null,
    budgets: [],
    invoices: [],
    ipcs: [],
    amendments: [],
    bankGuarantees: [],
    paymentTracking: [],
    summary: null,
    cashFlowChart: null,
    physicalProgressChart: null,
    financialProgressChart: null,
    activeInvoice: null,
    activeBudget: null
  };

  const STATUS_LABELS = {
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
    rejected: "Rejected"
  };

  const STATUS_CLASS = {
    pending: "warn",
    approved: "ok",
    paid: "ok",
    rejected: "danger"
  };

  // Fallback constants — used only when the backend / session is
  // completely unavailable (e.g. first paint, or total network failure).
  const FALLBACK_REFERENCE_CARDS = {
    total_contract_m_aoa: 3625.58,
    total_contract_m_usd: 5.60,
    advance_payment_20_m_aoa: 725.12,
    advance_payment_20_m_usd: 1.12,
    contract_balance_m_aoa: 2974.58,
    contract_balance_m_usd: 4.59,
    prov_sum_15_m_aoa: 472.90,
    prov_sum_15_m_usd: 0.73
  };

  const FALLBACK_IPC_TRACKER = [
    { ipc: "IPC-01", period: "Feb 2026", aoa_amount: 404659374.56, usd_amount: 624995.17, percentage: 11.16, ace_status: "Certified", client_status: "Approved", is_cumulative: false },
    { ipc: "IPC-02", period: "Apr 2026", aoa_amount: 246340149.83, usd_amount: 380471.61, percentage: 6.79, ace_status: "Certified 24/06", client_status: "Submitted", is_cumulative: false },
    { ipc: "Cumulative", period: "—", aoa_amount: 650999524.39, usd_amount: 1005466.78, percentage: 17.96, ace_status: "—", client_status: "—", is_cumulative: true },
    { ipc: "IPC-03", period: "—", aoa_amount: null, usd_amount: null, percentage: null, ace_status: "Future", client_status: "—", is_cumulative: false }
  ];

  const FALLBACK_PAYMENT_TRACKING = [
    { description: "Contract Value", amount_aoa: 3625580000.00, amount_usd: 5599704.50, is_highlighted: true },
    { description: "Amount Invoiced", amount_aoa: 650999524.39, amount_usd: 1005466.78, is_highlighted: false },
    { description: "Amount Paid", amount_aoa: 404659374.56, amount_usd: 624995.17, is_highlighted: false },
    { description: "Outstanding", amount_aoa: 246340149.83, amount_usd: 380471.61, is_highlighted: true }
  ];

  const FALLBACK_BANK_GUARANTEES = [
    { guarantee: "Advance Payment Guarantees (APG)", bank: "Bank of China", usd_amount: 1119940.90, valid_until: "2026-08-23", status: "Expires < 60d · Renew" },
    { guarantee: "Performance Security (PG)", bank: "Bank of China", usd_amount: 559970.45, valid_until: "2026-12-31", status: "Valid" }
  ];

  const FALLBACK_AMENDMENTS = [
    { amendment: "Amendment No. 01", amendment_date: null, scope: "Initial amendment record to be updated from contract file", status: "Record pending" },
    { amendment: "Amendment No. 02", amendment_date: null, scope: "Second amendment record to be updated from contract file", status: "Record pending" },
    { amendment: "Amendment No. 03", amendment_date: null, scope: "Third amendment record to be updated from contract file", status: "Record pending" },
    { amendment: "Amendment No. 04", amendment_date: "2026-05-07", scope: "Revised DDR scope: 92.677 km / 5,303 HSC (USD 6,044,736.58)", status: "Under Employer review" },
    { amendment: "Amendment No. 05", amendment_date: null, scope: "EOT + Price Adjustment", status: "Pending CTCE" }
  ];

  // Metadata describing every editable KPI summary/reference card.
  // type: "money"   -> value_primary (M AOA) + value_secondary (M USD)
  // type: "percent" -> value_primary (a plain % number)
  // type: "text"    -> value_text (main) + sub_text (secondary line)
  const SUMMARY_CARD_META = {
    financial_progress_pct: { label: "Financial Progress", type: "percent", unit: "%" },
    physical_progress_pct: { label: "Physical Progress", type: "percent", unit: "%" },
    cumulative_expenditure: { label: "Cumulative Expenditure", type: "money" },
    ipc_status: { label: "IPC Status", type: "text" },
    total_contract: { label: "Total Contract", type: "money" },
    advance_payment_20: { label: "Advance Payment 20%", type: "money" },
    contract_balance: { label: "Contract Balance", type: "money" },
    prov_sum_15: { label: "Prov. Sum (15%)", type: "money" }
  };

  function api() {
    if (!window.WSDP_API) {
      throw new Error("WSDP_API is not loaded. Ensure js/api.js is loaded before financial-dashboard.js.");
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

      if (typeof parsed === "string") {
        return parsed;
      }

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
      toast(
        "Project is missing. Set current_project in localStorage before using Financial Dashboard.",
        "fa-triangle-exclamation"
      );
      return false;
    }
    return true;
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();

    return value || fallback;
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;

    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }

  function formatAmount(value, decimals) {
    if (value === null || value === undefined || value === "") return "—";

    const n = Number(value);
    if (Number.isNaN(n)) return String(value);

    return n.toLocaleString("en-IN", {
      minimumFractionDigits: decimals === undefined ? 0 : decimals,
      maximumFractionDigits: decimals === undefined ? 2 : decimals
    });
  }

  function formatM(value) {
    const n = toNumber(value);
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatMoneyPair(mAoa, mUsd) {
    return (
      '<span>' +
      escapeHtml(formatM(mAoa)) +
      '</span><span class="unit">M AOA</span>' +
      '<div class="kpi-card__subvalue">USD ' +
      escapeHtml(formatM(mUsd)) +
      'M</div>'
    );
  }

  function formatAoaUsdAmount(aoa, usd) {
    const parts = [];
    if (aoa !== null && aoa !== undefined && aoa !== "") {
      parts.push(formatAmount(aoa, 2) + " AOA");
    }
    if (usd !== null && usd !== undefined && usd !== "") {
      parts.push(formatAmount(usd, 2) + " USD");
    }
    return parts.length ? parts.join(" / ") : "—";
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "—";

    const n = Number(value);
    if (Number.isNaN(n)) return String(value);

    return n.toFixed(2) + "%";
  }

  function toInputDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function formatDisplayDate(value) {
    if (!value) return "—";

    if (String(value).toLowerCase() === "drafting") {
      return "Drafting";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  async function ensureSession() {
    try {
      const user = await api().restoreSession();
      return Boolean(user);
    } catch (err) {
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById("financialDashboardDynamicStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "financialDashboardDynamicStyles";
    style.textContent = `
      .financial-reference-kpis {
        margin-top: 18px;
      }

      .kpi-card__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .kpi-card__actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .kpi-card__edit-btn {
        border: 1px solid var(--border-color, #e3e7eb);
        background: var(--card-bg, #fff);
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

      .kpi-card__edit-btn:hover {
        background: var(--color-neutral-light, #eef3f7);
        color: var(--text-primary, #16232f);
      }

      .kpi-card__edit-btn.reset {
        color: #b91c1c;
      }

      .kpi-card__subvalue {
        margin-top: 4px;
        font-size: 12px;
        font-weight: 700;
        color: var(--text-muted, #7a8695);
        line-height: 1.2;
      }

      .financial-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        padding: 0 0 14px;
        flex-wrap: wrap;
      }

      .financial-btn {
        border: none;
        border-radius: 8px;
        padding: 9px 12px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }

      .financial-btn-primary {
        background: var(--color-primary, #0f766e);
        color: #fff;
      }

      .financial-btn-secondary {
        background: var(--color-neutral-light, #eef3f7);
        color: var(--text-primary, #16232f);
      }

      .financial-row-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        white-space: nowrap;
      }

      .financial-icon-btn {
        border: 1px solid var(--border-color, #e3e7eb);
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232f);
        border-radius: 7px;
        width: 30px;
        height: 30px;
        cursor: pointer;
      }

      .financial-icon-btn:hover {
        background: var(--color-neutral-light, #eef3f7);
      }

      .financial-icon-btn.danger {
        color: #b91c1c;
      }

      .financial-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .financial-modal {
        width: min(720px, 100%);
        max-height: 90vh;
        overflow: auto;
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232f);
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,.22);
        border: 1px solid var(--border-color, #e3e7eb);
      }

      .financial-modal__head {
        padding: 18px 20px;
        border-bottom: 1px solid var(--border-color, #e3e7eb);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .financial-modal__head h3 {
        margin: 0;
        font-size: 17px;
      }

      .financial-modal__body {
        padding: 18px 20px;
      }

      .financial-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .financial-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .financial-field.full {
        grid-column: 1 / -1;
      }

      .financial-field label {
        font-size: 12px;
        font-weight: 700;
        color: var(--text-muted, #6b7280);
      }

      .financial-field input,
      .financial-field select,
      .financial-field textarea {
        width: 100%;
        border: 1px solid var(--border-color, #d7dee8);
        border-radius: 8px;
        padding: 10px 11px;
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232f);
        font: inherit;
        font-size: 13px;
      }

      .financial-field-checkbox {
        flex-direction: row;
        align-items: center;
        gap: 8px;
      }

      .financial-field-checkbox input {
        width: auto;
      }

      .financial-modal__foot {
        padding: 16px 20px;
        border-top: 1px solid var(--border-color, #e3e7eb);
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }

      .financial-modal__foot-right {
        display: flex;
        gap: 10px;
      }

      .financial-empty {
        text-align: center;
        color: var(--text-muted, #7a8695);
        padding: 22px;
      }

      @media (max-width: 700px) {
        .financial-form-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function findKpiCard(label) {
    const cards = document.querySelectorAll(".kpi-card");

    for (const card of cards) {
      const labelEl = card.querySelector(".kpi-card__label");
      if (!labelEl) continue;

      if (labelEl.textContent.trim().toLowerCase() === label.toLowerCase()) {
        return card;
      }
    }

    return null;
  }

  function findKpiCardByKey(cardKey) {
    return document.querySelector('.kpi-card[data-card-key="' + cardKey + '"]');
  }

  function setCountValue(label, value, decimals) {
    const card = findKpiCard(label);
    if (!card) return;

    const countEl = card.querySelector(".count-up");
    if (!countEl) return;

    const n = toNumber(value);
    const fixed = n.toFixed(decimals || 0);

    countEl.setAttribute("data-count", fixed);
    countEl.textContent = fixed;
  }

  function setCardValue(label, html) {
    const card = findKpiCard(label);
    if (!card) return;

    const valueEl = card.querySelector(".kpi-card__value");
    if (valueEl) {
      valueEl.innerHTML = html;
    }
  }

  function setCardDelta(label, text) {
    const card = findKpiCard(label);
    if (!card) return;

    const deltaEl = card.querySelector(".kpi-card__delta");
    if (deltaEl) {
      deltaEl.textContent = text || "";
    }
  }

  /* ---------------------------------------------------------------
     Generic table helpers (S.No. column, Actions column, action bar)
     --------------------------------------------------------------- */

  function getTable(id) {
    return document.getElementById(id);
  }

  function getTableBody(tableId, bodyId) {
    const table = getTable(tableId);
    if (!table) return null;

    let tbody = document.getElementById(bodyId) || table.querySelector("tbody");

    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    tbody.id = bodyId;
    return tbody;
  }

  function ensureTableActionsBar(tableId, barId, buttonsHtml) {
    const table = getTable(tableId);
    if (!table) return null;

    const tableCard = table.closest(".card");
    if (!tableCard) return null;

    const cardBody = tableCard.querySelector(".card-body");
    if (!cardBody) return null;

    let bar = document.getElementById(barId);

    if (!bar) {
      bar = document.createElement("div");
      bar.className = "financial-actions";
      bar.id = barId;
      cardBody.insertBefore(bar, cardBody.firstChild);
    }

    bar.innerHTML = buttonsHtml;
    return bar;
  }

  function renderStatusChip(label, explicitClass) {
    if (!label || label === "—") return "—";

    const text = String(label);
    const lower = text.toLowerCase();

    let cls = explicitClass || "warn";
    let icon = "fa-clock";

    if (
      lower.includes("valid") ||
      lower.includes("approved") ||
      lower.includes("certified") ||
      lower.includes("received") ||
      lower.includes("paid")
    ) {
      cls = "ok";
      icon = "fa-circle-check";
    }

    if (
      lower.includes("expire") ||
      lower.includes("pending") ||
      lower.includes("submitted") ||
      lower.includes("future") ||
      lower.includes("review") ||
      lower.includes("draft")
    ) {
      cls = "warn";
      icon = "fa-clock";
    }

    return `
      <span class="status-chip ${escapeHtml(cls)}">
        <i class="fa-solid ${escapeHtml(icon)}"></i> ${escapeHtml(text)}
      </span>
    `;
  }

  function renderRowActions(canEdit, editAttr, deleteAttr) {
    if (!canEdit) return "—";

    return `
      <div class="financial-row-actions">
        <button type="button" class="financial-icon-btn" ${editAttr} title="Edit">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" class="financial-icon-btn danger" ${deleteAttr} title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
  }

  /* ---------------------------------------------------------------
     KPI SUMMARY / REFERENCE CARDS — now with full CRUD (edit + reset)
     --------------------------------------------------------------- */

  function getMergedCard(cardKey) {
    const cards = (state.summary && state.summary.summary_cards) || {};
    return cards[cardKey] || null;
  }

  function ensureCardEditButtons() {
    Object.keys(SUMMARY_CARD_META).forEach(function (cardKey) {
      const card = findKpiCardByKey(cardKey);
      if (!card) return;

      let actionsEl = card.querySelector(".kpi-card__actions");
      if (!actionsEl) {
        actionsEl = document.createElement("div");
        actionsEl.className = "kpi-card__actions";
        const top = card.querySelector(".kpi-card__top");
        if (top) top.appendChild(actionsEl);
      }

      if (actionsEl.querySelector("[data-summary-card-edit]")) {
        return; // already wired
      }

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "kpi-card__edit-btn";
      editBtn.title = "Edit " + SUMMARY_CARD_META[cardKey].label;
      editBtn.setAttribute("data-summary-card-edit", cardKey);
      editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      editBtn.addEventListener("click", function () {
        if (!requireProjectOrToast()) return;
        openSummaryCardModal(cardKey);
      });

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "kpi-card__edit-btn reset";
      resetBtn.title = "Reset " + SUMMARY_CARD_META[cardKey].label + " to default";
      resetBtn.setAttribute("data-summary-card-reset", cardKey);
      resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
      resetBtn.addEventListener("click", function () {
        resetSummaryCard(cardKey);
      });

      // Insert icon element first, then edit/reset buttons after it so
      // the icon (money-bag, chart, etc.) still appears first visually.
      actionsEl.appendChild(editBtn);
      actionsEl.appendChild(resetBtn);
    });
  }

  function openSummaryCardModal(cardKey) {
    const meta = SUMMARY_CARD_META[cardKey];
    if (!meta) return;

    const current = getMergedCard(cardKey) || {};

    let body = "";

    if (meta.type === "money") {
      body = `
        <div class="financial-form-grid">
          <div class="financial-field">
            <label>Value (M AOA)</label>
            <input name="value_primary" type="number" step="0.01" value="${escapeHtml(current.value_primary !== null && current.value_primary !== undefined ? current.value_primary : "")}">
          </div>
          <div class="financial-field">
            <label>Value (M USD)</label>
            <input name="value_secondary" type="number" step="0.01" value="${escapeHtml(current.value_secondary !== null && current.value_secondary !== undefined ? current.value_secondary : "")}">
          </div>
          <div class="financial-field full">
            <label>Delta / description text</label>
            <input name="note_text" maxlength="200" value="${escapeHtml(current.note_text || "")}">
          </div>
        </div>
      `;
    } else if (meta.type === "percent") {
      body = `
        <div class="financial-form-grid">
          <div class="financial-field">
            <label>Value (%)</label>
            <input name="value_primary" type="number" step="0.01" min="0" max="100" value="${escapeHtml(current.value_primary !== null && current.value_primary !== undefined ? current.value_primary : "")}">
          </div>
          <div class="financial-field full">
            <label>Delta / description text</label>
            <input name="note_text" maxlength="200" value="${escapeHtml(current.note_text || "")}">
          </div>
        </div>
      `;
    } else {
      body = `
        <div class="financial-form-grid">
          <div class="financial-field full">
            <label>Main value (e.g. IPC-02)</label>
            <input name="value_text" maxlength="100" value="${escapeHtml(current.value_text || "")}">
          </div>
          <div class="financial-field full">
            <label>Sub-text (e.g. reason / qualifier)</label>
            <input name="sub_text" maxlength="200" value="${escapeHtml(current.sub_text || "")}">
          </div>
          <div class="financial-field full">
            <label>Delta / description text</label>
            <input name="note_text" maxlength="200" value="${escapeHtml(current.note_text || "")}">
          </div>
        </div>
      `;
    }

    openModal("Edit " + meta.label, body, async function (form) {
      const payload = {};

      if (meta.type === "money") {
        payload.value_primary = form.get("value_primary") ? Number(form.get("value_primary")) : null;
        payload.value_secondary = form.get("value_secondary") ? Number(form.get("value_secondary")) : null;
        payload.note_text = String(form.get("note_text") || "").trim() || null;
      } else if (meta.type === "percent") {
        payload.value_primary = form.get("value_primary") ? Number(form.get("value_primary")) : null;
        payload.note_text = String(form.get("note_text") || "").trim() || null;
      } else {
        payload.value_text = String(form.get("value_text") || "").trim() || null;
        payload.sub_text = String(form.get("sub_text") || "").trim() || null;
        payload.note_text = String(form.get("note_text") || "").trim() || null;
      }

      await request("PUT", "/projects/" + state.projectId + "/financial-summary-cards/" + cardKey, payload);
      toast(meta.label + " updated successfully");
    });
  }

  async function resetSummaryCard(cardKey) {
    if (!requireProjectOrToast()) return;

    const meta = SUMMARY_CARD_META[cardKey];
    const yes = window.confirm('Reset "' + (meta ? meta.label : cardKey) + '" back to its default/computed value?');
    if (!yes) return;

    try {
      await request("DELETE", "/projects/" + state.projectId + "/financial-summary-cards/" + cardKey);
      toast((meta ? meta.label : "Card") + " reset to default", "fa-rotate-left");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Reset failed", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     Reference / summary KPI cards
     --------------------------------------------------------------- */

  function renderReferenceCards() {
    const ref = (state.summary && state.summary.reference_cards) || {};
    const cards = (state.summary && state.summary.summary_cards) || {};

    const totalContractAoa = ref.total_contract_m_aoa ?? FALLBACK_REFERENCE_CARDS.total_contract_m_aoa;
    const totalContractUsd = ref.total_contract_m_usd ?? FALLBACK_REFERENCE_CARDS.total_contract_m_usd;
    setCardValue("Total Contract", formatMoneyPair(totalContractAoa, totalContractUsd));
    setCardDelta("Total Contract", (cards.total_contract && cards.total_contract.note_text) || "Contract value in AOA and USD");

    const advanceAoa = ref.advance_payment_20_m_aoa ?? FALLBACK_REFERENCE_CARDS.advance_payment_20_m_aoa;
    const advanceUsd = ref.advance_payment_20_m_usd ?? FALLBACK_REFERENCE_CARDS.advance_payment_20_m_usd;
    setCardValue("Advance Payment 20%", formatMoneyPair(advanceAoa, advanceUsd));
    setCardDelta("Advance Payment 20%", (cards.advance_payment_20 && cards.advance_payment_20.note_text) || "Advance payment disbursed");

    const balanceAoa = ref.contract_balance_m_aoa ?? FALLBACK_REFERENCE_CARDS.contract_balance_m_aoa;
    const balanceUsd = ref.contract_balance_m_usd ?? FALLBACK_REFERENCE_CARDS.contract_balance_m_usd;
    setCardValue("Contract Balance", formatMoneyPair(balanceAoa, balanceUsd));
    setCardDelta("Contract Balance", (cards.contract_balance && cards.contract_balance.note_text) || "Remaining contract balance");

    const provAoa = ref.prov_sum_15_m_aoa ?? FALLBACK_REFERENCE_CARDS.prov_sum_15_m_aoa;
    const provUsd = ref.prov_sum_15_m_usd ?? FALLBACK_REFERENCE_CARDS.prov_sum_15_m_usd;
    setCardValue("Prov. Sum (15%)", formatMoneyPair(provAoa, provUsd));
    setCardDelta(
      "Prov. Sum (15%)",
      (cards.prov_sum_15 && cards.prov_sum_15.note_text) ||
        "3,000 USD is claimed in IPC-02. Available balance is 727,396.24 USD."
    );
  }

  function renderSummary() {
    const s = state.summary || {};
    const cards = s.summary_cards || {};

    const financialProgress = Number(
      s.financial_progress_pct !== undefined && s.financial_progress_pct !== null
        ? s.financial_progress_pct
        : 17.96
    );

    const physicalProgress = Number(
      s.physical_progress_pct !== undefined && s.physical_progress_pct !== null
        ? s.physical_progress_pct
        : 19.36
    );

    setCountValue("Financial Progress", financialProgress, 2);
    setCardDelta(
      "Financial Progress",
      (cards.financial_progress_pct && cards.financial_progress_pct.note_text) ||
        "Cumulation of both IPC-01 and IPC-02"
    );

    setCountValue("Physical Progress", physicalProgress, 2);
    setCardDelta(
      "Physical Progress",
      (cards.physical_progress_pct && cards.physical_progress_pct.note_text) ||
        "Overall physical work progress from the average of activities"
    );

    // FIX #5: Cumulative Expenditure now reads from the backend instead
    // of being permanently hardcoded to 651.00 / 1.01M regardless of data.
    const cumAoa = s.cumulative_expenditure_m_aoa !== undefined && s.cumulative_expenditure_m_aoa !== null
      ? s.cumulative_expenditure_m_aoa
      : 651.00;
    const cumUsd = s.cumulative_expenditure_m_usd !== undefined && s.cumulative_expenditure_m_usd !== null
      ? s.cumulative_expenditure_m_usd
      : 1.01;
    setCardValue(
      "Cumulative Expenditure",
      '<span>' + escapeHtml(formatM(cumAoa)) + '</span><span class="unit">M AOA</span><div class="kpi-card__subvalue">USD ' + escapeHtml(formatM(cumUsd)) + 'M</div>'
    );
    setCardDelta("Cumulative Expenditure", s.cumulative_expenditure_note || "of USD 5.60M contract value");

    // FIX #5: IPC Status now reads from the backend instead of being
    // permanently hardcoded to "IPC-02" regardless of data.
    const ipcValue = s.ipc_status_value || "IPC-02";
    const ipcSubtext = s.ipc_status_subtext || "(Withhold by Employer due to Quality of Work)";
    const ipcNote = s.ipc_status_note || "IPC-01 released, IPC-02 Withhold";
    setCardValue(
      "IPC Status",
      escapeHtml(ipcValue) + '<div class="kpi-card__subvalue">' + escapeHtml(ipcSubtext) + '</div>'
    );
    setCardDelta("IPC Status", ipcNote);

    renderReferenceCards();
    ensureCardEditButtons();
  }

  function destroyChart(canvas) {
    if (!canvas || !window.Chart) return;

    const existing = window.Chart.getChart(canvas);
    if (existing) {
      existing.destroy();
    }
  }

  function renderCharts() {
    if (!window.Chart) return;

    const summary = state.summary || {};

    const cashFlow = Array.isArray(summary.cash_flow) && summary.cash_flow.length
      ? summary.cash_flow
      : [
          { month: "Jul-25", planned_aoa: 190564875, actual_aoa: 0, planned_usd: 294326.87, actual_usd: 0 },
          { month: "Aug-25", planned_aoa: 520207699, actual_aoa: 0, planned_usd: 803459.21, actual_usd: 0 },
          { month: "Sep-25", planned_aoa: 634474730, actual_aoa: 0, planned_usd: 979944.29, actual_usd: 0 },
          { month: "Oct-25", planned_aoa: 996854897, actual_aoa: 0, planned_usd: 1539639.36, actual_usd: 0 },
          { month: "Nov-25", planned_aoa: 1303737674, actual_aoa: 0, planned_usd: 2013618.87, actual_usd: 0 },
          { month: "Dec-25", planned_aoa: 1471077741, actual_aoa: 0, planned_usd: 2272075.09, actual_usd: 0 },
          { month: "Jan-26", planned_aoa: 1735527031, actual_aoa: 0, planned_usd: 2680516.22, actual_usd: 0 },
          { month: "Feb-26", planned_aoa: 1989719500, actual_aoa: 404659374.56, planned_usd: 3073115.71, actual_usd: 624995.17 },
          { month: "Mar-26", planned_aoa: 2172459717, actual_aoa: 0, planned_usd: 3355357.42, actual_usd: 0 },
          { month: "Apr-26", planned_aoa: 2386592468, actual_aoa: 246340149.83, planned_usd: 3686084.81, actual_usd: 380471.61 },
          { month: "May-26", planned_aoa: 2603568555, actual_aoa: 0, planned_usd: 4021203.71, actual_usd: 0 },
          { month: "Jun-26", planned_aoa: 2840961686, actual_aoa: 0, planned_usd: 4387856.68, actual_usd: 0 },
          { month: "Jul-26", planned_aoa: 3009788627, actual_aoa: 0, planned_usd: 4648609.38, actual_usd: 0 },
          { month: "Aug-26", planned_aoa: 3145635027, actual_aoa: 0, planned_usd: 4858423.73, actual_usd: 0 },
          { month: "Sep-26", planned_aoa: 3310810621, actual_aoa: 0, planned_usd: 5113536.93, actual_usd: 0 },
          { month: "Oct-26", planned_aoa: 3589866845, actual_aoa: 0, planned_usd: 5544538.42, actual_usd: 0 },
          { month: "Nov-26", planned_aoa: 3845037672, actual_aoa: 0, planned_usd: 5938648.99, actual_usd: 0 },
          { month: "Dec-26", planned_aoa: 3884384440, actual_aoa: 0, planned_usd: null, actual_usd: null },
          { month: "Jan-27", planned_aoa: 3913725148, actual_aoa: 0, planned_usd: null, actual_usd: null }
        ];

    const progress = Array.isArray(summary.financial_vs_physical) && summary.financial_vs_physical.length
      ? summary.financial_vs_physical
      : [
          { month: "Jul-25", planned_physical: 1.47, planned_financial: 4.87, actual_physical: 0, actual_financial: 0 },
          { month: "Aug-25", planned_physical: 3.30, planned_financial: 13.29, actual_physical: 0, actual_financial: 0 },
          { month: "Sep-25", planned_physical: 5.06, planned_financial: 16.21, actual_physical: 0, actual_financial: 0 },
          { month: "Oct-25", planned_physical: 6.70, planned_financial: 25.47, actual_physical: 0, actual_financial: 0 },
          { month: "Nov-25", planned_physical: 11.52, planned_financial: 33.31, actual_physical: 0, actual_financial: 0 },
          { month: "Dec-25", planned_physical: 20.19, planned_financial: 37.59, actual_physical: 0, actual_financial: 0 },
          { month: "Jan-26", planned_physical: 27.88, planned_financial: 44.34, actual_physical: 1.61, actual_financial: 0 },
          { month: "Feb-26", planned_physical: 37.20, planned_financial: 50.84, actual_physical: 4.74, actual_financial: 11.16 },
          { month: "Mar-26", planned_physical: 47.73, planned_financial: 55.51, actual_physical: 7.76, actual_financial: null },
          { month: "Apr-26", planned_physical: 57.12, planned_financial: 60.98, actual_physical: 13.34, actual_financial: 6.79 },
          { month: "May-26", planned_physical: 67.77, planned_financial: 66.52, actual_physical: 17.00, actual_financial: null },
          { month: "Jun-26", planned_physical: 74.84, planned_financial: 72.59, actual_physical: 18.84, actual_financial: null },
          { month: "Jul-26", planned_physical: 79.98, planned_financial: 76.90, actual_physical: 19.36, actual_financial: null },
          { month: "Aug-26", planned_physical: 85.12, planned_financial: 80.37, actual_physical: null, actual_financial: null },
          { month: "Sep-26", planned_physical: 91.51, planned_financial: 84.59, actual_physical: null, actual_financial: null },
          { month: "Oct-26", planned_physical: 99.49, planned_financial: 91.73, actual_physical: null, actual_financial: null },
          { month: "Nov-26", planned_physical: 100.00, planned_financial: 98.24, actual_physical: null, actual_financial: null },
          { month: "Dec-26", planned_physical: 100.00, planned_financial: 99.25, actual_physical: null, actual_financial: null },
          { month: "Jan-27", planned_physical: 100.00, planned_financial: 100.00, actual_physical: null, actual_financial: null }
        ];

    const cashCanvas = document.getElementById("cashFlowChart");

    if (cashCanvas) {
      destroyChart(cashCanvas);

      state.cashFlowChart = new Chart(cashCanvas, {
        type: "bar",
        data: {
          labels: cashFlow.map(function (item) {
            return item.month;
          }),
          datasets: [
            {
              label: "Planned Expenditure (M AOA)",
              data: cashFlow.map(function (item) {
                const value = item.planned_m_aoa !== undefined
                  ? item.planned_m_aoa
                  : item.planned_aoa !== undefined && item.planned_aoa !== null
                    ? item.planned_aoa / 1000000
                    : item.planned_cr;

                return value;
              }),
              backgroundColor: cssVar("--color-neutral-light", "#dbe4ea"),
              borderRadius: 6
            },
            {
              label: "Actual Expenditure (M AOA)",
              data: cashFlow.map(function (item) {
                const value = item.actual_m_aoa !== undefined
                  ? item.actual_m_aoa
                  : item.actual_aoa !== undefined && item.actual_aoa !== null
                    ? item.actual_aoa / 1000000
                    : item.actual_cr;

                return value;
              }),
              backgroundColor: cssVar("--color-secondary", "#0f8b8d"),
              borderRadius: 6
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "top",
              align: "end",
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                pointStyle: "circle"
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {

                  const item = cashFlow[context.dataIndex];

                  const isPlanned = context.dataset.label.includes("Planned");

                  const aoa = isPlanned ? item.planned_aoa : item.actual_aoa;

                  const usd = isPlanned ? item.planned_usd : item.actual_usd;

                  return [
                    context.dataset.label,
                    "AOA : " + Number(aoa || 0).toLocaleString(),
                    "USD : " + Number(usd || 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })
                  ];
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function (value) {
                  return Number(value).toLocaleString("en-US", {
                    maximumFractionDigits: 0
                  }) + "M";
                }
              }
            },
            x: {
              grid: {
                display: false
              }
            }
          }
        }
      });
    }

    /* -----------------------------------------------------------
       FIX #4: split into two charts (Physical / Financial), same
       line-chart pattern, colors, legend and tooltip style as the
       original combined chart — just two datasets each instead of
       four datasets on one canvas.
       ----------------------------------------------------------- */

    const sharedLineOptions = {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle"
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            callback: function (value) {
              return value + "%";
            }
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    };

    const physicalCanvas = document.getElementById("physicalProgressChart");

    if (physicalCanvas) {
      destroyChart(physicalCanvas);

      state.physicalProgressChart = new Chart(physicalCanvas, {
        type: "line",
        data: {
          labels: progress.map(function (item) { return item.month; }),
          datasets: [
            {
              label: "Planned Physical %",
              data: progress.map(item => item.planned_physical),
              borderColor: "#2563eb",
              backgroundColor: "transparent",
              borderWidth: 3,
              pointRadius: 3,
              tension: 0.35
            },
            {
              label: "Actual Physical %",
              data: progress.map(item => item.actual_physical),
              borderColor: "#16a34a",
              backgroundColor: "transparent",
              borderWidth: 3,
              pointRadius: 3,
              tension: 0.35
            }
          ]
        },
        options: sharedLineOptions
      });
    }

    const financialCanvas = document.getElementById("financialProgressChart");

    if (financialCanvas) {
      destroyChart(financialCanvas);

      state.financialProgressChart = new Chart(financialCanvas, {
        type: "line",
        data: {
          labels: progress.map(function (item) { return item.month; }),
          datasets: [
            {
              label: "Planned Financial %",
              data: progress.map(item => item.planned_financial),
              borderColor: "#f59e0b",
              backgroundColor: "transparent",
              borderWidth: 3,
              pointRadius: 3,
              borderDash: [6, 4],
              tension: 0.35
            },
            {
              label: "Actual Financial %",
              data: progress.map(item => item.actual_financial),
              borderColor: "#dc2626",
              backgroundColor: "transparent",
              borderWidth: 3,
              pointRadius: 3,
              tension: 0.35
            }
          ]
        },
        options: sharedLineOptions
      });
    }
  }

  /* ---------------------------------------------------------------
     PAYMENT TRACKING  (fully editable, backed by
     PaymentTrackingItem model / payment-tracking.routes.js)
     --------------------------------------------------------------- */

  function ensurePaymentTrackingActions() {
    ensureTableActionsBar(
      "paymentTrackingTable",
      "paymentTrackingActions",
      `
        <button type="button" class="financial-btn financial-btn-primary" id="addPaymentTrackingBtn">
          <i class="fa-solid fa-plus"></i> Add Entry
        </button>
      `
    );

    const addBtn = document.getElementById("addPaymentTrackingBtn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!requireProjectOrToast()) return;
        openPaymentTrackingModal();
      });
    }
  }

  function ensurePaymentTrackingHeader() {
    const table = getTable("paymentTrackingTable");
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    headRow.innerHTML = `
      <th scope="col" class="num">S.No.</th>
      <th scope="col">Description</th>
      <th scope="col" class="num">Amount</th>
      <th scope="col" class="num">Actions</th>
    `;
  }

  function renderPaymentTracking() {
    ensurePaymentTrackingHeader();
    ensurePaymentTrackingActions();

    const tbody = getTableBody("paymentTrackingTable", "paymentTrackingTableBody");
    if (!tbody) return;

    const rows = state.paymentTracking.length ? state.paymentTracking : FALLBACK_PAYMENT_TRACKING;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="financial-empty">No payment tracking entries yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (row, index) {
      const highlighted = Boolean(row.is_highlighted);
      const description = highlighted ? "<strong>" + escapeHtml(row.description || "—") + "</strong>" : escapeHtml(row.description || "—");
      const amountText = formatAoaUsdAmount(row.amount_aoa, row.amount_usd);
      const amount = highlighted ? "<strong>" + escapeHtml(amountText) + "</strong>" : escapeHtml(amountText);
      const canEdit = Boolean(row.id);

      return `
        <tr data-payment-tracking-id="${escapeHtml(row.id || "")}">
          <td class="num">${index + 1}</td>
          <td>${description}</td>
          <td class="num">${amount}</td>
          <td class="num">
            ${renderRowActions(
              canEdit,
              `data-action="edit-payment-tracking" data-id="${escapeHtml(row.id)}"`,
              `data-action="delete-payment-tracking" data-id="${escapeHtml(row.id)}"`
            )}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-action='edit-payment-tracking']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        const item = state.paymentTracking.find(function (row) { return row.id === id; });
        if (item) openPaymentTrackingModal(item);
      });
    });

    tbody.querySelectorAll("[data-action='delete-payment-tracking']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deletePaymentTrackingItem(btn.getAttribute("data-id"));
      });
    });
  }

  function openPaymentTrackingModal(item) {
    if (!requireProjectOrToast()) return;

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field full">
          <label>Description</label>
          <input name="description" required maxlength="200" value="${escapeHtml(item ? item.description || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Amount (AOA)</label>
          <input name="amount_aoa" type="number" step="0.01" value="${escapeHtml(item && item.amount_aoa !== null && item.amount_aoa !== undefined ? item.amount_aoa : "")}">
        </div>

        <div class="financial-field">
          <label>Amount (USD)</label>
          <input name="amount_usd" type="number" step="0.01" value="${escapeHtml(item && item.amount_usd !== null && item.amount_usd !== undefined ? item.amount_usd : "")}">
        </div>

        <div class="financial-field financial-field-checkbox full">
          <input type="checkbox" name="is_highlighted" id="paymentTrackingHighlighted" ${item && item.is_highlighted ? "checked" : ""}>
          <label for="paymentTrackingHighlighted">Show this row in bold (highlighted / key total)</label>
        </div>
      </div>
    `;

    openModal(item ? "Edit Payment Tracking Entry" : "Add Payment Tracking Entry", body, async function (form) {
      const payload = {
        description: String(form.get("description") || "").trim(),
        amount_aoa: form.get("amount_aoa") ? Number(form.get("amount_aoa")) : null,
        amount_usd: form.get("amount_usd") ? Number(form.get("amount_usd")) : null,
        is_highlighted: form.get("is_highlighted") === "on"
      };

      if (item) {
        await request("PUT", "/payment-tracking/" + item.id, payload);
        toast("Payment tracking entry updated successfully");
      } else {
        await request("POST", "/projects/" + state.projectId + "/payment-tracking", payload);
        toast("Payment tracking entry created successfully");
      }
    });
  }

  async function deletePaymentTrackingItem(id) {
    if (!id) return;

    const item = state.paymentTracking.find(function (row) { return row.id === id; });
    if (!item) return;

    const yes = window.confirm('Delete "' + (item.description || "this entry") + '"?');
    if (!yes) return;

    try {
      await request("DELETE", "/payment-tracking/" + id);
      toast("Payment tracking entry deleted successfully", "fa-trash");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Delete failed", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     IPC TRACKER
     --------------------------------------------------------------- */

  function ensureIpcActions() {
    ensureTableActionsBar(
      "ipcTrackerTable",
      "ipcActions",
      `
        <button type="button" class="financial-btn financial-btn-secondary" id="manageBudgetsBtn">
          <i class="fa-solid fa-wallet"></i> Manage Budgets
        </button>
        <button type="button" class="financial-btn financial-btn-primary" id="addIpcBtn">
          <i class="fa-solid fa-plus"></i> Add IPC
        </button>
      `
    );

    const addBtn = document.getElementById("addIpcBtn");
    const budgetBtn = document.getElementById("manageBudgetsBtn");

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!requireProjectOrToast()) return;
        openIpcModal();
      });
    }

    if (budgetBtn) {
      budgetBtn.addEventListener("click", function () {
        openBudgetModal();
      });
    }
  }

  function ensureIpcTableHeader() {
    const table = getTable("ipcTrackerTable");
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    headRow.innerHTML = `
      <th scope="col" class="num">S.No.</th>
      <th scope="col">IPC</th>
      <th scope="col">Period</th>
      <th scope="col" class="num">AOA</th>
      <th scope="col" class="num">USD</th>
      <th scope="col" class="num">%</th>
      <th scope="col">ACE</th>
      <th scope="col">Client</th>
      <th scope="col" class="num">Actions</th>
    `;
  }

  function renderIpcTracker() {
    ensureIpcTableHeader();
    ensureIpcActions();

    const tbody = getTableBody("ipcTrackerTable", "ipcTableBody");
    if (!tbody) return;

    const rows = state.ipcs.length ? state.ipcs : FALLBACK_IPC_TRACKER;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="financial-empty">No IPC records yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (row, index) {
      const isCumulative = Boolean(row.is_cumulative) || String(row.ipc).toLowerCase() === "cumulative";
      const ipcText = isCumulative ? "<strong>" + escapeHtml(row.ipc) + "</strong>" : escapeHtml(row.ipc);
      const aoaText = isCumulative
        ? "<strong>" + escapeHtml(formatAmount(row.aoa_amount, 2)) + "</strong>"
        : escapeHtml(formatAmount(row.aoa_amount, 2));
      const usdText = isCumulative
        ? "<strong>" + escapeHtml(formatAmount(row.usd_amount, 2)) + "</strong>"
        : escapeHtml(formatAmount(row.usd_amount, 2));
      const pctText = isCumulative
        ? "<strong>" + escapeHtml(formatPercent(row.percentage)) + "</strong>"
        : escapeHtml(formatPercent(row.percentage));

      const canEdit = Boolean(row.id);

      return `
        <tr data-ipc-id="${escapeHtml(row.id || "")}">
          <td class="num">${index + 1}</td>
          <td>${ipcText}</td>
          <td>${escapeHtml(row.period || "—")}</td>
          <td class="num">${aoaText}</td>
          <td class="num">${usdText}</td>
          <td class="num">${pctText}</td>
          <td>${renderStatusChip(row.ace_status)}</td>
          <td>${renderStatusChip(row.client_status)}</td>
          <td class="num">
            ${renderRowActions(
              canEdit,
              `data-action="edit-ipc" data-id="${escapeHtml(row.id)}"`,
              `data-action="delete-ipc" data-id="${escapeHtml(row.id)}"`
            )}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-action='edit-ipc']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        const ipc = state.ipcs.find(function (row) { return row.id === id; });
        if (ipc) openIpcModal(ipc);
      });
    });

    tbody.querySelectorAll("[data-action='delete-ipc']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteIpc(btn.getAttribute("data-id"));
      });
    });
  }

  function openIpcModal(ipc) {
    if (!requireProjectOrToast()) return;

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field">
          <label>IPC Number</label>
          <input name="ipc" required maxlength="50" value="${escapeHtml(ipc ? ipc.ipc || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Period</label>
          <input name="period" maxlength="50" placeholder="e.g. Apr 2026" value="${escapeHtml(ipc ? ipc.period || "" : "")}">
        </div>

        <div class="financial-field">
          <label>AOA Amount</label>
          <input name="aoa_amount" type="number" step="0.01" value="${escapeHtml(ipc && ipc.aoa_amount !== null && ipc.aoa_amount !== undefined ? ipc.aoa_amount : "")}">
        </div>

        <div class="financial-field">
          <label>USD Amount</label>
          <input name="usd_amount" type="number" step="0.01" value="${escapeHtml(ipc && ipc.usd_amount !== null && ipc.usd_amount !== undefined ? ipc.usd_amount : "")}">
        </div>

        <div class="financial-field">
          <label>Percentage (%)</label>
          <input name="percentage" type="number" step="0.01" min="0" max="100" value="${escapeHtml(ipc && ipc.percentage !== null && ipc.percentage !== undefined ? ipc.percentage : "")}">
        </div>

        <div class="financial-field">
          <label>IPC Date (optional)</label>
          <input name="ipc_date" type="date" value="${escapeHtml(toInputDate(ipc ? ipc.ipc_date : ""))}">
        </div>

        <div class="financial-field">
          <label>ACE Status</label>
          <input name="ace_status" list="ipcAceStatusOptions" maxlength="50" value="${escapeHtml(ipc ? ipc.ace_status || "" : "")}">
          <datalist id="ipcAceStatusOptions">
            <option value="Certified">
            <option value="Certified 24/06">
            <option value="Future">
          </datalist>
        </div>

        <div class="financial-field">
          <label>Client Status</label>
          <input name="client_status" list="ipcClientStatusOptions" maxlength="50" value="${escapeHtml(ipc ? ipc.client_status || "" : "")}">
          <datalist id="ipcClientStatusOptions">
            <option value="Approved">
            <option value="Submitted">
          </datalist>
        </div>

        <div class="financial-field full">
          <label>Record Status</label>
          <select name="status">
            <option value="pending" ${ipc && ipc.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="certified" ${ipc && ipc.status === "certified" ? "selected" : ""}>Certified</option>
            <option value="submitted" ${ipc && ipc.status === "submitted" ? "selected" : ""}>Submitted</option>
            <option value="approved" ${ipc && ipc.status === "approved" ? "selected" : ""}>Approved</option>
            <option value="paid" ${ipc && ipc.status === "paid" ? "selected" : ""}>Paid</option>
            <option value="rejected" ${ipc && ipc.status === "rejected" ? "selected" : ""}>Rejected</option>
          </select>
        </div>
      </div>
    `;

    openModal(ipc ? "Edit IPC" : "Add IPC", body, async function (form) {
      const payload = {
        ipc: String(form.get("ipc") || "").trim(),
        period: String(form.get("period") || "").trim() || null,
        aoa_amount: form.get("aoa_amount") ? Number(form.get("aoa_amount")) : null,
        usd_amount: form.get("usd_amount") ? Number(form.get("usd_amount")) : null,
        percentage: form.get("percentage") ? Number(form.get("percentage")) : null,
        ipc_date: form.get("ipc_date") ? String(form.get("ipc_date")) : null,
        ace_status: String(form.get("ace_status") || "").trim() || null,
        client_status: String(form.get("client_status") || "").trim() || null,
        status: String(form.get("status") || "pending")
      };

      if (ipc) {
        await request("PUT", "/projects/" + state.projectId + "/ipc-tracker/" + ipc.id, payload);
        toast("IPC updated successfully");
      } else {
        await request("POST", "/projects/" + state.projectId + "/ipc-tracker", payload);
        toast("IPC created successfully");
      }
    });
  }

  async function deleteIpc(id) {
    if (!id) return;

    const ipc = state.ipcs.find(function (row) { return row.id === id; });
    if (!ipc) return;

    const yes = window.confirm("Delete " + (ipc.ipc || "this IPC") + "?");
    if (!yes) return;

    try {
      await request("DELETE", "/ipc-tracker/" + id);
      toast("IPC deleted successfully", "fa-trash");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Delete failed", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     BANK GUARANTEES
     --------------------------------------------------------------- */

  function ensureBankGuaranteesActions() {
    ensureTableActionsBar(
      "bankGuaranteesTable",
      "bankGuaranteesActions",
      `
        <button type="button" class="financial-btn financial-btn-primary" id="addBankGuaranteeBtn">
          <i class="fa-solid fa-plus"></i> Add Guarantee
        </button>
      `
    );

    const addBtn = document.getElementById("addBankGuaranteeBtn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!requireProjectOrToast()) return;
        openBankGuaranteeModal();
      });
    }
  }

  function ensureBankGuaranteesHeader() {
    const table = getTable("bankGuaranteesTable");
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    headRow.innerHTML = `
      <th scope="col" class="num">S.No.</th>
      <th scope="col">Guarantee</th>
      <th scope="col">Bank</th>
      <th scope="col" class="num">USD</th>
      <th scope="col">Valid Until</th>
      <th scope="col">Status</th>
      <th scope="col" class="num">Actions</th>
    `;
  }

  function renderBankGuarantees() {
    ensureBankGuaranteesHeader();
    ensureBankGuaranteesActions();

    const tbody = getTableBody("bankGuaranteesTable", "bankGuaranteesTableBody");
    if (!tbody) return;

    const rows = state.bankGuarantees.length ? state.bankGuarantees : FALLBACK_BANK_GUARANTEES;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="financial-empty">No bank guarantees yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (row, index) {
      const statusText = row.status === "valid"
        ? "Valid"
        : row.status === "expires_soon"
          ? "Expires < 60d · Renew"
          : row.status;

      const canEdit = Boolean(row.id);

      return `
        <tr data-bank-guarantee-id="${escapeHtml(row.id || "")}">
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(row.guarantee || "—")}</td>
          <td>${escapeHtml(row.bank || "—")}</td>
          <td class="num">${escapeHtml(formatAmount(row.usd_amount, 2))}</td>
          <td>${escapeHtml(formatDisplayDate(row.valid_until))}</td>
          <td>${renderStatusChip(statusText || "—")}</td>
          <td class="num">
            ${renderRowActions(
              canEdit,
              `data-action="edit-bank-guarantee" data-id="${escapeHtml(row.id)}"`,
              `data-action="delete-bank-guarantee" data-id="${escapeHtml(row.id)}"`
            )}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-action='edit-bank-guarantee']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        const item = state.bankGuarantees.find(function (row) { return row.id === id; });
        if (item) openBankGuaranteeModal(item);
      });
    });

    tbody.querySelectorAll("[data-action='delete-bank-guarantee']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteBankGuarantee(btn.getAttribute("data-id"));
      });
    });
  }

  function openBankGuaranteeModal(item) {
    if (!requireProjectOrToast()) return;

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field full">
          <label>Guarantee</label>
          <input name="guarantee" required maxlength="200" value="${escapeHtml(item ? item.guarantee || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Bank</label>
          <input name="bank" required maxlength="100" value="${escapeHtml(item ? item.bank || "" : "")}">
        </div>

        <div class="financial-field">
          <label>USD Amount</label>
          <input name="usd_amount" type="number" step="0.01" required value="${escapeHtml(item && item.usd_amount !== null && item.usd_amount !== undefined ? item.usd_amount : "")}">
        </div>

        <div class="financial-field">
          <label>Valid Until</label>
          <input name="valid_until" type="date" value="${escapeHtml(toInputDate(item ? item.valid_until : ""))}">
        </div>

        <div class="financial-field">
          <label>Status</label>
          <input name="status" list="bankGuaranteeStatusOptions" maxlength="50" value="${escapeHtml(item ? item.status || "valid" : "valid")}">
          <datalist id="bankGuaranteeStatusOptions">
            <option value="valid">
            <option value="Valid">
            <option value="expires_soon">
            <option value="Expires < 60d · Renew">
            <option value="expired">
          </datalist>
        </div>
      </div>
    `;

    openModal(item ? "Edit Bank Guarantee" : "Add Bank Guarantee", body, async function (form) {
      const payload = {
        guarantee: String(form.get("guarantee") || "").trim(),
        bank: String(form.get("bank") || "").trim(),
        usd_amount: Number(form.get("usd_amount")),
        valid_until: form.get("valid_until") ? String(form.get("valid_until")) : null,
        status: String(form.get("status") || "valid").trim()
      };

      if (item) {
        await request("PUT", "/bank-guarantees/" + item.id, payload);
        toast("Bank guarantee updated successfully");
      } else {
        await request("POST", "/projects/" + state.projectId + "/bank-guarantees", payload);
        toast("Bank guarantee created successfully");
      }
    });
  }

  async function deleteBankGuarantee(id) {
    if (!id) return;

    const item = state.bankGuarantees.find(function (row) { return row.id === id; });
    if (!item) return;

    const yes = window.confirm('Delete "' + (item.guarantee || "this guarantee") + '"?');
    if (!yes) return;

    try {
      await request("DELETE", "/bank-guarantees/" + id);
      toast("Bank guarantee deleted successfully", "fa-trash");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Delete failed", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     AMENDMENTS (heading renamed to "Amendments" in HTML — ids/wiring
     left unchanged here to avoid unnecessary disruption)
     --------------------------------------------------------------- */

  function ensureAmendmentsActions() {
    ensureTableActionsBar(
      "addendaAmendmentsTable",
      "amendmentsActions",
      `
        <button type="button" class="financial-btn financial-btn-primary" id="addAmendmentBtn">
          <i class="fa-solid fa-plus"></i> Add Amendment
        </button>
      `
    );

    const addBtn = document.getElementById("addAmendmentBtn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        if (!requireProjectOrToast()) return;
        openAmendmentModal();
      });
    }
  }

  function ensureAmendmentsHeader() {
    const table = getTable("addendaAmendmentsTable");
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    headRow.innerHTML = `
      <th scope="col" class="num">S.No.</th>
      <th scope="col">Addendum</th>
      <th scope="col">Date</th>
      <th scope="col">Scope</th>
      <th scope="col">Status</th>
      <th scope="col" class="num">Actions</th>
    `;
  }

  function renderAmendments() {
    ensureAmendmentsHeader();
    ensureAmendmentsActions();

    const tbody = getTableBody("addendaAmendmentsTable", "addendaAmendmentsTableBody");
    if (!tbody) return;

    const rows = state.amendments.length ? state.amendments : FALLBACK_AMENDMENTS;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="financial-empty">No amendments yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (row, index) {
      const statusText = row.status === "under_employer_review"
        ? "Under Employer review"
        : row.status === "pending_ctce"
          ? "Pending CTCE"
          : row.status;

      const canEdit = Boolean(row.id);

      return `
        <tr data-amendment-id="${escapeHtml(row.id || "")}">
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(row.amendment || "—")}</td>
          <td>${escapeHtml(formatDisplayDate(row.amendment_date))}</td>
          <td>${escapeHtml(row.scope || row.subject || "—")}</td>
          <td>${renderStatusChip(statusText || "—")}</td>
          <td class="num">
            ${renderRowActions(
              canEdit,
              `data-action="edit-amendment" data-id="${escapeHtml(row.id)}"`,
              `data-action="delete-amendment" data-id="${escapeHtml(row.id)}"`
            )}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-action='edit-amendment']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        const item = state.amendments.find(function (row) { return row.id === id; });
        if (item) openAmendmentModal(item);
      });
    });

    tbody.querySelectorAll("[data-action='delete-amendment']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteAmendment(btn.getAttribute("data-id"));
      });
    });
  }

  function openAmendmentModal(item) {
    if (!requireProjectOrToast()) return;

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field">
          <label>Amendment</label>
          <input name="amendment" required maxlength="100" value="${escapeHtml(item ? item.amendment || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Date (leave blank if drafting / not yet dated)</label>
          <input name="amendment_date" type="date" value="${escapeHtml(toInputDate(item ? item.amendment_date : ""))}">
        </div>

        <div class="financial-field full">
          <label>Subject (optional)</label>
          <input name="subject" maxlength="200" value="${escapeHtml(item ? item.subject || "" : "")}">
        </div>

        <div class="financial-field full">
          <label>Scope</label>
          <textarea name="scope" rows="3">${escapeHtml(item ? item.scope || "" : "")}</textarea>
        </div>

        <div class="financial-field full">
          <label>Status</label>
          <input name="status" list="amendmentStatusOptions" maxlength="50" value="${escapeHtml(item ? item.status || "" : "")}">
          <datalist id="amendmentStatusOptions">
            <option value="Record pending">
            <option value="Under Employer review">
            <option value="Pending CTCE">
            <option value="approved">
            <option value="rejected">
          </datalist>
        </div>
      </div>
    `;

    openModal(item ? "Edit Amendment" : "Add Amendment", body, async function (form) {
      const payload = {
        amendment: String(form.get("amendment") || "").trim(),
        amendment_date: form.get("amendment_date") ? String(form.get("amendment_date")) : null,
        subject: String(form.get("subject") || "").trim() || null,
        scope: String(form.get("scope") || "").trim() || null,
        status: String(form.get("status") || "pending").trim()
      };

      if (item) {
        await request("PUT", "/amendments/" + item.id, payload);
        toast("Amendment updated successfully");
      } else {
        await request("POST", "/projects/" + state.projectId + "/amendments", payload);
        toast("Amendment created successfully");
      }
    });
  }

  async function deleteAmendment(id) {
    if (!id) return;

    const item = state.amendments.find(function (row) { return row.id === id; });
    if (!item) return;

    const yes = window.confirm('Delete "' + (item.amendment || "this amendment") + '"?');
    if (!yes) return;

    try {
      await request("DELETE", "/amendments/" + id);
      toast("Amendment deleted successfully", "fa-trash");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Delete failed", "fa-triangle-exclamation");
    }
  }

  /* ---------------------------------------------------------------
     Data loaders
     --------------------------------------------------------------- */

  async function loadSummary() {
    const result = await request("GET", "/projects/" + state.projectId + "/financial-summary");
    state.summary = result.data || {};
  }

  async function loadBudgets() {
    const result = await request(
      "GET",
      "/projects/" + state.projectId + "/budgets?limit=100&sort=fiscal_year"
    );

    state.budgets = Array.isArray(result.data) ? result.data : [];
  }

  async function loadIpcTracker() {
    const result = await request("GET", "/projects/" + state.projectId + "/ipc-tracker");
    state.ipcs = Array.isArray(result.data) ? result.data : [];
  }

  async function loadAmendments() {
    const result = await request("GET", "/projects/" + state.projectId + "/amendments");
    state.amendments = Array.isArray(result.data) ? result.data : [];
  }

  async function loadBankGuarantees() {
    const result = await request("GET", "/projects/" + state.projectId + "/bank-guarantees");
    state.bankGuarantees = Array.isArray(result.data) ? result.data : [];
  }

  async function loadPaymentTracking() {
    const result = await request("GET", "/projects/" + state.projectId + "/payment-tracking");
    state.paymentTracking = Array.isArray(result.data) ? result.data : [];
  }

  /* -----------------------------------------------------------------
     FIX #5: Promise.allSettled instead of Promise.all.
     Previously, if ANY single loader rejected (e.g. one table's
     migration hadn't been applied yet, or a transient 500), the whole
     Promise.all rejected and init()'s catch block reverted the ENTIRE
     dashboard to fallback/hardcoded values — even sections whose data
     had already loaded successfully. Now each loader's success/failure
     is handled independently: whichever succeeded keeps its real data,
     whichever failed is reported via toast/console but doesn't wipe
     out the rest of the dashboard.
     ----------------------------------------------------------------- */
  async function reloadAll() {
    const loaders = [
      { name: "Budgets", fn: loadBudgets },
      { name: "IPC Tracker", fn: loadIpcTracker },
      { name: "Amendments", fn: loadAmendments },
      { name: "Bank Guarantees", fn: loadBankGuarantees },
      { name: "Payment Tracking", fn: loadPaymentTracking },
      { name: "Financial Summary", fn: loadSummary }
    ];

    const results = await Promise.allSettled(loaders.map((loader) => loader.fn()));

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const name = loaders[index].name;
        console.error("Failed to load " + name + ":", result.reason);
        toast(
          name + " could not be refreshed — showing last known data.",
          "fa-triangle-exclamation"
        );
      }
    });

    renderSummary();
    renderCharts();
    renderPaymentTracking();
    renderIpcTracker();
    renderBankGuarantees();
    renderAmendments();
  }

  /* ---------------------------------------------------------------
     Shared modal shell
     --------------------------------------------------------------- */

  function closeModal() {
    const modal = document.querySelector(".financial-modal-backdrop");
    if (modal) {
      modal.remove();
    }

    state.activeInvoice = null;
    state.activeBudget = null;
  }

  function openModal(title, bodyHtml, onSubmit) {
    closeModal();

    const backdrop = document.createElement("div");
    backdrop.className = "financial-modal-backdrop";
    backdrop.innerHTML = `
      <div class="financial-modal" role="dialog" aria-modal="true">
        <form id="financialModalForm">
          <div class="financial-modal__head">
            <h3>${escapeHtml(title)}</h3>
            <button type="button" class="financial-icon-btn" id="financialModalClose">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="financial-modal__body">
            ${bodyHtml}
          </div>

          <div class="financial-modal__foot">
            <span></span>
            <div class="financial-modal__foot-right">
              <button type="button" class="financial-btn financial-btn-secondary" id="financialModalCancel">
                Cancel
              </button>
              <button type="submit" class="financial-btn financial-btn-primary">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeBtn = document.getElementById("financialModalClose");
    const cancelBtn = document.getElementById("financialModalCancel");
    const form = document.getElementById("financialModalForm");

    if (closeBtn) {
      closeBtn.addEventListener("click", closeModal);
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", closeModal);
    }

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) {
        closeModal();
      }
    });

    if (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();

        try {
          await onSubmit(new FormData(form));
          closeModal();
          await reloadAll();
        } catch (err) {
          toast(err.message || "Save failed", "fa-triangle-exclamation");
        }
      });
    }
  }

  /* ---------------------------------------------------------------
     Budget management (UNCHANGED - separate from the visible tables)
     --------------------------------------------------------------- */

  function openBudgetModal(budget) {
    state.activeBudget = budget || null;

    const existingBudgetRows = state.budgets.length
      ? `
        <div class="financial-field full">
          <label>Existing Budgets</label>
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>FY</th>
                  <th class="num">Allocated</th>
                  <th class="num">Utilized</th>
                  <th class="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${state.budgets.map(function (item) {
                  return `
                    <tr>
                      <td>${escapeHtml(item.category)}</td>
                      <td>${escapeHtml(item.fiscal_year || item.fiscalYear || "")}</td>
                      <td class="num">${escapeHtml(formatAmount(item.allocated_amount || item.allocatedAmount, 2))}</td>
                      <td class="num">${escapeHtml(formatAmount(item.utilized_amount || item.utilizedAmount || 0, 2))}</td>
                      <td class="num">
                        <button type="button" class="financial-icon-btn" data-budget-edit="${escapeHtml(item.id)}" title="Edit Budget">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="financial-icon-btn danger" data-budget-delete="${escapeHtml(item.id)}" title="Delete Budget">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `
      : "";

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field">
          <label>Category</label>
          <input name="category" required maxlength="100" value="${escapeHtml(budget ? budget.category || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Fiscal Year</label>
          <input name="fiscal_year" type="number" min="2000" max="2100" required value="${escapeHtml(budget ? budget.fiscal_year || budget.fiscalYear || new Date().getFullYear() : new Date().getFullYear())}">
        </div>

        <div class="financial-field">
          <label>Allocated Amount</label>
          <input name="allocated_amount" type="number" min="0.01" step="0.01" required value="${escapeHtml(budget ? budget.allocated_amount || budget.allocatedAmount || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Currency</label>
          <input name="currency" maxlength="3" required value="${escapeHtml(budget ? budget.currency || "AOA" : "AOA")}">
        </div>

        <div class="financial-field full">
          <label>Notes</label>
          <textarea name="notes" rows="3">${escapeHtml(budget ? budget.notes || "" : "")}</textarea>
        </div>

        ${existingBudgetRows}
      </div>
    `;

    openModal(budget ? "Edit Budget" : "Manage Budgets", body, async function (form) {
      const payload = {
        category: String(form.get("category") || "").trim(),
        fiscal_year: Number(form.get("fiscal_year")),
        allocated_amount: Number(form.get("allocated_amount")),
        currency: String(form.get("currency") || "AOA").trim().toUpperCase(),
        notes: String(form.get("notes") || "").trim() || undefined
      };

      if (budget) {
        await request("PUT", "/budgets/" + budget.id, payload);
        toast("Budget updated successfully");
      } else {
        await request("POST", "/projects/" + state.projectId + "/budgets", payload);
        toast("Budget created successfully");
      }
    });

    document.querySelectorAll("[data-budget-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-budget-edit");
        const selected = state.budgets.find(function (item) {
          return item.id === id;
        });

        closeModal();
        openBudgetModal(selected);
      });
    });

    document.querySelectorAll("[data-budget-delete]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const id = btn.getAttribute("data-budget-delete");
        const item = state.budgets.find(function (budgetItem) {
          return budgetItem.id === id;
        });

        if (!item) return;

        const yes = window.confirm('Delete budget "' + item.category + '"?');
        if (!yes) return;

        try {
          await request("DELETE", "/budgets/" + id);
          toast("Budget deleted successfully", "fa-trash");
          closeModal();
          await reloadAll();
          openBudgetModal();
        } catch (err) {
          toast(err.message || "Budget delete failed", "fa-triangle-exclamation");
        }
      });
    });
  }

  /* ---------------------------------------------------------------
     Init
     --------------------------------------------------------------- */

  function renderFallbackOnly() {
    renderSummary();
    renderCharts();
    renderPaymentTracking();
    renderIpcTracker();
    renderBankGuarantees();
    renderAmendments();
  }

  async function init() {
    injectStyles();

    renderFallbackOnly();

    const sessionOk = await ensureSession();

    if (!sessionOk) {
      return;
    }

    state.projectId = getProjectId();

    if (!state.projectId) {
      toast(
        "Project is missing. Set current_project in localStorage before using Financial Dashboard.",
        "fa-triangle-exclamation"
      );
      return;
    }

    try {
      await reloadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to load financial dashboard", "fa-triangle-exclamation");
      renderFallbackOnly();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
