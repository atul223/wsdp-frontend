/* ============================================================
   resource-dashboard.js
   DB-backed Resource Dashboard CRUD for:
   - Materials            (Resource, type=material)
   - Equipment            (Resource, type=equipment)
   - Manpower             (Resource, type=manpower)
   - HDPE Pipe Stock       (HdpePipeStock)   <- DB-backed, full CRUD
   - Equipment Deployment  (EquipmentDeployment) <- DB-backed, full CRUD
   - Workforce By Employer (WorkforceEmployer)   <- DB-backed, full CRUD
   - Summary/KPI cards     (ResourceSummaryCard) <- DB-backed, full CRUD
     (Materials Below Reorder, Equipment Utilization, Manpower Deployed,
     Idle / Maintenance — editable with a manual override, or reset back
     to auto-calculated)

   All data tables in this module include an "S.No." column, full
   Add / Edit / Delete / Update support, and an auto-calculated
   read-only "Total" row (last row) that is always recomputed from the
   current data and never disturbs the underlying records.

   IMPORTANT — Computed / read-only fields:
   Several columns are DERIVED, not raw input, and are intentionally
   NOT submitted to the backend as freely-typed values:
     - Materials/Equipment/Manpower: "Allocated" and "Remaining" are
       computed server-side from active Allocation records against a
       Resource (Remaining = Total Capacity - Allocated). They cannot
       be typed in directly.
     - HDPE Pipe Stock: "Stock (m)" = Received (m) - Used (m). This
       stays fully auto-calculated.
     - Equipment Deployment: "Variance" = Planned - Deployed.
   These are shown in the Add/Edit modal as DISABLED, auto-calculating
   fields (updated live as you type the source values) so the numbers
   are visible and understandable, without allowing an inconsistent
   manual override that would desync from the underlying data.

   EDITABLE LABEL FIELDS (with custom label support):
     - Materials "Status" chip: pick a preset (Adequate / Watch /
       Below Reorder) or choose "Custom label…" and type anything.
       Persisted as Resource.status_override (null = auto-derived).
     - HDPE Pipe Stock "Cover" chip: pick a preset (OK / Watch /
       Re-order) or choose "Custom label…" and type anything.
       Persisted as HdpePipeStock.cover_override (null = auto-derived).

   Requires:
   - js/api.js
   - js/shell.js
   - js/main.js
   - Chart.js
   ============================================================ */

(function () {
  "use strict";

  const RESOURCE_TYPES = {
    material: {
      label: "Material",
      plural: "Materials",
      icon: "fa-boxes-stacked",
      defaultUnit: "nos"
    },
    equipment: {
      label: "Equipment",
      plural: "Equipment",
      icon: "fa-truck-monster",
      defaultUnit: "nos"
    },
    manpower: {
      label: "Manpower",
      plural: "Manpower",
      icon: "fa-people-group",
      defaultUnit: "persons"
    }
  };

  // Preset label options for the two editable chip columns. "custom" is a
  // sentinel value handled specially by the modal (reveals a free-text
  // input) — it is never sent to the backend as a literal label.
  const STATUS_PRESETS = ["Adequate", "Watch", "Below Reorder"];
  const COVER_PRESETS = ["OK", "Watch", "Re-order"];

  // Field definitions for the 3 DB-backed report tables. Driving the
  // Add/Edit modal generically from this config keeps the CRUD pattern
  // identical for all 3 tables while matching each table's own columns.
  // Fields marked `computed: true` are DISPLAYED (disabled, auto-
  // calculated) but never submitted in the payload. Fields marked
  // `chip: true` render as a preset-dropdown + custom-label input pair
  // (see buildChipFieldHTML / attachChipFieldListeners) instead of a
  // plain input, and submit as "<key>_override".
  const REPORT_TYPES = {
    hdpe: {
      label: "HDPE Pipe Stock Entry",
      listPath: function (projectId) { return "/projects/" + projectId + "/hdpe-pipe-stock?limit=200"; },
      createPath: function (projectId) { return "/projects/" + projectId + "/hdpe-pipe-stock"; },
      itemPath: function (id) { return "/hdpe-pipe-stock/" + id; },
      fields: [
        { key: "diameter", label: "Diameter", type: "text", required: true, full: true },
        { key: "received_m", label: "Received (m)", type: "number", step: "0.01", min: "0", required: true },
        { key: "used_m", label: "Used (m)", type: "number", step: "0.01", min: "0", required: true },
        { key: "stock_m", label: "Stock (m)", type: "number", computed: true, hint: "Auto-calculated: Received − Used" },
        {
          key: "cover",
          label: "Cover",
          type: "chip",
          chip: true,
          presets: COVER_PRESETS,
          hint: "Choose a preset, or \u201cCustom label\u2026\u201d to type your own",
          full: true
        }
      ]
    },
    equipmentDeployment: {
      label: "Equipment Deployment Entry",
      listPath: function (projectId) { return "/projects/" + projectId + "/equipment-deployments?limit=200"; },
      createPath: function (projectId) { return "/projects/" + projectId + "/equipment-deployments"; },
      itemPath: function (id) { return "/equipment-deployments/" + id; },
      fields: [
        { key: "category", label: "Category", type: "text", required: true, full: true },
        { key: "planned", label: "Planned", type: "number", step: "0.01", min: "0", required: false },
        { key: "deployed", label: "Deployed", type: "number", step: "0.01", min: "0", required: true },
        { key: "variance", label: "Variance", type: "number", computed: true, hint: "Auto-calculated: Planned − Deployed" },
        { key: "remarks", label: "Remarks", type: "textarea", required: false, full: true }
      ]
    },
    workforce: {
      label: "Workforce Entry",
      listPath: function (projectId) { return "/projects/" + projectId + "/workforce-employers?limit=200"; },
      createPath: function (projectId) { return "/projects/" + projectId + "/workforce-employers"; },
      itemPath: function (id) { return "/workforce-employers/" + id; },
      fields: [
        { key: "group_name", label: "Group / Employer", type: "text", required: false },
        { key: "category", label: "Category", type: "text", required: false },
        { key: "headcount", label: "Headcount", type: "number", step: "1", min: "0", required: true }
      ]
    }
  };

  // Computes the live value of each `computed: true` field for a report
  // type, given the current raw form values. Mirrors the backend's
  // derivation logic exactly (see hdpePipeStock.service.js /
  // equipmentDeployment.service.js toApiShape()) so the number shown
  // here always matches what the server will calculate and store.
  const COMPUTED_VALUE_FNS = {
    hdpe: {
      stock_m: function (values) {
        const received = Number(values.received_m || 0);
        const used = Number(values.used_m || 0);
        return (received - used).toFixed(2);
      }
    },
    equipmentDeployment: {
      variance: function (values) {
        if (values.planned === "" || values.planned === null || values.planned === undefined) return "";
        const planned = Number(values.planned || 0);
        const deployed = Number(values.deployed || 0);
        return (planned - deployed).toFixed(2);
      }
    }
  };

  // Auto-preview for chip fields — shows what the "Auto" choice would
  // currently resolve to, purely as a hint next to the dropdown.
  const CHIP_AUTO_PREVIEW_FNS = {
    hdpe: {
      cover: function (values) {
        const received = Number(values.received_m || 0);
        const used = Number(values.used_m || 0);
        const stock = received - used;
        if (stock <= 0) return "Re-order";
        if (stock <= received * 0.25) return "Watch";
        return "OK";
      }
    }
  };

  const MANPOWER_PROGRESS = [
    {
      label: "Planned",
      value: "133",
      note: "Per Month-5 plan",
      icon: "fa-helmet-safety",
      accent: "warning",
      iconTone: "icon-tone-amber"
    },
    {
      label: "Deployed",
      value: "115",
      note: "CTCE + 2 Subcontractors",
      icon: "fa-helmet-safety",
      accent: "primary",
      iconTone: "icon-tone-blue"
    },
    {
      label: "Gap",
      value: "-18",
      note: "Shortfall",
      icon: "fa-triangle-exclamation",
      accent: "warning",
      iconTone: "icon-tone-amber"
    },
    {
      label: "Female %",
      value: "4.8%",
      note: "5 of 115",
      icon: "fa-people-group",
      accent: "warning",
      iconTone: "icon-tone-amber"
    },
    {
      label: "Local Nationals",
      value: "90",
      note: "Subcontracted unqualified",
      icon: "fa-users",
      accent: "success",
      iconTone: "icon-tone-green"
    },
    {
      label: "Foreign Workers",
      value: "8",
      note: "Subcontracted specialists",
      icon: "fa-user-group",
      accent: "primary",
      iconTone: "icon-tone-blue"
    }
  ];

  // Config for the 4 editable top KPI cards. `domIndex` matches their
  // fixed left-to-right order in the .grid-4 markup so we can wire up
  // edit/reset controls without touching resource-dashboard.html.
  const SUMMARY_CARD_DEFS = [
    { key: "materials_below_reorder", domIndex: 0, decimals: 0, suffix: "" },
    { key: "equipment_utilization", domIndex: 1, decimals: 0, suffix: "%" },
    { key: "manpower_deployed", domIndex: 2, decimals: 0, suffix: "" },
    { key: "idle_maintenance", domIndex: 3, decimals: 0, suffix: "" }
  ];

  let state = {
    projectId: null,
    resources: [],
    hdpeStock: [],
    equipmentDeployments: [],
    workforceRows: [],
    summaryCards: [],
    chart: null,
    initialized: false
  };

  function api() {
    if (!window.WSDP_API) {
      throw new Error("WSDP_API is not loaded. Ensure js/api.js is loaded before resource-dashboard.js.");
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

  function showError(error, fallback) {
    const message = error && error.message ? error.message : fallback || "Something went wrong";
    toast(message, "fa-triangle-exclamation");
    console.error(error);
  }

  function extractProjectId(value) {
    if (!value) return null;

    try {
      const parsed = JSON.parse(value);
      return parsed.id || parsed.projectId || parsed.project_id || null;
    } catch (e) {
      return value;
    }
  }

  async function resolveProjectId() {
    const storedProject =
      localStorage.getItem("current_project") ||
      localStorage.getItem("currentProject") ||
      localStorage.getItem("project_id") ||
      localStorage.getItem("projectId");

    const fromStorage = extractProjectId(storedProject);
    if (fromStorage) return fromStorage;

    try {
      const result = await api().request("GET", "/projects");
      const projects = Array.isArray(result && result.data) ? result.data : [];

      if (projects.length > 0) {
        const first = projects[0];
        const projectId = first.id || first.project_id;

        if (projectId) {
          localStorage.setItem("current_project", JSON.stringify(first));
          return projectId;
        }
      }
    } catch (err) {
      console.warn("Could not auto-load project list:", err.message);
    }

    return null;
  }

  function buttonHTML(icon, text, className, attrs) {
    return `
      <button type="button" class="${className || "btn-ghost"}" ${attrs || ""}>
        <i class="fa-solid ${icon}"></i> ${text}
      </button>
    `;
  }

  function iconButtonHTML(icon, title, className, attrs) {
    return `
      <button type="button" class="${className || ""}" title="${escapeAttr(title)}" ${attrs || ""}>
        <i class="fa-solid ${icon}"></i>
      </button>
    `;
  }

  function ensureStyles() {
    if (document.getElementById("resourceDashboardStyles")) return;

    const style = document.createElement("style");
    style.id = "resourceDashboardStyles";
    style.textContent = `
      .resource-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
        margin-bottom: 12px;
      }

      .resource-heading-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-top: 28px;
      }

      .resource-heading-row .section-heading {
        margin: 0;
      }

      .resource-action-cell {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        white-space: nowrap;
      }

      .resource-action-cell button {
        border: 1px solid var(--border-color, #E3E7EB);
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232F);
        border-radius: 8px;
        padding: 6px 8px;
        cursor: pointer;
      }

      .resource-action-cell button:hover {
        background: rgba(49, 130, 206, 0.08);
      }

      .resource-action-cell .danger {
        color: var(--color-critical, #C0392B);
      }

      .resource-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(15, 23, 42, 0.42);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      .resource-modal {
        width: min(560px, 100%);
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232F);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.22);
        border: 1px solid var(--border-color, #E3E7EB);
        overflow: hidden;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }

      .resource-modal__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border-color, #E3E7EB);
      }

      .resource-modal__header h3 {
        margin: 0;
        font-size: 18px;
      }

      .resource-modal__body {
        padding: 20px;
        overflow-y: auto;
      }

      .resource-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .resource-form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .resource-form-field.full {
        grid-column: 1 / -1;
      }

      .resource-form-field label {
        font-size: 12px;
        font-weight: 700;
        color: var(--text-muted, #6B7280);
      }

      .resource-form-field .field-hint {
        font-size: 11px;
        font-weight: 400;
        font-style: italic;
        color: var(--text-muted, #9AA5B1);
        margin-top: -2px;
      }

      .resource-form-field input,
      .resource-form-field select,
      .resource-form-field textarea {
        width: 100%;
        border: 1px solid var(--border-color, #E3E7EB);
        border-radius: 10px;
        padding: 10px 11px;
        background: var(--card-bg, #fff);
        color: var(--text-primary, #16232F);
        font-family: inherit;
      }

      .resource-form-field input:disabled,
      .resource-form-field textarea:disabled {
        background: rgba(120, 130, 145, 0.10);
        color: var(--text-muted, #6B7280);
        cursor: not-allowed;
      }

      .resource-form-field textarea {
        min-height: 82px;
        resize: vertical;
      }

      .resource-chip-field__row {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .resource-chip-field__row select {
        flex: 1 1 auto;
      }

      .resource-chip-field__custom {
        margin-top: 8px;
      }

      .resource-chip-field__preview {
        font-size: 11px;
        color: var(--text-muted, #9AA5B1);
        font-style: italic;
      }

      .resource-modal__footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 20px;
        border-top: 1px solid var(--border-color, #E3E7EB);
      }

      .btn-primary-lite {
        border: none;
        background: var(--color-primary, #2563EB);
        color: #fff;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
      }

      .btn-primary-lite:disabled,
      .btn-ghost:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .resource-empty {
        padding: 24px;
        text-align: center;
        color: var(--text-muted, #6B7280);
      }

      .resource-empty i {
        font-size: 24px;
        margin-bottom: 8px;
      }

      .resource-report-card {
        margin-top: 18px;
      }

      .resource-report-heading-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding: 18px 20px 0;
      }

      .resource-report-heading-row .resource-report-heading {
        padding: 0;
      }

      .resource-report-heading-row .resource-actions {
        margin-bottom: 0;
      }

      .resource-report-heading h3 {
        margin: 0;
        color: var(--color-primary, #0A4595);
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      .resource-report-heading p {
        margin: 4px 0 0;
        color: var(--text-muted, #8A99AA);
        font-size: 13px;
      }

      .resource-report-table tbody tr:nth-child(even) {
        background: rgba(10, 69, 149, 0.06);
      }

      .resource-report-table td.remarks-cell {
        color: var(--text-muted, #5B6B7C);
        font-size: 12.5px;
        max-width: 280px;
        white-space: normal;
        line-height: 1.4;
      }

      .resource-report-table td.sno-cell,
      .resource-report-table th.sno-col,
      .data-table th.sno-col,
      .data-table td.sno-cell {
        width: 48px;
        text-align: center;
        color: var(--text-muted, #8A99AA);
      }

      .resource-total-row {
        background: rgba(10, 69, 149, 0.12) !important;
        font-weight: 800;
        color: var(--color-primary, #0A4595);
      }

      .resource-total-row td {
        border-top: 2px solid rgba(10, 69, 149, 0.25);
      }

      .status-chip.custom {
        background: rgba(107, 114, 128, 0.12);
        color: #4B5563;
      }

      .resource-manpower-kpis {
        margin-bottom: 16px;
      }

      .resource-manpower-kpis .kpi-card__value {
        font-size: 1.75rem;
      }

      .resource-manpower-kpis .kpi-card__delta {
        font-size: 12px;
        font-style: italic;
      }

      .manpower-chart-card {
        margin-top: 0;
      }

      .kpi-card__top {
        position: relative;
      }

      .kpi-card__edit-controls {
        position: absolute;
        top: 0;
        right: 34px;
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.15s ease;
      }

      .card.kpi-card:hover .kpi-card__edit-controls {
        opacity: 1;
      }

      .kpi-card__edit-controls button {
        border: 1px solid var(--border-color, #E3E7EB);
        background: var(--card-bg, #fff);
        color: var(--text-muted, #6B7280);
        border-radius: 6px;
        width: 24px;
        height: 24px;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .kpi-card__edit-controls button:hover {
        background: rgba(49, 130, 206, 0.08);
        color: var(--color-primary, #2563EB);
      }

      .kpi-card__manual-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--color-primary, #2563EB);
        margin-top: 4px;
      }

      @media (max-width: 720px) {
        .resource-heading-row {
          flex-direction: column;
        }

        .resource-report-heading-row {
          flex-direction: column;
        }

        .resource-actions {
          justify-content: flex-start;
        }

        .resource-form-grid {
          grid-template-columns: 1fr;
        }

        .kpi-card__edit-controls {
          opacity: 1;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // -----------------------------------------------------------------
  // Status / Cover chip helpers (shared classification for both the
  // Materials "Status" column and the HDPE "Cover" column, including
  // free-form custom labels that don't match a known preset).
  // -----------------------------------------------------------------

  function classifyChipLabel(label) {
    const normalized = String(label || "").toLowerCase();

    if (normalized.includes("re-order") || normalized.includes("reorder") || normalized.includes("below")) {
      return { className: "crit", icon: "fa-circle-exclamation" };
    }
    if (normalized.includes("watch")) {
      return { className: "warn", icon: "fa-triangle-exclamation" };
    }
    if (normalized.includes("ok") || normalized.includes("adequate")) {
      return { className: "ok", icon: "fa-circle-check" };
    }

    // Unrecognized custom label — render with a neutral chip style
    // rather than guessing at severity.
    return { className: "custom", icon: "fa-tag" };
  }

  function getStatusForMaterial(resource) {
    if (resource.status_override) {
      const classified = classifyChipLabel(resource.status_override);
      return { className: classified.className, icon: classified.icon, text: resource.status_override };
    }

    const total = Number(resource.total_capacity || 0);
    const remaining = Number(resource.remaining_capacity ?? total);

    if (remaining <= 0) {
      return { className: "crit", icon: "fa-circle-exclamation", text: "Below Reorder" };
    }

    if (remaining <= total * 0.25) {
      return { className: "warn", icon: "fa-triangle-exclamation", text: "Watch" };
    }

    return { className: "ok", icon: "fa-circle-check", text: "Adequate" };
  }

  function getCoverDisplay(item) {
    const label = item.cover_override || item.cover;
    const classified = classifyChipLabel(label);
    return { className: classified.className, icon: classified.icon, text: label };
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "—";

    const num = Number(value || 0);
    return Number.isInteger(num)
      ? num.toLocaleString()
      : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function byType(type) {
    return state.resources.filter(function (r) {
      return r.type === type;
    });
  }

  // ----------------------------------------------------------------------
  // Total row helpers — always computed live from the currently loaded
  // rows (never persisted, never disturbs the source data). Any legacy
  // "is_total" DB rows are filtered out of both the data list and the
  // total math so a table never shows two total rows.
  // ----------------------------------------------------------------------

  function nonTotalRows(rows) {
    return (rows || []).filter(function (r) { return !r.is_total; });
  }

  function computeMaterialsTotals(materials) {
    return materials.reduce(
      function (acc, item) {
        acc.total_capacity += Number(item.total_capacity || 0);
        acc.allocated += Number(item.allocated_quantity || 0);
        acc.remaining += Number(item.remaining_capacity ?? item.total_capacity ?? 0);
        return acc;
      },
      { total_capacity: 0, allocated: 0, remaining: 0 }
    );
  }

  function computeHdpeTotals(rows) {
    return rows.reduce(
      function (acc, item) {
        acc.received_m += Number(item.received_m || 0);
        acc.used_m += Number(item.used_m || 0);
        acc.stock_m += Number(item.stock_m || 0);
        return acc;
      },
      { received_m: 0, used_m: 0, stock_m: 0 }
    );
  }

  function computeEquipmentDeploymentTotals(rows) {
    let plannedSum = 0;
    let hasPlanned = false;

    rows.forEach(function (item) {
      if (item.planned !== null && item.planned !== undefined && item.planned !== "") {
        plannedSum += Number(item.planned);
        hasPlanned = true;
      }
    });

    const deployedSum = rows.reduce(function (sum, item) { return sum + Number(item.deployed || 0); }, 0);
    const varianceSum = hasPlanned ? plannedSum - deployedSum : null;

    return { planned: hasPlanned ? plannedSum : null, deployed: deployedSum, variance: varianceSum };
  }

  function computeWorkforceTotals(rows) {
    return rows.reduce(function (sum, item) { return sum + Number(item.headcount || 0); }, 0);
  }

  // ----------------------------------------------------------------------
  // Summary / KPI cards (Materials Below Reorder, Equipment Utilization,
  // Manpower Deployed, Idle / Maintenance) — DB-backed with manual
  // override + reset-to-auto, replacing the old pure client-side compute.
  // ----------------------------------------------------------------------

  function getSummaryCard(cardKey) {
    return state.summaryCards.find(function (c) { return c.card_key === cardKey; }) || null;
  }

  function formatSummaryValue(card, def) {
    if (!card) return "—";
    const value = card.effective_value;
    if (value === null || value === undefined) return "—";
    return formatNumber(value) + (def.suffix || "");
  }

  function updateKPIs() {
    const kpiCards = document.querySelectorAll(".grid-4.fade-in > .kpi-card");

    SUMMARY_CARD_DEFS.forEach(function (def) {
      const card = getSummaryCard(def.key);
      const el = kpiCards[def.domIndex];
      if (!el) return;

      const valueEl = el.querySelector(".kpi-card__value .count-up");
      if (valueEl) valueEl.textContent = formatNumber(card ? card.effective_value : 0);

      let manualBadge = el.querySelector(".kpi-card__manual-badge");
      if (card && card.is_manual) {
        if (!manualBadge) {
          manualBadge = document.createElement("div");
          manualBadge.className = "kpi-card__manual-badge";
          el.appendChild(manualBadge);
        }
        manualBadge.innerHTML = '<i class="fa-solid fa-pen"></i> Manually set';
      } else if (manualBadge) {
        manualBadge.remove();
      }
    });

    const criticalDelta = document.querySelector(".card-accent--critical .kpi-card__delta");
    const materialsCard = getSummaryCard("materials_below_reorder");

    if (criticalDelta) {
      if (materialsCard && materialsCard.effective_note) {
        criticalDelta.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${escapeHTML(materialsCard.effective_note)}`;
      } else {
        const count = materialsCard ? Number(materialsCard.effective_value || 0) : 0;
        criticalDelta.innerHTML =
          count > 0
            ? `<i class="fa-solid fa-arrow-down"></i> ${count} material item(s) need attention`
            : `<i class="fa-solid fa-circle-check"></i> No material below reorder`;
      }
    }
  }

  function renderSummaryCardControls() {
    const kpiCards = document.querySelectorAll(".grid-4.fade-in > .kpi-card");

    SUMMARY_CARD_DEFS.forEach(function (def) {
      const el = kpiCards[def.domIndex];
      if (!el) return;

      const top = el.querySelector(".kpi-card__top");
      if (!top) return;

      if (top.querySelector(".kpi-card__edit-controls")) return;

      const controls = document.createElement("div");
      controls.className = "kpi-card__edit-controls";
      controls.innerHTML =
        iconButtonHTML("fa-pen", "Edit this card", "", 'data-summary-edit="' + def.key + '"') +
        iconButtonHTML("fa-rotate-left", "Reset to auto-calculated", "", 'data-summary-reset="' + def.key + '"');

      top.appendChild(controls);
    });
  }

  function openSummaryCardModal(cardKey) {
    const def = SUMMARY_CARD_DEFS.find(function (d) { return d.key === cardKey; });
    const card = getSummaryCard(cardKey);
    if (!def || !card) return;

    closeResourceModal();

    const backdrop = document.createElement("div");
    backdrop.className = "resource-modal-backdrop";
    backdrop.id = "resourceModalBackdrop";

    backdrop.innerHTML = `
      <div class="resource-modal" role="dialog" aria-modal="true" aria-labelledby="summaryModalTitle">
        <div class="resource-modal__header">
          <h3 id="summaryModalTitle">Edit "${escapeHTML(card.label)}"</h3>
          <button type="button" class="icon-btn" data-resource-modal-close aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="summaryForm">
          <div class="resource-modal__body">
            <div class="resource-form-grid">
              <div class="resource-form-field full">
                <label for="summaryValue">Value${def.suffix ? " (" + def.suffix + ")" : ""}</label>
                <span class="field-hint">Auto-calculated value is currently ${formatNumber(card.auto_value)}${def.suffix || ""}. Leave blank to keep auto-calculating.</span>
                <input id="summaryValue" name="value_override" type="number" step="0.01" value="${card.value_override !== null ? escapeAttr(card.value_override) : ""}" />
              </div>

              <div class="resource-form-field full">
                <label for="summaryNote">Caption / note</label>
                <span class="field-hint">Shown under the value (e.g. the small italic line on the card). Leave blank to keep the default caption.</span>
                <input id="summaryNote" name="note_override" type="text" maxlength="200" value="${escapeAttr(card.note_override || "")}" />
              </div>
            </div>
          </div>

          <div class="resource-modal__footer">
            <button type="button" class="btn-ghost" data-resource-modal-close>Cancel</button>
            <button type="submit" class="btn-primary-lite">
              <i class="fa-solid fa-floppy-disk"></i> Save
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    const form = backdrop.querySelector("#summaryForm");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const rawValue = form.value_override.value;
      const rawNote = form.note_override.value.trim();

      const payload = {
        value_override: rawValue === "" ? null : Number(rawValue),
        note_override: rawNote === "" ? null : rawNote
      };

      try {
        await api().request("PATCH", "/projects/" + state.projectId + "/resource-summary-cards/" + cardKey, payload);
        toast("Summary card updated successfully");
        closeResourceModal();
        await loadAllData();
      } catch (err) {
        showError(err, "Failed to update summary card");
      } finally {
        submitBtn.disabled = false;
      }
    });

    backdrop.querySelectorAll("[data-resource-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", closeResourceModal);
    });

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) closeResourceModal();
    });

    setTimeout(function () {
      const input = backdrop.querySelector("#summaryValue");
      if (input) input.focus();
    }, 0);
  }

  async function resetSummaryCard(cardKey) {
    const def = SUMMARY_CARD_DEFS.find(function (d) { return d.key === cardKey; });
    const card = getSummaryCard(cardKey);
    if (!def) return;

    if (card && !card.is_manual) {
      toast("This card is already auto-calculated", "fa-circle-info");
      return;
    }

    const confirmed = window.confirm('Reset "' + (card ? card.label : def.key) + '" back to its auto-calculated value?');
    if (!confirmed) return;

    try {
      await api().request("DELETE", "/projects/" + state.projectId + "/resource-summary-cards/" + cardKey);
      toast("Card reset to auto-calculated value", "fa-rotate-left");
      await loadAllData();
    } catch (err) {
      showError(err, "Failed to reset summary card");
    }
  }

  function renderMaterialsTable() {
    const section = document.getElementById("materials");
    if (!section) return;

    const cardBody = section.querySelector(".card-body");
    if (!cardBody) return;

    const materials = byType("material");

    if (!materials.length) {
      cardBody.innerHTML = `
        <div class="resource-empty">
          <i class="fa-solid fa-box-open"></i>
          <p>No material records found.</p>
          ${buttonHTML("fa-plus", "Add Material", "btn-primary-lite", 'data-resource-add="material"')}
        </div>
      `;
      return;
    }

    const totals = computeMaterialsTotals(materials);

    cardBody.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col" class="sno-col">S.No.</th>
            <th scope="col">Material</th>
            <th scope="col">Unit</th>
            <th scope="col" class="num">Total Capacity</th>
            <th scope="col" class="num">Allocated</th>
            <th scope="col" class="num">Remaining</th>
            <th scope="col">Status</th>
            <th scope="col" class="num">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${materials
            .map(function (item, idx) {
              const status = getStatusForMaterial(item);

              return `
                <tr data-resource-id="${escapeAttr(item.id)}">
                  <td class="sno-cell">${idx + 1}</td>
                  <td>${escapeHTML(item.name)}</td>
                  <td>${escapeHTML(item.unit || "")}</td>
                  <td class="num">${formatNumber(item.total_capacity)}</td>
                  <td class="num">${formatNumber(item.allocated_quantity || 0)}</td>
                  <td class="num">${formatNumber(item.remaining_capacity ?? item.total_capacity)}</td>
                  <td>
                    <span class="status-chip ${status.className}">
                      <i class="fa-solid ${status.icon}"></i> ${escapeHTML(status.text)}
                    </span>
                  </td>
                  <td>
                    <div class="resource-action-cell">
                      <button type="button" title="Edit" data-resource-edit="${escapeAttr(item.id)}">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button type="button" title="Delete" class="danger" data-resource-delete="${escapeAttr(item.id)}">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
          <tr class="resource-total-row">
            <td></td>
            <td>Total</td>
            <td></td>
            <td class="num">${formatNumber(totals.total_capacity)}</td>
            <td class="num">${formatNumber(totals.allocated)}</td>
            <td class="num">${formatNumber(totals.remaining)}</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function renderHdpePipeStockTable() {
    const section = document.getElementById("materials");
    if (!section) return;

    let card = document.getElementById("hdpePipeStockCard");

    if (!card) {
      card = document.createElement("div");
      card.id = "hdpePipeStockCard";
      card.className = "card resource-report-card";
      section.appendChild(card);
    }

    const rows = nonTotalRows(state.hdpeStock);

    const tableOrEmpty = !rows.length
      ? `
        <div class="resource-empty">
          <i class="fa-solid fa-box-open"></i>
          <p>No HDPE pipe stock records found.</p>
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="hdpe"')}
        </div>
      `
      : (function () {
          const totals = computeHdpeTotals(rows);

          return `
        <table class="data-table resource-report-table">
          <thead>
            <tr>
              <th scope="col" class="sno-col">S.No.</th>
              <th scope="col">Diameter</th>
              <th scope="col" class="num">Received (m)</th>
              <th scope="col" class="num">Used (m)</th>
              <th scope="col" class="num">Stock (m)</th>
              <th scope="col">Cover</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(function (item, idx) {
              const cover = getCoverDisplay(item);

              return `
                <tr data-report-id="${escapeAttr(item.id)}">
                  <td class="sno-cell">${idx + 1}</td>
                  <td>${escapeHTML(item.diameter)}</td>
                  <td class="num">${formatNumber(item.received_m)}</td>
                  <td class="num">${formatNumber(item.used_m)}</td>
                  <td class="num">${formatNumber(item.stock_m)}</td>
                  <td>
                    <span class="status-chip ${cover.className}">
                      <i class="fa-solid ${cover.icon}"></i> ${escapeHTML(cover.text)}
                    </span>
                  </td>
                  <td>
                    <div class="resource-action-cell">
                      <button type="button" title="Edit" data-report-edit="${escapeAttr(item.id)}" data-report-type="hdpe">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button type="button" title="Delete" class="danger" data-report-delete="${escapeAttr(item.id)}" data-report-type="hdpe">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
            <tr class="resource-total-row">
              <td></td>
              <td>Total</td>
              <td class="num">${formatNumber(totals.received_m)}</td>
              <td class="num">${formatNumber(totals.used_m)}</td>
              <td class="num">${formatNumber(totals.stock_m)}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      `;
        })();

    card.innerHTML = `
      <div class="resource-report-heading-row">
        <div class="resource-report-heading">
          <h3>HDPE Pipe Stock</h3>
          <p>Received, used and available HDPE pipe stock summary</p>
        </div>
        <div class="resource-actions">
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="hdpe"')}
        </div>
      </div>

      <div class="card-body table-scroll">
        ${tableOrEmpty}
      </div>
    `;
  }

  function renderEquipmentDeploymentTable() {
    const section = document.getElementById("equipment");
    if (!section) return;

    let card = document.getElementById("equipmentDeploymentCard");

    if (!card) {
      card = document.createElement("div");
      card.id = "equipmentDeploymentCard";
      card.className = "card resource-report-card";
      section.appendChild(card);
    }

    const rows = nonTotalRows(state.equipmentDeployments);

    const tableOrEmpty = !rows.length
      ? `
        <div class="resource-empty">
          <i class="fa-solid fa-truck-monster"></i>
          <p>No equipment deployment records found.</p>
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="equipmentDeployment"')}
        </div>
      `
      : (function () {
          const totals = computeEquipmentDeploymentTotals(rows);

          return `
        <table class="data-table resource-report-table">
          <thead>
            <tr>
              <th scope="col" class="sno-col">S.No.</th>
              <th scope="col">Category</th>
              <th scope="col" class="num">Planned</th>
              <th scope="col" class="num">Deployed</th>
              <th scope="col" class="num">Variance</th>
              <th scope="col">Remarks</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(function (item, idx) {
              return `
                <tr data-report-id="${escapeAttr(item.id)}">
                  <td class="sno-cell">${idx + 1}</td>
                  <td>${escapeHTML(item.category)}</td>
                  <td class="num">${formatNumber(item.planned)}</td>
                  <td class="num">${formatNumber(item.deployed)}</td>
                  <td class="num">${formatNumber(item.variance)}</td>
                  <td class="remarks-cell">${escapeHTML(item.remarks || "—")}</td>
                  <td>
                    <div class="resource-action-cell">
                      <button type="button" title="Edit" data-report-edit="${escapeAttr(item.id)}" data-report-type="equipmentDeployment">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button type="button" title="Delete" class="danger" data-report-delete="${escapeAttr(item.id)}" data-report-type="equipmentDeployment">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
            <tr class="resource-total-row">
              <td></td>
              <td>Total</td>
              <td class="num">${formatNumber(totals.planned)}</td>
              <td class="num">${formatNumber(totals.deployed)}</td>
              <td class="num">${formatNumber(totals.variance)}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      `;
        })();

    card.innerHTML = `
      <div class="resource-report-heading-row">
        <div class="resource-report-heading">
          <h3>Equipment Deployment (Month 2026)</h3>
          <p>Planned versus deployed equipment summary</p>
        </div>
        <div class="resource-actions">
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="equipmentDeployment"')}
        </div>
      </div>

      <div class="card-body table-scroll">
        ${tableOrEmpty}
      </div>
    `;
  }

  function renderManpowerProgressCards() {
    const section = document.getElementById("manpower");
    if (!section) return;

    let grid = document.getElementById("manpowerProgressCards");

    if (!grid) {
      grid = document.createElement("div");
      grid.id = "manpowerProgressCards";
      grid.className = "grid grid-4 resource-manpower-kpis";

      const chartCard =
        section.querySelector(".manpower-chart-card") ||
        section.querySelector(".card");

      section.insertBefore(grid, chartCard);
    }

    grid.innerHTML = MANPOWER_PROGRESS.map(function(item) {
      return `
        <div class="card kpi-card card-accent card-accent--${item.accent}">
          <div class="kpi-card__top">
            <div class="kpi-card__label">${escapeHTML(item.label)}</div>

            <div class="kpi-card__icon ${item.iconTone}">
              <i class="fa-solid ${item.icon}"></i>
            </div>
          </div>

          <div class="kpi-card__value">${escapeHTML(item.value)}</div>

          <div class="kpi-card__delta flat">
            ${escapeHTML(item.note)}
          </div>
        </div>
      `;
    }).join("");
  }

  // Builds an array of { name, total, categories: { categoryLabel: headcount } }
  // from state.workforceRows (forward-filling blank group cells), so the
  // Manpower chart always mirrors whatever the Workforce By Employer table
  // currently holds in the database.
  function buildWorkforceGroups() {
    const groups = [];
    let current = null;

    nonTotalRows(state.workforceRows).forEach(function (row) {
      if (row.group_name) {
        current = { name: row.group_name, total: 0, categories: {} };
        groups.push(current);
      }

      if (!current) return;

      const cat = row.category || "Other";
      current.categories[cat] = (current.categories[cat] || 0) + Number(row.headcount || 0);
      current.total += Number(row.headcount || 0);
    });

    return groups;
  }

  function renderManpowerChart() {
    const el = document.getElementById("manpowerChart");
    if (!el || !window.Chart) return;

    const groups = buildWorkforceGroups();

    const categoryOrder = [];
    groups.forEach(function (group) {
      Object.keys(group.categories).forEach(function (cat) {
        if (categoryOrder.indexOf(cat) === -1) categoryOrder.push(cat);
      });
    });

    const cssVar = function (name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    };

    const palette = [
      cssVar("--color-primary") || "#2563EB",
      cssVar("--color-secondary") || "#7C3AED",
      cssVar("--color-warning") || "#D97706",
      cssVar("--color-success") || "#059669",
      "#0EA5E9",
      "#F97316",
      "#14B8A6",
      "#EC4899"
    ];

    const labels = groups.map(function (group) {
      return group.name;
    });

    const datasets = categoryOrder.map(function (cat, idx) {
      return {
        label: cat,
        data: groups.map(function (group) {
          return group.categories[cat] || 0;
        }),
        backgroundColor: palette[idx % palette.length],
        borderRadius: 4,
        maxBarThickness: 46
      };
    });

    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    state.chart = new Chart(el, {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["No workforce data"],
        datasets: datasets.length ? datasets : [{ label: "Headcount", data: [0], backgroundColor: palette[0] }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            stacked: true,
            grid: { display: false }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle"
            }
          },
          tooltip: {
            callbacks: {
              afterBody: function (items) {
                if (!items.length) return "";
                const group = groups[items[0].dataIndex];
                return group ? "Total: " + group.total : "";
              }
            }
          }
        }
      }
    });
  }

  // NOTE: the old "Manpower" (Resource type=manpower) list card — which
  // always rendered an empty "No manpower records found / Add Manpower"
  // placeholder since no manpower-type Resources were ever populated —
  // has been intentionally removed. Workforce headcount is fully covered
  // by the Workforce By Employer table below.
  function removeLegacyManpowerListCard() {
    const section = document.getElementById("manpower");
    if (!section) return;
    const legacy = section.querySelector(".manpower-list-card");
    if (legacy) legacy.remove();
  }

  function renderWorkforceByEmployerTable() {
    const section = document.getElementById("manpower");
    if (!section) return;

    let card = document.getElementById("workforceByEmployerCard");

    if (!card) {
      card = document.createElement("div");
      card.id = "workforceByEmployerCard";
      card.className = "card resource-report-card";
      section.appendChild(card);
    }

    const rows = nonTotalRows(state.workforceRows);

    const tableOrEmpty = !rows.length
      ? `
        <div class="resource-empty">
          <i class="fa-solid fa-people-group"></i>
          <p>No workforce records found.</p>
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="workforce"')}
        </div>
      `
      : (function () {
          const total = computeWorkforceTotals(rows);

          return `
        <table class="data-table resource-report-table">
          <thead>
            <tr>
              <th scope="col" class="sno-col">S.No.</th>
              <th scope="col">Group</th>
              <th scope="col">Category</th>
              <th scope="col" class="num">Headcount</th>
              <th scope="col" class="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(function (item, idx) {
              return `
                <tr data-report-id="${escapeAttr(item.id)}">
                  <td class="sno-cell">${idx + 1}</td>
                  <td>${escapeHTML(item.group_name)}</td>
                  <td>${escapeHTML(item.category)}</td>
                  <td class="num">${formatNumber(item.headcount)}</td>
                  <td>
                    <div class="resource-action-cell">
                      <button type="button" title="Edit" data-report-edit="${escapeAttr(item.id)}" data-report-type="workforce">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button type="button" title="Delete" class="danger" data-report-delete="${escapeAttr(item.id)}" data-report-type="workforce">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
            <tr class="resource-total-row">
              <td></td>
              <td>Total</td>
              <td></td>
              <td class="num">${formatNumber(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      `;
        })();

    card.innerHTML = `
      <div class="resource-report-heading-row">
        <div class="resource-report-heading">
          <h3>Workforce</h3>
          <p>Employer, category and headcount breakdown</p>
        </div>
        <div class="resource-actions">
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="workforce"')}
        </div>
      </div>

      <div class="card-body table-scroll">
        ${tableOrEmpty}
      </div>
    `;
  }

  function injectSectionActions() {
    [
      { id: "materials", type: "material" },
      { id: "equipment", type: "equipment" },
      { id: "manpower", type: "manpower" }
    ].forEach(function (item) {
      const section = document.getElementById(item.id);
      if (!section) return;

      const heading = section.querySelector(".section-heading");
      if (!heading || heading.closest(".resource-heading-row")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "resource-heading-row";

      heading.parentNode.insertBefore(wrapper, heading);
      wrapper.appendChild(heading);

      const actions = document.createElement("div");
      actions.className = "resource-actions";
      actions.innerHTML = buttonHTML(
        "fa-plus",
        "Add " + RESOURCE_TYPES[item.type].label,
        "btn-primary-lite",
        'data-resource-add="' + item.type + '"'
      );

      wrapper.appendChild(actions);
    });
  }

  function renderAll() {
    updateKPIs();
    renderSummaryCardControls();

    renderMaterialsTable();
    renderHdpePipeStockTable();

    // Note: the 3 Equipment info cards (Dewatering Pumps, Excavators, HDD Rigs)
    // have been intentionally removed from the Equipment section per updated design.
    // Only the Equipment Deployment table (with Remarks) is shown below.
    renderEquipmentDeploymentTable();

    renderManpowerProgressCards();
    renderManpowerChart();
    removeLegacyManpowerListCard();
    renderWorkforceByEmployerTable();
  }

  async function loadAllData() {
    if (!state.projectId) {
      showNoProjectState();
      return;
    }

    try {
      const [resourcesRes, hdpeRes, equipRes, workforceRes, summaryRes] = await Promise.all([
        api().request("GET", "/projects/" + state.projectId + "/resources?limit=200"),
        api().request("GET", REPORT_TYPES.hdpe.listPath(state.projectId)),
        api().request("GET", REPORT_TYPES.equipmentDeployment.listPath(state.projectId)),
        api().request("GET", REPORT_TYPES.workforce.listPath(state.projectId)),
        api().request("GET", "/projects/" + state.projectId + "/resource-summary-cards")
      ]);

      state.resources = Array.isArray(resourcesRes && resourcesRes.data) ? resourcesRes.data : [];
      state.hdpeStock = Array.isArray(hdpeRes && hdpeRes.data) ? hdpeRes.data : [];
      state.equipmentDeployments = Array.isArray(equipRes && equipRes.data) ? equipRes.data : [];
      state.workforceRows = Array.isArray(workforceRes && workforceRes.data) ? workforceRes.data : [];
      state.summaryCards = Array.isArray(summaryRes && summaryRes.data) ? summaryRes.data : [];

      clearDashboardError();
      renderAll();
    } catch (err) {
      showError(err, "Failed to load resource dashboard data");
      showDashboardError(err.message || "Failed to load resource dashboard data");
      renderAll();
    }
  }

  function showNoProjectState() {
    showDashboardError(
      "No project is selected. Add a project in the database and store it in localStorage as current_project, or expose GET /projects so the dashboard can auto-select the first project."
    );
  }

  function showDashboardError(message) {
    const main = document.querySelector(".main-content");
    if (!main) return;

    let box = document.getElementById("resourceDashboardError");

    if (!box) {
      box = document.createElement("div");
      box.id = "resourceDashboardError";
      box.className = "card";
      box.style.marginBottom = "16px";
      main.insertBefore(box, main.firstChild);
    }

    box.innerHTML = `
      <div class="card-body">
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>${escapeHTML(message)}</p>
        </div>
      </div>
    `;
  }

  function clearDashboardError() {
    const box = document.getElementById("resourceDashboardError");
    if (box) box.remove();
  }

  // ----------------------------------------------------------------------
  // Materials / Equipment / Manpower (Resource) Add/Edit modal.
  // "Allocated Quantity" and "Remaining Capacity" are shown as DISABLED,
  // auto-calculating fields — they are derived server-side from active
  // Allocation records against this resource and cannot be typed in
  // directly. Remaining live-updates as you edit Total Capacity, using
  // the currently-known Allocated Quantity (unaffected by this form).
  //
  // For type === "material", a Status chip field (preset dropdown +
  // custom-label input) is also shown, persisting to status_override.
  // ----------------------------------------------------------------------
  function openResourceModal(type, resource) {
    const isEdit = Boolean(resource);
    const config = RESOURCE_TYPES[type] || RESOURCE_TYPES.material;

    const allocatedQty = Number((resource && resource.allocated_quantity) || 0);
    const initialTotal = resource && resource.total_capacity ? Number(resource.total_capacity) : "";
    const initialRemaining = resource && resource.remaining_capacity !== undefined && resource.remaining_capacity !== null
      ? Number(resource.remaining_capacity)
      : (initialTotal !== "" ? initialTotal - allocatedQty : "");

    const existingStatusOverride = (resource && resource.status_override) || "";
    const statusIsPreset = STATUS_PRESETS.indexOf(existingStatusOverride) !== -1;
    const statusMode = !existingStatusOverride ? "auto" : (statusIsPreset ? existingStatusOverride : "custom");

    closeResourceModal();

    const backdrop = document.createElement("div");
    backdrop.className = "resource-modal-backdrop";
    backdrop.id = "resourceModalBackdrop";

    const statusFieldHTML = `
      <div class="resource-form-field full" data-status-field-wrapper style="${type === "material" ? "" : "display:none;"}">
        <label for="resourceStatusMode">Status</label>
        <span class="field-hint">Choose a preset, or "Custom label…" to type your own. "Auto" keeps deriving Status from Remaining vs. Total Capacity.</span>
        <div class="resource-chip-field__row">
          <select id="resourceStatusMode" name="status_mode">
            <option value="auto" ${statusMode === "auto" ? "selected" : ""}>Auto (calculated)</option>
            ${STATUS_PRESETS.map(function (preset) {
              return `<option value="${escapeAttr(preset)}" ${statusMode === preset ? "selected" : ""}>${escapeHTML(preset)}</option>`;
            }).join("")}
            <option value="custom" ${statusMode === "custom" ? "selected" : ""}>Custom label…</option>
          </select>
        </div>
        <input
          type="text"
          id="resourceStatusCustom"
          name="status_custom"
          maxlength="50"
          placeholder="Type a custom status label"
          class="resource-chip-field__custom"
          style="${statusMode === "custom" ? "" : "display:none;"}"
          value="${escapeAttr(statusMode === "custom" ? existingStatusOverride : "")}"
        />
      </div>
    `;

    backdrop.innerHTML = `
      <div class="resource-modal" role="dialog" aria-modal="true" aria-labelledby="resourceModalTitle">
        <div class="resource-modal__header">
          <h3 id="resourceModalTitle">${isEdit ? "Edit" : "Add"} ${config.label}</h3>
          <button type="button" class="icon-btn" data-resource-modal-close aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="resourceForm">
          <div class="resource-modal__body">
            <div class="resource-form-grid">
              <div class="resource-form-field full">
                <label for="resourceName">Name</label>
                <input id="resourceName" name="name" type="text" required maxlength="200" value="${escapeAttr(resource && resource.name ? resource.name : "")}" />
              </div>

              <div class="resource-form-field">
                <label for="resourceType">Type</label>
                <select id="resourceType" name="type" required>
                  <option value="material" ${type === "material" ? "selected" : ""}>Material</option>
                  <option value="equipment" ${type === "equipment" ? "selected" : ""}>Equipment</option>
                  <option value="manpower" ${type === "manpower" ? "selected" : ""}>Manpower</option>
                </select>
              </div>

              <div class="resource-form-field">
                <label for="resourceUnit">Unit</label>
                <input id="resourceUnit" name="unit" type="text" required maxlength="20" value="${escapeAttr((resource && resource.unit) || config.defaultUnit)}" />
              </div>

              <div class="resource-form-field">
                <label for="resourceCapacity">Total Capacity / Quantity</label>
                <input id="resourceCapacity" name="total_capacity" type="number" step="0.01" min="0.01" required value="${escapeAttr(initialTotal)}" />
              </div>

              <div class="resource-form-field">
                <label for="resourceAllocated">Allocated Quantity</label>
                <span class="field-hint">Auto-calculated from active allocations</span>
                <input id="resourceAllocated" type="number" step="0.01" value="${escapeAttr(allocatedQty)}" disabled />
              </div>

              <div class="resource-form-field">
                <label for="resourceRemaining">Remaining Capacity</label>
                <span class="field-hint">Auto-calculated: Total Capacity − Allocated</span>
                <input id="resourceRemaining" type="number" step="0.01" value="${escapeAttr(initialRemaining)}" disabled />
              </div>

              ${statusFieldHTML}

              <div class="resource-form-field full">
                <label for="resourceNotes">Notes</label>
                <textarea id="resourceNotes" name="notes" maxlength="1000">${escapeHTML(resource && resource.notes ? resource.notes : "")}</textarea>
              </div>
            </div>
          </div>

          <div class="resource-modal__footer">
            <button type="button" class="btn-ghost" data-resource-modal-close>Cancel</button>
            <button type="submit" class="btn-primary-lite">
              <i class="fa-solid fa-floppy-disk"></i> ${isEdit ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    const form = backdrop.querySelector("#resourceForm");
    const capacityInput = backdrop.querySelector("#resourceCapacity");
    const remainingInput = backdrop.querySelector("#resourceRemaining");
    const typeSelect = backdrop.querySelector("#resourceType");
    const statusWrapper = backdrop.querySelector("[data-status-field-wrapper]");
    const statusModeSelect = backdrop.querySelector("#resourceStatusMode");
    const statusCustomInput = backdrop.querySelector("#resourceStatusCustom");

    // Live-update Remaining Capacity as Total Capacity changes, using the
    // currently known Allocated Quantity (this form never changes that).
    capacityInput.addEventListener("input", function () {
      const total = Number(capacityInput.value || 0);
      remainingInput.value = (total - allocatedQty).toFixed(2);
    });

    // The Status chip field is only meaningful for materials — show/hide
    // it live as the user switches the Type dropdown.
    typeSelect.addEventListener("change", function () {
      statusWrapper.style.display = typeSelect.value === "material" ? "" : "none";
    });

    statusModeSelect.addEventListener("change", function () {
      statusCustomInput.style.display = statusModeSelect.value === "custom" ? "" : "none";
      if (statusModeSelect.value === "custom") statusCustomInput.focus();
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      let statusOverride = null;
      if (form.type.value === "material") {
        if (statusModeSelect.value === "custom") {
          statusOverride = statusCustomInput.value.trim() || null;
        } else if (statusModeSelect.value !== "auto") {
          statusOverride = statusModeSelect.value;
        }
      }

      const payload = {
        name: form.name.value.trim(),
        type: form.type.value,
        unit: form.unit.value.trim(),
        total_capacity: Number(form.total_capacity.value),
        notes: form.notes.value.trim() || undefined,
        status_override: statusOverride
      };

      try {
        if (isEdit) {
          await api().request("PUT", "/resources/" + resource.id, payload);
          toast(config.label + " updated successfully");
        } else {
          await api().request("POST", "/projects/" + state.projectId + "/resources", payload);
          toast(RESOURCE_TYPES[payload.type].label + " added successfully");
        }

        closeResourceModal();
        clearDashboardError();
        await loadAllData();
      } catch (err) {
        showError(err, "Failed to " + (isEdit ? "update" : "create") + " resource");
      } finally {
        submitBtn.disabled = false;
      }
    });

    backdrop.querySelectorAll("[data-resource-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", closeResourceModal);
    });

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) closeResourceModal();
    });

    setTimeout(function () {
      const input = backdrop.querySelector("#resourceName");
      if (input) input.focus();
    }, 0);
  }

  function reportFieldValue(record, field) {
    if (!record) return "";
    const v = record[field.key];
    if (v === null || v === undefined) return "";
    return v;
  }

  function buildReportFormFieldHTML(field, record) {
    const value = reportFieldValue(record, field);
    const idAttr = "reportField_" + field.key;
    const fullClass = field.full ? "full" : "";
    const disabledAttr = field.computed ? "disabled" : "";
    const hintHTML = field.hint ? `<span class="field-hint">${escapeHTML(field.hint)}</span>` : "";

    if (field.chip) {
      return buildChipFieldHTML(field, record, idAttr, fullClass, hintHTML);
    }

    if (field.type === "textarea") {
      return `
        <div class="resource-form-field ${fullClass}">
          <label for="${idAttr}">${escapeHTML(field.label)}</label>
          ${hintHTML}
          <textarea id="${idAttr}" name="${field.key}" maxlength="500" ${field.required ? "required" : ""} ${disabledAttr}>${escapeHTML(value)}</textarea>
        </div>
      `;
    }

    if (field.type === "number") {
      return `
        <div class="resource-form-field ${fullClass}">
          <label for="${idAttr}">${escapeHTML(field.label)}</label>
          ${hintHTML}
          <input id="${idAttr}" name="${field.key}" type="number" step="${field.step || "1"}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.required ? "required" : ""} value="${escapeAttr(value)}" ${disabledAttr} />
        </div>
      `;
    }

    return `
      <div class="resource-form-field ${fullClass}">
        <label for="${idAttr}">${escapeHTML(field.label)}</label>
        ${hintHTML}
        <input id="${idAttr}" name="${field.key}" type="text" maxlength="200" ${field.required ? "required" : ""} value="${escapeAttr(value)}" ${disabledAttr} />
      </div>
    `;
  }

  // Renders a preset-dropdown + custom-label input pair for a "chip"
  // field (e.g. HDPE "Cover"). The dropdown offers "Auto (calculated)",
  // each preset in field.presets, and "Custom label…"; the hidden text
  // input only appears when "Custom label…" is chosen.
  function buildChipFieldHTML(field, record, idAttr, fullClass, hintHTML) {
    const overrideKey = field.key + "_override";
    const existingOverride = (record && record[overrideKey]) || "";
    const isPreset = field.presets.indexOf(existingOverride) !== -1;
    const mode = !existingOverride ? "auto" : (isPreset ? existingOverride : "custom");

    return `
      <div class="resource-form-field ${fullClass}">
        <label for="${idAttr}_mode">${escapeHTML(field.label)}</label>
        ${hintHTML}
        <div class="resource-chip-field__row">
          <select id="${idAttr}_mode" name="${field.key}_mode" data-chip-field="${escapeAttr(field.key)}">
            <option value="auto" ${mode === "auto" ? "selected" : ""}>Auto (calculated)</option>
            ${field.presets.map(function (preset) {
              return `<option value="${escapeAttr(preset)}" ${mode === preset ? "selected" : ""}>${escapeHTML(preset)}</option>`;
            }).join("")}
            <option value="custom" ${mode === "custom" ? "selected" : ""}>Custom label…</option>
          </select>
          <span class="resource-chip-field__preview" data-chip-preview="${escapeAttr(field.key)}"></span>
        </div>
        <input
          type="text"
          id="${idAttr}_custom"
          name="${field.key}_custom"
          maxlength="50"
          placeholder="Type a custom ${escapeAttr(field.label.toLowerCase())} label"
          class="resource-chip-field__custom"
          style="${mode === "custom" ? "" : "display:none;"}"
          value="${escapeAttr(mode === "custom" ? existingOverride : "")}"
        />
      </div>
    `;
  }

  // Wires up live-recalculation for any `computed: true` fields in a
  // report modal (e.g. Stock for HDPE, Variance for Equipment
  // Deployment), plus show/hide + auto-preview behavior for any `chip:
  // true` fields (e.g. Cover for HDPE), so the modal always updates
  // immediately as the user edits the source fields it depends on.
  function attachComputedFieldListeners(form, reportType) {
    const computedFns = COMPUTED_VALUE_FNS[reportType] || {};
    const previewFns = CHIP_AUTO_PREVIEW_FNS[reportType] || {};

    function recompute() {
      const values = {};
      Array.from(form.elements).forEach(function (el) {
        if (el.name) values[el.name] = el.value;
      });

      Object.keys(computedFns).forEach(function (key) {
        const target = document.getElementById("reportField_" + key);
        if (target) target.value = computedFns[key](values);
      });

      Object.keys(previewFns).forEach(function (key) {
        const previewEl = form.querySelector('[data-chip-preview="' + key + '"]');
        if (previewEl) previewEl.textContent = "Auto would show: " + previewFns[key](values);
      });
    }

    // Wire up show/hide of each chip field's custom input.
    form.querySelectorAll("[data-chip-field]").forEach(function (select) {
      const key = select.getAttribute("data-chip-field");
      const customInput = document.getElementById("reportField_" + key + "_custom");

      select.addEventListener("change", function () {
        if (!customInput) return;
        customInput.style.display = select.value === "custom" ? "" : "none";
        if (select.value === "custom") customInput.focus();
      });
    });

    form.addEventListener("input", recompute);
    recompute();
  }

  /** Generic Add/Edit modal for the 3 DB-backed report tables (HDPE Pipe
   * Stock, Equipment Deployment, Workforce By Employer). Fields are driven
   * entirely by REPORT_TYPES[reportType].fields so each table gets its own
   * form shape while sharing the exact same modal UX as Resources.
   * Fields marked `computed: true` are excluded from the submitted
   * payload — the backend always derives them itself. Fields marked
   * `chip: true` submit as "<key>_override" (null when "Auto" is chosen). */
  function openReportModal(reportType, record) {
    const config = REPORT_TYPES[reportType];
    if (!config) return;

    const isEdit = Boolean(record && record.id);

    closeResourceModal();

    const backdrop = document.createElement("div");
    backdrop.className = "resource-modal-backdrop";
    backdrop.id = "resourceModalBackdrop";

    backdrop.innerHTML = `
      <div class="resource-modal" role="dialog" aria-modal="true" aria-labelledby="reportModalTitle">
        <div class="resource-modal__header">
          <h3 id="reportModalTitle">${isEdit ? "Edit" : "Add"} ${config.label}</h3>
          <button type="button" class="icon-btn" data-resource-modal-close aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="reportForm">
          <div class="resource-modal__body">
            <div class="resource-form-grid">
              ${config.fields.map(function (field) { return buildReportFormFieldHTML(field, record); }).join("")}
            </div>
          </div>

          <div class="resource-modal__footer">
            <button type="button" class="btn-ghost" data-resource-modal-close>Cancel</button>
            <button type="submit" class="btn-primary-lite">
              <i class="fa-solid fa-floppy-disk"></i> ${isEdit ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    const form = backdrop.querySelector("#reportForm");

    attachComputedFieldListeners(form, reportType);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {};

      config.fields.forEach(function (field) {
        // Computed fields are display-only; the backend always derives
        // them itself, so we never send them in the payload.
        if (field.computed) return;

        if (field.chip) {
          const modeSelect = form.elements[field.key + "_mode"];
          const customInput = form.elements[field.key + "_custom"];
          const mode = modeSelect ? modeSelect.value : "auto";

          if (mode === "custom") {
            payload[field.key + "_override"] = (customInput && customInput.value.trim()) || null;
          } else if (mode !== "auto") {
            payload[field.key + "_override"] = mode;
          } else {
            payload[field.key + "_override"] = null;
          }
          return;
        }

        const el = form.elements[field.key];
        const raw = el ? el.value : "";

        if (field.type === "number") {
          if (raw === "" || raw === null) {
            payload[field.key] = field.required ? 0 : null;
          } else {
            payload[field.key] = Number(raw);
          }
        } else {
          const trimmed = (raw || "").trim();
          payload[field.key] = trimmed === "" ? (field.required ? "" : null) : trimmed;
        }
      });

      try {
        if (isEdit) {
          await api().request("PUT", config.itemPath(record.id), payload);
          toast(config.label + " updated successfully");
        } else {
          await api().request("POST", config.createPath(state.projectId), payload);
          toast(config.label + " added successfully");
        }

        closeResourceModal();
        clearDashboardError();
        await loadAllData();
      } catch (err) {
        showError(err, "Failed to " + (isEdit ? "update" : "create") + " record");
      } finally {
        submitBtn.disabled = false;
      }
    });

    backdrop.querySelectorAll("[data-resource-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", closeResourceModal);
    });

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) closeResourceModal();
    });

    setTimeout(function () {
      const firstInput = backdrop.querySelector(".resource-form-field input:not(:disabled), .resource-form-field textarea:not(:disabled)");
      if (firstInput) firstInput.focus();
    }, 0);
  }

  function closeResourceModal() {
    const modal = document.getElementById("resourceModalBackdrop");
    if (modal) modal.remove();
  }

  async function deleteResource(id) {
    const resource = state.resources.find(function (item) {
      return item.id === id;
    });

    if (!resource) return;

    const confirmed = window.confirm('Delete resource "' + resource.name + '"? This is allowed only if it has no allocations.');

    if (!confirmed) return;

    try {
      await api().request("DELETE", "/resources/" + id);
      toast("Resource deleted successfully", "fa-trash");
      await loadAllData();
    } catch (err) {
      showError(err, "Failed to delete resource");
    }
  }

  function getReportListForType(reportType) {
    if (reportType === "hdpe") return state.hdpeStock;
    if (reportType === "equipmentDeployment") return state.equipmentDeployments;
    if (reportType === "workforce") return state.workforceRows;
    return [];
  }

  async function deleteReportRecord(reportType, id) {
    const config = REPORT_TYPES[reportType];
    if (!config) return;

    const confirmed = window.confirm("Delete this record? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await api().request("DELETE", config.itemPath(id));
      toast("Record deleted successfully", "fa-trash");
      await loadAllData();
    } catch (err) {
      showError(err, "Failed to delete record");
    }
  }

  function initGlobalClicks() {
    document.addEventListener("click", function (event) {
      const addBtn = event.target.closest("[data-resource-add]");

      if (addBtn) {
        const type = addBtn.getAttribute("data-resource-add");
        openResourceModal(type);
        return;
      }

      const editBtn = event.target.closest("[data-resource-edit]");

      if (editBtn) {
        const id = editBtn.getAttribute("data-resource-edit");
        const resource = state.resources.find(function (item) {
          return item.id === id;
        });

        if (resource) openResourceModal(resource.type, resource);
        return;
      }

      const deleteBtn = event.target.closest("[data-resource-delete]");

      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-resource-delete");
        deleteResource(id);
        return;
      }

      const reportAddBtn = event.target.closest("[data-report-add]");

      if (reportAddBtn) {
        const reportType = reportAddBtn.getAttribute("data-report-add");
        openReportModal(reportType);
        return;
      }

      const reportEditBtn = event.target.closest("[data-report-edit]");

      if (reportEditBtn) {
        const reportType = reportEditBtn.getAttribute("data-report-type");
        const id = reportEditBtn.getAttribute("data-report-edit");
        const record = getReportListForType(reportType).find(function (item) {
          return item.id === id;
        });

        if (record) openReportModal(reportType, record);
        return;
      }

      const reportDeleteBtn = event.target.closest("[data-report-delete]");

      if (reportDeleteBtn) {
        const reportType = reportDeleteBtn.getAttribute("data-report-type");
        const id = reportDeleteBtn.getAttribute("data-report-delete");
        deleteReportRecord(reportType, id);
        return;
      }

      const summaryEditBtn = event.target.closest("[data-summary-edit]");

      if (summaryEditBtn) {
        const cardKey = summaryEditBtn.getAttribute("data-summary-edit");
        openSummaryCardModal(cardKey);
        return;
      }

      const summaryResetBtn = event.target.closest("[data-summary-reset]");

      if (summaryResetBtn) {
        const cardKey = summaryResetBtn.getAttribute("data-summary-reset");
        resetSummaryCard(cardKey);
      }
    });
  }

  function initAreaFilter() {
    const select = document.getElementById("areaFilterSelect");
    if (!select) return;

    select.addEventListener("change", function () {
      const value = select.value;

      document.querySelectorAll("#materials tbody tr[data-area]").forEach(function (row) {
        const area = row.getAttribute("data-area");
        row.style.display = value === "all" || area === value ? "" : "none";
      });
    });
  }

  function initExportButton() {
    const exportBtn = Array.from(document.querySelectorAll(".filter-bar button")).find(function (btn) {
      return /export/i.test(btn.textContent || "");
    });

    if (!exportBtn) return;

    exportBtn.addEventListener("click", function () {
      const rows = [
        ["Name", "Type", "Unit", "Total Capacity", "Allocated Quantity", "Remaining Capacity", "Status", "Notes"],
        ...state.resources.map(function (r) {
          return [
            r.name,
            r.type,
            r.unit,
            r.total_capacity,
            r.allocated_quantity || 0,
            r.remaining_capacity ?? r.total_capacity,
            r.status_override || r.status || "",
            r.notes || ""
          ];
        })
      ];

      const csv = rows
        .map(function (row) {
          return row
            .map(function (cell) {
              return '"' + String(cell).replace(/"/g, '""') + '"';
            })
            .join(",");
        })
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "resource-dashboard.csv";
      link.click();

      URL.revokeObjectURL(url);
      toast("Resource data exported", "fa-download");
    });
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/"/g, "&quot;");
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    ensureStyles();
    injectSectionActions();
    initGlobalClicks();
    initExportButton();
    initAreaFilter();

    state.projectId = await resolveProjectId();

    if (!state.projectId) {
      showNoProjectState();
      renderAll();
      return;
    }

    await loadAllData();
  }

  document.addEventListener("wsdp:authready", function () {
    init();
  });

  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      if (!state.initialized && window.WSDP_API) {
        init();
      }
    }, 300);
  });
})();
