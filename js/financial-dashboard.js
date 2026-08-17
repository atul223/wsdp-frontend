/* ============================================================
   financial-dashboard.js
   Financial Dashboard page script

   Keeps existing website theme, layout, colors and API wrapper.
   Supports:
   - Existing financial summary cards
   - Added reference financial cards
   - Cash Flow chart
   - Financial vs Physical chart
   - IPC Tracker table
   - Bank Guarantees table
   - Addenda / Amendments table
   - Existing Budget and IPC/Invoice CRUD using current backend

   Load order required:
   api.js, shell.js, main.js, Chart.js, then this file.
   ============================================================ */

(function () {
  "use strict";

  const state = {
    projectId: null,
    budgets: [],
    invoices: [],
    summary: null,
    cashFlowChart: null,
    finPhysChart: null,
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

  const FALLBACK_REFERENCE_CARDS = {
    total_contract_m_aoa: 3625.58,
    total_contract_m_usd: 5.60,
    advance_payment_20_m_aoa: 725.12,
    advance_payment_20_m_usd: 1.12,
    contract_balance_m_aoa: 2974.58,
    contract_balance_m_usd: 4.59,
    prov_sum_50_m_aoa: 1.94,
    prov_sum_50_m_usd: 0.003
  };

  const FALLBACK_IPC_TRACKER = [
    {
      ipc: "IPC-01",
      period: "Feb 2026",
      aoa_amount: 404659374.56,
      usd_amount: 624995.17,
      percentage: 11.16,
      ace_status: "Certified",
      client_status: "Approved"
    },
    {
      ipc: "IPC-02",
      period: "Apr 2026",
      aoa_amount: 246340149.83,
      usd_amount: 380471.61,
      percentage: 6.79,
      ace_status: "Certified 24/06",
      client_status: "Submitted"
    },
    {
      ipc: "Cumulative",
      period: "—",
      aoa_amount: 650999524.39,
      usd_amount: 1005466.78,
      percentage: 17.96,
      ace_status: "—",
      client_status: "—",
      is_cumulative: true
    },
    {
      ipc: "IPC-03",
      period: "—",
      aoa_amount: null,
      usd_amount: null,
      percentage: null,
      ace_status: "Future",
      client_status: "—"
    }
  ];

  const FALLBACK_PAYMENT_TRACKING = [
    {
      description: "Contract Value",
      amount: 3625580000.00,
      amount_display: "3,625,580,000.00 AOA / 5,599,704.50 USD"
    },
    {
      description: "Amount Invoiced",
      amount: 650999524.39,
      amount_display: "650,999,524.39 AOA / 1,005,466.78 USD"
    },
    {
      description: "Amount Paid",
      amount: 404659374.56,
      amount_display: "404,659,374.56 AOA / 624,995.17 USD"
    },
    {
      description: "Outstanding",
      amount: 246340149.83,
      amount_display: "246,340,149.83 AOA / 380,471.61 USD"
    }
  ];

  const FALLBACK_BANK_GUARANTEES = [
    {
      guarantee: "Advance Payment Guarantees (APG)",
      bank: "Bank of China",
      usd_amount: 1119940.90,
      valid_until: "2026-08-23",
      status: "Expires < 60d · Renew"
    },
    {
      guarantee: "Performance Security (PG)",
      bank: "Bank of China",
      usd_amount: 559970.45,
      valid_until: "2026-12-31",
      status: "Valid"
    }
  ];

  const FALLBACK_AMENDMENTS = [
    {
      amendment: "Amendment No. 01",
      amendment_date: "—",
      scope: "Initial amendment record to be updated from contract file",
      status: "Record pending"
    },
    {
      amendment: "Amendment No. 02",
      amendment_date: "—",
      scope: "Second amendment record to be updated from contract file",
      status: "Record pending"
    },
    {
      amendment: "Amendment No. 03",
      amendment_date: "—",
      scope: "Third amendment record to be updated from contract file",
      status: "Record pending"
    },
    {
      amendment: "Amendment No. 04",
      amendment_date: "2026-05-07",
      scope: "Revised DDR scope: 92.677 km / 5,303 HSC (USD 6,044,736.58)",
      status: "Under Employer review"
    },
    {
      amendment: "Amendment No. 05",
      amendment_date: "Drafting",
      scope: "EOT + Price Adjustment",
      status: "Pending CTCE"
    }
  ];

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
      .replace(/'/g, "&#039;");
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
    return formatAmount(aoa, 2) + " AOA / " + formatAmount(usd, 2) + " USD";
  }

  function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "—";

    const n = Number(value);
    if (Number.isNaN(n)) return String(value);

    return n.toFixed(2) + "%";
  }

  function moneyCr(value) {
    const n = toNumber(value);
    return (n / 10000000).toFixed(1);
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

      .financial-modal__foot {
        padding: 16px 20px;
        border-top: 1px solid var(--border-color, #e3e7eb);
        display: flex;
        justify-content: flex-end;
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

  function getIpcTable() {
    return (
      document.getElementById("ipcTrackerTable") ||
      document.querySelector(".data-table")
    );
  }

  function getIpcTableBody() {
    const table = getIpcTable();
    if (!table) return null;

    let tbody = table.querySelector("tbody");

    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    tbody.id = "ipcTableBody";
    return tbody;
  }

  function ensureActions() {
    const table = getIpcTable();
    if (!table) return;

    const tableCard = table.closest(".card");
    if (!tableCard) return;

    if (document.getElementById("financialActions")) return;

    const cardBody = tableCard.querySelector(".card-body");
    if (!cardBody) return;

    const actions = document.createElement("div");
    actions.className = "financial-actions";
    actions.id = "financialActions";
    actions.innerHTML = `
      <button type="button" class="financial-btn financial-btn-secondary" id="manageBudgetsBtn">
        <i class="fa-solid fa-wallet"></i> Manage Budgets
      </button>
      <button type="button" class="financial-btn financial-btn-primary" id="addInvoiceBtn">
        <i class="fa-solid fa-plus"></i> Add IPC
      </button>
    `;

    cardBody.insertBefore(actions, cardBody.firstChild);

    const addBtn = document.getElementById("addInvoiceBtn");
    const budgetBtn = document.getElementById("manageBudgetsBtn");

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        openInvoiceModal();
      });
    }

    if (budgetBtn) {
      budgetBtn.addEventListener("click", function () {
        openBudgetModal();
      });
    }
  }

  function ensureIpcTableHeader() {
    const table = getIpcTable();
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    headRow.innerHTML = `
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

  function renderReferenceCards() {
    const ref = (state.summary && state.summary.reference_cards) || FALLBACK_REFERENCE_CARDS;

    setCardValue(
      "Total Contract",
      formatMoneyPair(
        ref.total_contract_m_aoa || FALLBACK_REFERENCE_CARDS.total_contract_m_aoa,
        ref.total_contract_m_usd || FALLBACK_REFERENCE_CARDS.total_contract_m_usd
      )
    );
    setCardDelta("Total Contract", "Contract value in AOA and USD");

    setCardValue(
      "Advance Payment 20%",
      formatMoneyPair(
        ref.advance_payment_20_m_aoa || FALLBACK_REFERENCE_CARDS.advance_payment_20_m_aoa,
        ref.advance_payment_20_m_usd || FALLBACK_REFERENCE_CARDS.advance_payment_20_m_usd
      )
    );
    setCardDelta("Advance Payment 20%", "Advance payment disbursed");

    setCardValue(
      "Contract Balance",
      formatMoneyPair(
        ref.contract_balance_m_aoa || FALLBACK_REFERENCE_CARDS.contract_balance_m_aoa,
        ref.contract_balance_m_usd || FALLBACK_REFERENCE_CARDS.contract_balance_m_usd
      )
    );
    setCardDelta("Contract Balance", "Remaining contract balance");

    const provCard = findKpiCard("DAAB Prov. Sum (50%)");
    if (provCard) {
      const labelEl = provCard.querySelector(".kpi-card__label");
      if (labelEl) {
        labelEl.textContent = "Prov. Sum (50%)";
      }
    }

    setCardValue(
      "Prov. Sum (50%)",
      formatMoneyPair(
        ref.prov_sum_50_m_aoa ||
          ref.daab_prov_sum_50_m_aoa ||
          FALLBACK_REFERENCE_CARDS.prov_sum_50_m_aoa,
        ref.prov_sum_50_m_usd ||
          FALLBACK_REFERENCE_CARDS.prov_sum_50_m_usd
      )
    );
    setCardDelta("Prov. Sum (50%)", "Verified in IPC-02");
  }

  function renderSummary() {
    const s = state.summary || {};

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
    setCardDelta("Financial Progress", "Cumulative IPC invoiced");

    setCountValue("Physical Progress", physicalProgress, 1);

    setCardDelta(
      "Physical Progress",
      physicalProgress >= financialProgress
        ? "Physical ahead of financial by " + (physicalProgress - financialProgress).toFixed(2) + "pp"
        : "Physical behind financial by " + (financialProgress - physicalProgress).toFixed(2) + "pp"
    );

    setCardValue(
      "Cumulative Expenditure",
      '<span>651.00</span><span class="unit">M AOA</span><div class="kpi-card__subvalue">USD 1.01M</div>'
    );
    setCardDelta("Cumulative Expenditure", "of USD 5.60M contract value");

    setCardValue("IPC Status", "IPC-02");
    setCardDelta("IPC Status", "IPC-01 Approved · IPC-02 Submitted");

    renderReferenceCards();
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
          {
            month: "Jul-25",
            planned_aoa: 190564875,
            actual_aoa: 0,
            planned_usd: 294326.87,
            actual_usd: 0
          },
          {
            month: "Aug-25",
            planned_aoa: 520207699,
            actual_aoa: 0,
            planned_usd: 803459.21,
            actual_usd: 0
          },
          {
            month: "Sep-25",
            planned_aoa: 634474730,
            actual_aoa: 0,
            planned_usd: 979944.29,
            actual_usd: 0
          },
          {
            month: "Oct-25",
            planned_aoa: 996854897,
            actual_aoa: 0,
            planned_usd: 1539639.36,
            actual_usd: 0
          },
          {
            month: "Nov-25",
            planned_aoa: 1303737674,
            actual_aoa: 0,
            planned_usd: 2013618.87,
            actual_usd: 0
          },
          {
            month: "Dec-25",
            planned_aoa: 1471077741,
            actual_aoa: 0,
            planned_usd: 2272075.09,
            actual_usd: 0
          },
          {
            month: "Jan-26",
            planned_aoa: 1735527031,
            actual_aoa: 0,
            planned_usd: 2680516.22,
            actual_usd: 0
          },
          {
            month: "Feb-26",
            planned_aoa: 1989719500,
            actual_aoa: 404659374.56,
            planned_usd: 3073115.71,
            actual_usd: 624995.17
          },
          {
            month: "Mar-26",
            planned_aoa: 2172459717,
            actual_aoa: 0,
            planned_usd: 3355357.42,
            actual_usd: 0
          },
          {
            month: "Apr-26",
            planned_aoa: 2386592468,
            actual_aoa: 246340149.83,
            planned_usd: 3686084.81,
            actual_usd: 380471.61
          },
          {
            month: "May-26",
            planned_aoa: 2603568555,
            actual_aoa: 0,
            planned_usd: 4021203.71,
            actual_usd: 0
          },
          {
            month: "Jun-26",
            planned_aoa: 2840961686,
            actual_aoa: 0,
            planned_usd: 4387856.68,
            actual_usd: 0
          },
          {
            month: "Jul-26",
            planned_aoa: 3009788627,
            actual_aoa: 0,
            planned_usd: 4648609.38,
            actual_usd: 0
          },
          {
            month: "Aug-26",
            planned_aoa: 3145635027,
            actual_aoa: 0,
            planned_usd: 4858423.73,
            actual_usd: 0
          },
          {
            month: "Sep-26",
            planned_aoa: 3310810621,
            actual_aoa: 0,
            planned_usd: 5113536.93,
            actual_usd: 0
          },
          {
            month: "Oct-26",
            planned_aoa: 3589866845,
            actual_aoa: 0,
            planned_usd: 5544538.42,
            actual_usd: 0
          },
          {
            month: "Nov-26",
            planned_aoa: 3845037672,
            actual_aoa: 0,
            planned_usd: 5938648.99,
            actual_usd: 0
          },
          {
            month: "Dec-26",
            planned_aoa: 3884384440,
            actual_aoa: 0,
            planned_usd: null,
            actual_usd: null
          },
          {
            month: "Jan-27",
            planned_aoa: 3913725148,
            actual_aoa: 0,
            planned_usd: null,
            actual_usd: null
          }
        ];

    const progress = Array.isArray(summary.financial_vs_physical) && summary.financial_vs_physical.length
      ? summary.financial_vs_physical
      : [
          {
            month: "Jul-25",
            planned_physical: 1.47,
            planned_financial: 4.87,
            actual_physical: 0,
            actual_financial: 0
          },
          {
            month: "Aug-25",
            planned_physical: 3.30,
            planned_financial: 13.29,
            actual_physical: 0,
            actual_financial: 0
          },
          {
            month: "Sep-25",
            planned_physical: 5.06,
            planned_financial: 16.21,
            actual_physical: 0,
            actual_financial: 0
          },
          {
            month: "Oct-25",
            planned_physical: 6.70,
            planned_financial: 25.47,
            actual_physical: 0,
            actual_financial: 0
          },
          {
            month: "Nov-25",
            planned_physical: 11.52,
            planned_financial: 33.31,
            actual_physical: 0,
            actual_financial: 0
          },
          {
            month: "Dec-25",
            planned_physical: 20.19,
            planned_financial: 37.59,
            actual_physical: 0,
            actual_financial: 0
          },
          {
            month: "Jan-26",
            planned_physical: 27.88,
            planned_financial: 44.34,
            actual_physical: 1.61,
            actual_financial: 0
          },
          {
            month: "Feb-26",
            planned_physical: 37.20,
            planned_financial: 50.84,
            actual_physical: 4.74,
            actual_financial: 11.16
          },
          {
            month: "Mar-26",
            planned_physical: 47.73,
            planned_financial: 55.51,
            actual_physical: 7.76,
            actual_financial: null
          },
          {
            month: "Apr-26",
            planned_physical: 57.12,
            planned_financial: 60.98,
            actual_physical: 13.34,
            actual_financial: 6.79
          },
          {
            month: "May-26",
            planned_physical: 67.77,
            planned_financial: 66.52,
            actual_physical: 17.00,
            actual_financial: null
          },
          {
            month: "Jun-26",
            planned_physical: 74.84,
            planned_financial: 72.59,
            actual_physical: 18.84,
            actual_financial: null
          },
          {
            month: "Jul-26",
            planned_physical: 79.98,
            planned_financial: 76.90,
            actual_physical: 19.36,
            actual_financial: null
          },
          {
            month: "Aug-26",
            planned_physical: 85.12,
            planned_financial: 80.37,
            actual_physical: null,
            actual_financial: null
          },
          {
            month: "Sep-26",
            planned_physical: 91.51,
            planned_financial: 84.59,
            actual_physical: null,
            actual_financial: null
          },
          {
            month: "Oct-26",
            planned_physical: 99.49,
            planned_financial: 91.73,
            actual_physical: null,
            actual_financial: null
          },
          {
            month: "Nov-26",
            planned_physical: 100.00,
            planned_financial: 98.24,
            actual_physical: null,
            actual_financial: null
          },
          {
            month: "Dec-26",
            planned_physical: 100.00,
            planned_financial: 99.25,
            actual_physical: null,
            actual_financial: null
          },
          {
            month: "Jan-27",
            planned_physical: 100.00,
            planned_financial: 100.00,
            actual_physical: null,
            actual_financial: null
          }
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

                  const item =
                    cashFlow[context.dataIndex];

                  const isPlanned =
                    context.dataset.label.includes("Planned");

                  const aoa =
                    isPlanned
                      ? item.planned_aoa
                      : item.actual_aoa;

                  const usd =
                    isPlanned
                      ? item.planned_usd
                      : item.actual_usd;

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

    const finPhysCanvas = document.getElementById("finPhysChart");

    if (finPhysCanvas) {
      destroyChart(finPhysCanvas);

      state.finPhysChart = new Chart(finPhysCanvas, {
        type: "line",
        data: {
          labels: progress.map(function (item) {
            return item.month;
          }),
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
            },
            {
              label: "Planned Financial %",
              data: progress.map(item => item.planned_financial),
              borderColor: "#f59e0b",
              backgroundColor: "transparent",
              borderWidth: 3,
              pointRadius: 3,
              borderDash: [6,4],
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
        }
      });
    }
  }

  function mapInvoiceToIpcRow(invoice) {
    const status = invoice.status || "pending";
    const statusLabel = STATUS_LABELS[status] || status;
    const statusClass = STATUS_CLASS[status] || "warn";

    return {
      id: invoice.id,
      ipc: invoice.invoice_number || invoice.invoiceNumber || "IPC",
      period: invoice.vendor_name || invoice.vendorName || (invoice.budget && invoice.budget.category) || "—",
      aoa_amount: invoice.amount,
      usd_amount: null,
      percentage: null,
      ace_status: statusLabel,
      ace_class: statusClass,
      client_status: status === "paid" || status === "approved" ? "Approved" : "—",
      client_class: status === "paid" || status === "approved" ? "ok" : ""
    };
  }

  function renderIpcTracker() {
    ensureIpcTableHeader();

    const tbody = getIpcTableBody();
    if (!tbody) return;

    let rows = [];

    if (state.invoices.length) {
      rows = state.invoices.map(mapInvoiceToIpcRow);
    } else if (state.summary && Array.isArray(state.summary.ipc_tracker) && state.summary.ipc_tracker.length) {
      rows = state.summary.ipc_tracker;
    } else {
      rows = FALLBACK_IPC_TRACKER;
    }

    tbody.innerHTML = rows.map(function (row) {
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
          <td>${ipcText}</td>
          <td>${escapeHtml(row.period || "—")}</td>
          <td class="num">${aoaText}</td>
          <td class="num">${usdText}</td>
          <td class="num">${pctText}</td>
          <td>${renderStatusChip(row.ace_status, row.ace_class)}</td>
          <td>${renderStatusChip(row.client_status, row.client_class)}</td>
          <td class="num">
            ${
              canEdit
                ? `
                  <div class="financial-row-actions">
                    <button type="button" class="financial-icon-btn" data-action="edit-invoice" data-id="${escapeHtml(row.id)}" title="Edit IPC">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="financial-icon-btn danger" data-action="delete-invoice" data-id="${escapeHtml(row.id)}" title="Delete IPC">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                `
                : "—"
            }
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-action='edit-invoice']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        const invoice = state.invoices.find(function (item) {
          return item.id === id;
        });

        if (invoice) {
          openInvoiceModal(invoice);
        }
      });
    });

    tbody.querySelectorAll("[data-action='delete-invoice']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteInvoice(btn.getAttribute("data-id"));
      });
    });
  }

  function renderPaymentTracking() {
    const table = document.getElementById("paymentTrackingTable");
    if (!table) return;

    let tbody = document.getElementById("paymentTrackingTableBody");

    if (!tbody) {
        tbody = table.querySelector("tbody");

        if (!tbody) {
            tbody = document.createElement("tbody");
            tbody.id = "paymentTrackingTableBody";
            table.appendChild(tbody);
        }
    }

    const rows =
        state.summary &&
        Array.isArray(state.summary.payment_tracking) &&
        state.summary.payment_tracking.length
            ? state.summary.payment_tracking
            : FALLBACK_PAYMENT_TRACKING;

    tbody.innerHTML = rows
        .map(function (row) {
            const description =
                row.description ||
                row.label ||
                row.name ||
                "—";

            const rawAmount =
                row.amount !== undefined && row.amount !== null
                    ? row.amount
                    : row.aoa_amount !== undefined && row.aoa_amount !== null
                        ? row.aoa_amount
                        : row.value;

            const amountText =
                row.amount_display ||
                row.display_amount ||
                (
                    rawAmount !== undefined && rawAmount !== null && rawAmount !== ""
                        ? formatAmount(rawAmount, 2) + " AOA"
                        : "—"
                );

            const isImportant =
                String(description).toLowerCase() === "contract value" ||
                String(description).toLowerCase() === "outstanding";

            return `
                <tr>
                    <td>${isImportant ? "<strong>" + escapeHtml(description) + "</strong>" : escapeHtml(description)}</td>
                    <td class="num">${isImportant ? "<strong>" + escapeHtml(amountText) + "</strong>" : escapeHtml(amountText)}</td>
                </tr>
            `;
        })
        .join("");
  }

  function renderBankGuarantees() {
    const table = document.getElementById("bankGuaranteesTable");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const rows = state.summary && Array.isArray(state.summary.bank_guarantees) && state.summary.bank_guarantees.length
      ? state.summary.bank_guarantees
      : FALLBACK_BANK_GUARANTEES;

    tbody.innerHTML = rows.map(function (row) {
      const statusText = row.status === "valid"
        ? "Valid"
        : row.status === "expires_soon"
          ? "Expires < 60d · Renew"
          : row.status;

      return `
        <tr>
          <td>${escapeHtml(row.guarantee || "—")}</td>
          <td>${escapeHtml(row.bank || "—")}</td>
          <td class="num">${escapeHtml(formatAmount(row.usd_amount, 2))}</td>
          <td>${escapeHtml(formatDisplayDate(row.valid_until))}</td>
          <td>${renderStatusChip(statusText || "—")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderAmendments() {
    const table = document.getElementById("addendaAmendmentsTable");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const rows = state.summary && Array.isArray(state.summary.amendments) && state.summary.amendments.length
      ? state.summary.amendments
      : FALLBACK_AMENDMENTS;

    tbody.innerHTML = rows.map(function (row) {
      const statusText = row.status === "under_employer_review"
        ? "Under Employer review"
        : row.status === "pending_ctce"
          ? "Pending CTCE"
          : row.status;

      return `
        <tr>
          <td>${escapeHtml(row.amendment || "—")}</td>
          <td>${escapeHtml(formatDisplayDate(row.amendment_date))}</td>
          <td>${escapeHtml(row.scope || row.subject || "—")}</td>
          <td>${renderStatusChip(statusText || "—")}</td>
        </tr>
      `;
    }).join("");
  }

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

  async function loadInvoices() {
    const all = [];

    for (const budget of state.budgets) {
      const result = await request(
        "GET",
        "/budgets/" + budget.id + "/invoices?limit=100&sort=invoiceDate"
      );

      const rows = Array.isArray(result.data) ? result.data : [];

      rows.forEach(function (invoice) {
        invoice.budget = budget;
        all.push(invoice);
      });
    }

    state.invoices = all;
  }

  async function reloadAll() {
    await loadBudgets();
    await Promise.all([
      loadInvoices(),
      loadSummary()
    ]);

    renderSummary();
    renderCharts();
    renderIpcTracker();
    renderPaymentTracking();
    renderBankGuarantees();
    renderAmendments();
  }

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
            <button type="button" class="financial-btn financial-btn-secondary" id="financialModalCancel">
              Cancel
            </button>
            <button type="submit" class="financial-btn financial-btn-primary">
              Save
            </button>
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

  function openInvoiceModal(invoice) {
    if (!state.budgets.length) {
      toast("Create a budget first before adding IPC records.", "fa-wallet");
      openBudgetModal();
      return;
    }

    state.activeInvoice = invoice || null;

    const budgetOptions = state.budgets.map(function (budget) {
      const selected = invoice && invoice.budget_id === budget.id ? "selected" : "";
      const label = (budget.category || "Budget") + " - FY " + (budget.fiscal_year || budget.fiscalYear || "");

      return `
        <option value="${escapeHtml(budget.id)}" ${selected}>
          ${escapeHtml(label)}
        </option>
      `;
    }).join("");

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field">
          <label>Budget</label>
          <select name="budget_id" required ${invoice ? "disabled" : ""}>
            ${budgetOptions}
          </select>
        </div>

        <div class="financial-field">
          <label>IPC / Invoice Number</label>
          <input name="invoice_number" required maxlength="50" value="${escapeHtml(invoice ? invoice.invoice_number || invoice.invoiceNumber || "" : "")}" ${invoice ? "readonly" : ""}>
        </div>

        <div class="financial-field">
          <label>Period / Description</label>
          <input name="vendor_name" required maxlength="200" value="${escapeHtml(invoice ? invoice.vendor_name || invoice.vendorName || "" : "")}">
        </div>

        <div class="financial-field">
          <label>AOA Amount</label>
          <input name="amount" type="number" min="0.01" step="0.01" required value="${escapeHtml(invoice ? invoice.amount || "" : "")}">
        </div>

        <div class="financial-field">
          <label>Invoice Date</label>
          <input name="invoice_date" type="date" required value="${escapeHtml(toInputDate(invoice ? invoice.invoice_date || invoice.invoiceDate : ""))}">
        </div>

        <div class="financial-field">
          <label>Due Date</label>
          <input name="due_date" type="date" value="${escapeHtml(toInputDate(invoice ? invoice.due_date || invoice.dueDate : ""))}">
        </div>

        <div class="financial-field">
          <label>Status</label>
          <select name="status">
            <option value="pending" ${invoice && invoice.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="approved" ${invoice && invoice.status === "approved" ? "selected" : ""}>Approved</option>
            <option value="paid" ${invoice && invoice.status === "paid" ? "selected" : ""}>Paid</option>
            <option value="rejected" ${invoice && invoice.status === "rejected" ? "selected" : ""}>Rejected</option>
          </select>
        </div>
      </div>
    `;

    openModal(invoice ? "Edit IPC" : "Add IPC", body, async function (form) {
      const payload = {
        invoice_number: String(form.get("invoice_number") || "").trim(),
        vendor_name: String(form.get("vendor_name") || "").trim(),
        amount: Number(form.get("amount")),
        invoice_date: String(form.get("invoice_date") || ""),
        due_date: form.get("due_date") ? String(form.get("due_date")) : null,
        attachment_ids: []
      };

      const status = String(form.get("status") || "pending");

      if (invoice) {
        await request("PUT", "/invoices/" + invoice.id, payload);

        if (status !== invoice.status) {
          await request("PATCH", "/invoices/" + invoice.id, { status: status });
        }

        toast("IPC updated successfully");
      } else {
        const budgetId = String(form.get("budget_id"));
        const created = await request("POST", "/budgets/" + budgetId + "/invoices", payload);

        if (status !== "pending" && created && created.data && created.data.id) {
          await request("PATCH", "/invoices/" + created.data.id, { status: status });
        }

        toast("IPC created successfully");
      }
    });
  }

  async function deleteInvoice(id) {
    if (!id) return;

    const invoice = state.invoices.find(function (item) {
      return item.id === id;
    });

    if (!invoice) return;

    const invoiceNumber = invoice.invoice_number || invoice.invoiceNumber || "this IPC";
    const yes = window.confirm("Delete " + invoiceNumber + "?");

    if (!yes) return;

    try {
      await request("DELETE", "/invoices/" + id);
      toast("IPC deleted successfully", "fa-trash");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Delete failed", "fa-triangle-exclamation");
    }
  }

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
          <input name="currency" maxlength="3" required value="${escapeHtml(budget ? budget.currency || "AOA" : "AOA")}"
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

  function renderFallbackOnly() {
    renderReferenceCards();
    renderCharts();
    renderIpcTracker();
    renderPaymentTracking();
    renderBankGuarantees();
    renderAmendments();
  }

  async function init() {
    injectStyles();
    ensureIpcTableHeader();
    ensureActions();

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