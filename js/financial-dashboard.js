
/* ============================================================
   financial-dashboard.js
   Makes Financial Dashboard functional using existing backend:
   - Budgets CRUD
   - IPC / Invoice CRUD
   - KPI cards from summary endpoint
   - Cash Flow chart from summary endpoint
   - Financial vs Physical chart from summary endpoint

   Load after api.js, shell.js, main.js, and Chart.js.
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
    activeBudget: null,
  };

  const STATUS_LABELS = {
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
    rejected: "Rejected",
  };

  const STATUS_CLASS = {
    pending: "warn",
    approved: "ok",
    paid: "ok",
    rejected: "danger",
  };

  function toast(message, icon) {
    if (window.WSDP_TOAST) {
      window.WSDP_TOAST(message, { icon: icon || "fa-circle-check" });
    } else {
      console.log(message);
    }
  }

  function api() {
    if (!window.WSDP_API) {
      throw new Error("WSDP_API is not loaded. Ensure js/api.js is loaded before financial-dashboard.js.");
    }
    return window.WSDP_API;
  }

  function parseStoredProject(value) {
    if (!value) return null;

    try {
      const parsed = JSON.parse(value);

      if (typeof parsed === "string") return parsed;

      return (
        parsed.id ||
        parsed.project_id ||
        parsed.projectId ||
        parsed.value ||
        null
      );
    } catch (e) {
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

  function moneyCr(value) {
    const n = Number(value || 0);
    return (n / 10000000).toFixed(1);
  }

  function formatAmount(value) {
    const n = Number(value || 0);
    return n.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    });
  }

  function toInputDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function ensureSession() {
    try {
      const user = await api().restoreSession();
      return Boolean(user);
    } catch (e) {
      return false;
    }
  }

  async function request(method, path, body) {
    return api().request(method, path, body);
  }

  function getTableBody() {
    const table = document.querySelector(".data-table");
    if (!table) return null;

    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    tbody.id = "ipcTableBody";
    return tbody;
  }

  function getCashFlowCanvas() {
    return document.getElementById("cashFlowChart");
  }

  function getFinPhysCanvas() {
    return document.getElementById("finPhysChart");
  }

  function setCountValue(label, value, decimals) {
    const cards = document.querySelectorAll(".kpi-card");

    cards.forEach((card) => {
      const labelEl = card.querySelector(".kpi-card__label");
      if (!labelEl) return;

      if (labelEl.textContent.trim().toLowerCase() !== label.toLowerCase()) return;

      const countEl = card.querySelector(".count-up");
      if (countEl) {
        countEl.setAttribute("data-count", Number(value || 0).toFixed(decimals || 0));
        countEl.textContent = Number(value || 0).toFixed(decimals || 0);
      }
    });
  }

  function setCardValue(label, html) {
    const cards = document.querySelectorAll(".kpi-card");

    cards.forEach((card) => {
      const labelEl = card.querySelector(".kpi-card__label");
      if (!labelEl) return;

      if (labelEl.textContent.trim().toLowerCase() !== label.toLowerCase()) return;

      const valueEl = card.querySelector(".kpi-card__value");
      if (valueEl) valueEl.innerHTML = html;
    });
  }

  function setCardDelta(label, text) {
    const cards = document.querySelectorAll(".kpi-card");

    cards.forEach((card) => {
      const labelEl = card.querySelector(".kpi-card__label");
      if (!labelEl) return;

      if (labelEl.textContent.trim().toLowerCase() !== label.toLowerCase()) return;

      const deltaEl = card.querySelector(".kpi-card__delta");
      if (deltaEl) deltaEl.textContent = text || "";
    });
  }

  function injectStyles() {
    if (document.getElementById("financialDashboardDynamicStyles")) return;

    const style = document.createElement("style");
    style.id = "financialDashboardDynamicStyles";
    style.textContent = `
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

      .financial-btn-danger {
        background: #fee2e2;
        color: #b91c1c;
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

  function ensureActions() {
    const tableCard = document.querySelector(".data-table")?.closest(".card");
    if (!tableCard) return;

    if (document.getElementById("financialActions")) return;

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

    const cardBody = tableCard.querySelector(".card-body");
    if (cardBody) {
      cardBody.insertBefore(actions, cardBody.firstChild);
    }

    document.getElementById("addInvoiceBtn")?.addEventListener("click", () => openInvoiceModal());
    document.getElementById("manageBudgetsBtn")?.addEventListener("click", () => openBudgetModal());
  }

  function ensureTableActionColumn() {
    const table = document.querySelector(".data-table");
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (!headRow) return;

    if (!headRow.querySelector("th[data-financial-actions]")) {
      const th = document.createElement("th");
      th.scope = "col";
      th.className = "num";
      th.setAttribute("data-financial-actions", "true");
      th.textContent = "Actions";
      headRow.appendChild(th);
    }
  }

  async function loadSummary() {
    const result = await request("GET", `/projects/${state.projectId}/financial-summary`);
    state.summary = result.data;
    renderSummary();
    renderCharts();
  }

  async function loadBudgets() {
    const result = await request("GET", `/projects/${state.projectId}/budgets?limit=100&sort=fiscal_year`);
    state.budgets = result.data || [];
  }

  async function loadInvoices() {
    const all = [];

    for (const budget of state.budgets) {
      const result = await request("GET", `/budgets/${budget.id}/invoices?limit=100&sort=invoiceDate`);
      const rows = result.data || [];

      rows.forEach((invoice) => {
        invoice.budget = budget;
        all.push(invoice);
      });
    }

    state.invoices = all;
  }

  async function reloadAll() {
    await loadBudgets();
    await Promise.all([loadInvoices(), loadSummary()]);
    renderInvoices();
  }

  function renderSummary() {
    const s = state.summary || {};

    setCountValue("Financial Progress", Number(s.financial_progress_pct || 0), 1);
    setCardDelta("Financial Progress", `${Number(s.remaining_budget_pct || 0).toFixed(1)}% budget remaining`);

    setCountValue("Physical Progress", Number(s.physical_progress_pct || 0), 1);
    setCardDelta(
      "Physical Progress",
      `Physical ${Number(s.physical_progress_pct || 0) >= Number(s.financial_progress_pct || 0) ? "ahead of" : "behind"} financial`
    );

    setCardValue(
      "Cumulative Expenditure",
      `<span class="unit" style="font-size:1.4rem;">₹</span><span>${moneyCr(s.cumulative_expenditure || 0)}</span><span class="unit">Cr</span>`
    );
    setCardDelta(
      "Cumulative Expenditure",
      `of ₹${moneyCr(s.total_budget || 0)} Cr total budget`
    );

    setCardValue("IPC Status", escapeHtml(s.latest_ipc_no || "No IPC"));
    setCardDelta("IPC Status", s.latest_ipc_status ? `Latest status: ${STATUS_LABELS[s.latest_ipc_status] || s.latest_ipc_status}` : "No IPC submitted");
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function destroyChart(canvas) {
    if (!canvas || !window.Chart) return;

    const existing = window.Chart.getChart(canvas);
    if (existing) existing.destroy();
  }

  function renderCharts() {
    if (!window.Chart) return;

    const s = state.summary || {};

    const cashFlow = s.cash_flow || [];
    const progress = s.financial_vs_physical || [];

    const cashCanvas = getCashFlowCanvas();
    if (cashCanvas) {
      destroyChart(cashCanvas);

      state.cashFlowChart = new Chart(cashCanvas, {
        type: "bar",
        data: {
          labels: cashFlow.map((x) => x.month),
          datasets: [
            {
              label: "Planned (₹ Cr)",
              data: cashFlow.map((x) => x.planned_cr),
              backgroundColor: cssVar("--color-neutral-light") || "#dbe4ea",
              borderRadius: 6,
            },
            {
              label: "Actual (₹ Cr)",
              data: cashFlow.map((x) => x.actual_cr),
              backgroundColor: cssVar("--color-secondary") || "#10b981",
              borderRadius: 6,
            },
          ],
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
                pointStyle: "circle",
              },
            },
          },
          scales: {
            x: { grid: { display: false } },
          },
        },
      });
    }

    const finPhysCanvas = getFinPhysCanvas();
    if (finPhysCanvas) {
      destroyChart(finPhysCanvas);

      state.finPhysChart = new Chart(finPhysCanvas, {
        type: "line",
        data: {
          labels: progress.map((x) => x.month),
          datasets: [
            {
              label: "Physical %",
              data: progress.map((x) => x.physical_pct),
              borderColor: cssVar("--color-primary") || "#2563eb",
              backgroundColor: "transparent",
              tension: 0.35,
              borderWidth: 3,
              pointRadius: 3,
            },
            {
              label: "Financial %",
              data: progress.map((x) => x.financial_pct),
              borderColor: cssVar("--color-secondary") || "#10b981",
              backgroundColor: "transparent",
              tension: 0.35,
              borderWidth: 3,
              pointRadius: 3,
              borderDash: [5, 4],
            },
          ],
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
                pointStyle: "circle",
              },
            },
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: {
                callback: function (v) {
                  return v + "%";
                },
              },
            },
            x: { grid: { display: false } },
          },
        },
      });
    }
  }

  function renderInvoices() {
    ensureTableActionColumn();

    const tbody = getTableBody();
    if (!tbody) return;

    if (!state.invoices.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="financial-empty">
              No IPC records found. Use <strong>Add IPC</strong> to create the first record.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.invoices
      .sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date))
      .map((invoice) => {
        const status = invoice.status || "pending";
        const statusClass = STATUS_CLASS[status] || "warn";
        const statusLabel = STATUS_LABELS[status] || status;

        return `
          <tr data-invoice-id="${escapeHtml(invoice.id)}">
            <td>${escapeHtml(invoice.invoice_number)}</td>
            <td>${escapeHtml(invoice.vendor_name || invoice.budget?.category || "-")}</td>
            <td class="num">${moneyCr(invoice.amount)}</td>
            <td>${escapeHtml(invoice.invoice_date || "-")}</td>
            <td>
              <span class="status-chip ${statusClass}">
                <i class="fa-solid fa-circle-check"></i> ${escapeHtml(statusLabel)}
              </span>
            </td>
            <td class="num">
              <div class="financial-row-actions">
                edit-invoice
                  <i class="fa-solid fa-pen"></i>
                </button>
                delete-invoice
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("[data-action='edit-invoice']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const invoice = state.invoices.find((x) => x.id === btn.getAttribute("data-id"));
        openInvoiceModal(invoice);
      });
    });

    tbody.querySelectorAll("[data-action='delete-invoice']").forEach((btn) => {
      btn.addEventListener("click", () => deleteInvoice(btn.getAttribute("data-id")));
    });
  }

  function closeModal() {
    document.querySelector(".financial-modal-backdrop")?.remove();
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

    document.getElementById("financialModalClose")?.addEventListener("click", closeModal);
    document.getElementById("financialModalCancel")?.addEventListener("click", closeModal);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    document.getElementById("financialModalForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        await onSubmit(new FormData(e.target));
        closeModal();
        await reloadAll();
      } catch (err) {
        toast(err.message || "Save failed", "fa-triangle-exclamation");
      }
    });
  }

  function openInvoiceModal(invoice) {
    if (!state.budgets.length) {
      toast("Create a budget first before adding IPC records.", "fa-wallet");
      openBudgetModal();
      return;
    }

    state.activeInvoice = invoice || null;

    const budgetOptions = state.budgets
      .map((budget) => {
        const selected = invoice && invoice.budget_id === budget.id ? "selected" : "";
        return `<option value="${escapeHtml(budget.id)}" ${selected}>${escapeHtml(budget.category)} - FY ${escapeHtml(budget.fiscal_year)}</option>`;
      })
      .join("");

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
          <input name="invoice_number" required maxlength="50" value="${escapeHtml(invoice?.invoice_number || "")}" ${invoice ? "readonly" : ""}>
        </div>

        <div class="financial-field">
          <label>Vendor / Period</label>
          <input name="vendor_name" required maxlength="200" value="${escapeHtml(invoice?.vendor_name || "")}">
        </div>

        <div class="financial-field">
          <label>Amount</label>
          <input name="amount" type="number" min="0.01" step="0.01" required value="${escapeHtml(invoice?.amount || "")}">
        </div>

        <div class="financial-field">
          <label>Invoice Date</label>
          <input name="invoice_date" type="date" required value="${escapeHtml(toInputDate(invoice?.invoice_date))}">
        </div>

        <div class="financial-field">
          <label>Due Date</label>
          <input name="due_date" type="date" value="${escapeHtml(toInputDate(invoice?.due_date))}">
        </div>

        <div class="financial-field">
          <label>Status</label>
          <select name="status">
            ${["pending", "approved", "paid", "rejected"]
              .map((status) => `<option value="${status}" ${invoice?.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`)
              .join("")}
          </select>
        </div>
      </div>
    `;

    openModal(invoice ? "Edit IPC" : "Add IPC", body, async (form) => {
      const payload = {
        invoice_number: String(form.get("invoice_number") || "").trim(),
        vendor_name: String(form.get("vendor_name") || "").trim(),
        amount: Number(form.get("amount")),
        invoice_date: String(form.get("invoice_date")),
        due_date: form.get("due_date") ? String(form.get("due_date")) : null,
        attachment_ids: [],
      };

      const status = String(form.get("status") || "pending");

      if (invoice) {
        await request("PUT", `/invoices/${invoice.id}`, payload);

        if (status !== invoice.status) {
          await request("PATCH", `/invoices/${invoice.id}`, { status });
        }

        toast("IPC updated successfully");
      } else {
        const budgetId = String(form.get("budget_id"));
        const created = await request("POST", `/budgets/${budgetId}/invoices`, payload);

        if (status !== "pending") {
          await request("PATCH", `/invoices/${created.data.id}`, { status });
        }

        toast("IPC created successfully");
      }
    });
  }

  async function deleteInvoice(id) {
    const invoice = state.invoices.find((x) => x.id === id);
    if (!invoice) return;

    const yes = window.confirm(`Delete ${invoice.invoice_number}?`);
    if (!yes) return;

    try {
      await request("DELETE", `/invoices/${id}`);
      toast("IPC deleted successfully", "fa-trash");
      await reloadAll();
    } catch (err) {
      toast(err.message || "Delete failed", "fa-triangle-exclamation");
    }
  }

  function openBudgetModal(budget) {
    state.activeBudget = budget || null;

    const body = `
      <div class="financial-form-grid">
        <div class="financial-field">
          <label>Category</label>
          <input name="category" required maxlength="100" value="${escapeHtml(budget?.category || "")}">
        </div>

        <div class="financial-field">
          <label>Fiscal Year</label>
          <input name="fiscal_year" type="number" min="2000" max="2100" required value="${escapeHtml(budget?.fiscal_year || new Date().getFullYear())}">
        </div>

        <div class="financial-field">
          <label>Allocated Amount</label>
          <input name="allocated_amount" type="number" min="0.01" step="0.01" required value="${escapeHtml(budget?.allocated_amount || "")}">
        </div>

        <div class="financial-field">
          <label>Currency</label>
          <input name="currency" maxlength="3" required value="${escapeHtml(budget?.currency || "INR")}">
        </div>

        <div class="financial-field full">
          <label>Notes</label>
          <textarea name="notes" rows="3">${escapeHtml(budget?.notes || "")}</textarea>
        </div>

        ${state.budgets.length ? `
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
                  ${state.budgets.map((b) => `
                    <tr>
                      <td>${escapeHtml(b.category)}</td>
                      <td>${escapeHtml(b.fiscal_year)}</td>
                      <td class="num">${formatAmount(b.allocated_amount)}</td>
                      <td class="num">${formatAmount(b.utilized_amount || 0)}</td>
                      <td class="num">
                        <button type="button" class="financial-icon-btn" data-budget-edit="${escapeHtml(b.id)}">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="financial-icon-btn danger" data-budget-delete="${escapeHtml(b.id)}">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : ""}
      </div>
    `;

    openModal(budget ? "Edit Budget" : "Manage Budgets", body, async (form) => {
      const payload = {
        category: String(form.get("category") || "").trim(),
        fiscal_year: Number(form.get("fiscal_year")),
        allocated_amount: Number(form.get("allocated_amount")),
        currency: String(form.get("currency") || "INR").trim().toUpperCase(),
        notes: String(form.get("notes") || "").trim() || undefined,
      };

      if (budget) {
        await request("PUT", `/budgets/${budget.id}`, payload);
        toast("Budget updated successfully");
      } else {
        await request("POST", `/projects/${state.projectId}/budgets`, payload);
        toast("Budget created successfully");
      }
    });

    document.querySelectorAll("[data-budget-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const b = state.budgets.find((x) => x.id === btn.getAttribute("data-budget-edit"));
        closeModal();
        openBudgetModal(b);
      });
    });

    document.querySelectorAll("[data-budget-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-budget-delete");
        const b = state.budgets.find((x) => x.id === id);
        if (!b) return;

        const yes = window.confirm(`Delete budget "${b.category}"?`);
        if (!yes) return;

        try {
          await request("DELETE", `/budgets/${id}`);
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

  async function init() {
    injectStyles();
    ensureActions();
    ensureTableActionColumn();

    const sessionOk = await ensureSession();
    if (!sessionOk) return;

    state.projectId = getProjectId();

    if (!state.projectId) {
      toast("Project is missing. Set current_project in localStorage before using Financial Dashboard.", "fa-triangle-exclamation");
      renderInvoices();
      return;
    }

    try {
      await reloadAll();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to load financial dashboard", "fa-triangle-exclamation");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();