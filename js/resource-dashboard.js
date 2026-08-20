/* ============================================================
   resource-dashboard.js
   DB-backed Resource Dashboard CRUD for:
   - Materials            (Resource, type=material)
   - Equipment            (Resource, type=equipment)
   - Manpower             (Resource, type=manpower)
   - HDPE Pipe Stock       (HdpePipeStock)   <- DB-backed, full CRUD
   - Equipment Deployment  (EquipmentDeployment) <- DB-backed, full CRUD
   - Workforce By Employer (WorkforceEmployer)   <- DB-backed, full CRUD

   All data tables in this module include an "S.No." column and full
   Add / Edit / Delete / Update support.

   IMPORTANT — Computed / read-only fields:
   Several columns are DERIVED, not raw input, and are intentionally
   NOT submitted to the backend as editable values:
     - Materials/Equipment/Manpower: "Allocated" and "Remaining" are
       computed server-side from active Allocation records against a
       Resource (Remaining = Total Capacity - Allocated). They cannot
       be typed in directly.
     - HDPE Pipe Stock: "Stock (m)" = Received (m) - Used (m), and
       "Cover" (OK/Watch/Re-order) is derived from Stock vs Received.
     - Equipment Deployment: "Variance" = Planned - Deployed.
   These are shown in the Add/Edit modal as DISABLED, auto-calculating
   fields (updated live as you type the source values) so the numbers
   are visible and understandable, without allowing an inconsistent
   manual override that would desync from the underlying data.

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

  // Field definitions for the 3 DB-backed report tables. Driving the
  // Add/Edit modal generically from this config keeps the CRUD pattern
  // identical for all 3 tables while matching each table's own columns.
  // Fields marked `computed: true` are DISPLAYED (disabled, auto-
  // calculated) but never submitted in the payload.
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
        { key: "cover", label: "Cover", type: "text", computed: true, hint: "Auto-calculated from Stock vs Received" }
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
      },
      cover: function (values) {
        const received = Number(values.received_m || 0);
        const used = Number(values.used_m || 0);
        const stock = received - used;
        if (stock <= 0) return "Re-order";
        if (stock <= received * 0.25) return "Watch";
        return "OK";
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

  let state = {
    projectId: null,
    resources: [],
    hdpeStock: [],
    equipmentDeployments: [],
    workforceRows: [],
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
      }
    `;

    document.head.appendChild(style);
  }

  function getStatusForMaterial(resource) {
    const total = Number(resource.total_capacity || 0);
    const remaining = Number(resource.remaining_capacity ?? total);

    if (remaining <= 0) {
      return {
        className: "crit",
        icon: "fa-circle-exclamation",
        text: "Below Reorder"
      };
    }

    if (remaining <= total * 0.25) {
      return {
        className: "warn",
        icon: "fa-triangle-exclamation",
        text: "Watch"
      };
    }

    return {
      className: "ok",
      icon: "fa-circle-check",
      text: "Adequate"
    };
  }

  function getCoverStatusClass(cover) {
    const normalized = String(cover || "").toLowerCase();

    if (normalized.includes("re-order") || normalized.includes("reorder")) return "crit";
    if (normalized.includes("watch")) return "warn";
    return "ok";
  }

  function getCoverStatusIcon(cover) {
    const normalized = String(cover || "").toLowerCase();

    if (normalized.includes("re-order") || normalized.includes("reorder")) return "fa-circle-exclamation";
    if (normalized.includes("watch")) return "fa-triangle-exclamation";
    return "fa-circle-check";
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

  function computeKPIs() {
    const materials = byType("material");
    const equipment = byType("equipment");
    const manpower = byType("manpower");

    const materialsBelowReorder = materials.filter(function (r) {
      const total = Number(r.total_capacity || 0);
      const remaining = Number(r.remaining_capacity ?? total);
      return remaining <= total * 0.25;
    }).length;

    const equipmentCapacity = equipment.reduce(function (sum, r) {
      return sum + Number(r.total_capacity || 0);
    }, 0);

    const equipmentAllocated = equipment.reduce(function (sum, r) {
      return sum + Number(r.allocated_quantity || 0);
    }, 0);

    const equipmentUtilization = equipmentCapacity > 0
      ? Math.round((equipmentAllocated / equipmentCapacity) * 100)
      : 0;

    const manpowerDeployed = manpower.reduce(function (sum, r) {
      return sum + Number(r.total_capacity || 0);
    }, 0);

    const idleOrMaintenance = equipment.reduce(function (sum, r) {
      const remaining = Number(r.remaining_capacity || 0);
      return sum + remaining;
    }, 0);

    return {
      materialsBelowReorder: materialsBelowReorder,
      equipmentUtilization: equipmentUtilization,
      manpowerDeployed: manpowerDeployed,
      idleOrMaintenance: idleOrMaintenance
    };
  }

  function updateKPIs() {
    const kpis = computeKPIs();
    const countEls = document.querySelectorAll(".kpi-card .count-up");

    if (countEls[0]) countEls[0].textContent = formatNumber(kpis.materialsBelowReorder);
    if (countEls[1]) countEls[1].textContent = formatNumber(kpis.equipmentUtilization);
    if (countEls[2]) countEls[2].textContent = formatNumber(kpis.manpowerDeployed);
    if (countEls[3]) countEls[3].textContent = formatNumber(kpis.idleOrMaintenance);

    const criticalDelta = document.querySelector(".card-accent--critical .kpi-card__delta");

    if (criticalDelta) {
      criticalDelta.innerHTML =
        kpis.materialsBelowReorder > 0
          ? `<i class="fa-solid fa-arrow-down"></i> ${kpis.materialsBelowReorder} material item(s) need attention`
          : `<i class="fa-solid fa-circle-check"></i> No material below reorder`;
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
                      <i class="fa-solid ${status.icon}"></i> ${status.text}
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

    const rows = state.hdpeStock;

    const tableOrEmpty = !rows.length
      ? `
        <div class="resource-empty">
          <i class="fa-solid fa-box-open"></i>
          <p>No HDPE pipe stock records found.</p>
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="hdpe"')}
        </div>
      `
      : `
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
              const statusClass = getCoverStatusClass(item.cover);
              const statusIcon = getCoverStatusIcon(item.cover);

              return `
                <tr data-report-id="${escapeAttr(item.id)}">
                  <td class="sno-cell">${idx + 1}</td>
                  <td>${escapeHTML(item.diameter)}</td>
                  <td class="num">${formatNumber(item.received_m)}</td>
                  <td class="num">${formatNumber(item.used_m)}</td>
                  <td class="num">${formatNumber(item.stock_m)}</td>
                  <td>
                    <span class="status-chip ${statusClass}">
                      <i class="fa-solid ${statusIcon}"></i> ${escapeHTML(item.cover)}
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
          </tbody>
        </table>
      `;

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

    const rows = state.equipmentDeployments;

    const tableOrEmpty = !rows.length
      ? `
        <div class="resource-empty">
          <i class="fa-solid fa-truck-monster"></i>
          <p>No equipment deployment records found.</p>
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="equipmentDeployment"')}
        </div>
      `
      : `
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
                <tr data-report-id="${escapeAttr(item.id)}" class="${item.is_total ? "resource-total-row" : ""}">
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
          </tbody>
        </table>
      `;

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

    state.workforceRows.forEach(function (row) {
      if (row.is_total) return;

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

  function renderManpowerActions() {
    const section = document.getElementById("manpower");
    if (!section) return;

    let list = section.querySelector(".manpower-list-card");

    if (!list) {
      list = document.createElement("div");
      list.className = "card manpower-list-card";
      list.style.marginTop = "16px";
      section.appendChild(list);
    }

    const manpower = byType("manpower");

    list.innerHTML = `
      <div class="card-body table-scroll">
        ${
          manpower.length
            ? `
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="sno-col">S.No.</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th class="num">Total</th>
                    <th class="num">Allocated</th>
                    <th class="num">Remaining</th>
                    <th class="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${manpower
                    .map(function (item, idx) {
                      return `
                        <tr data-resource-id="${escapeAttr(item.id)}">
                          <td class="sno-cell">${idx + 1}</td>
                          <td>${escapeHTML(item.name)}</td>
                          <td>${escapeHTML(item.unit || "")}</td>
                          <td class="num">${formatNumber(item.total_capacity)}</td>
                          <td class="num">${formatNumber(item.allocated_quantity || 0)}</td>
                          <td class="num">${formatNumber(item.remaining_capacity ?? item.total_capacity)}</td>
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
                </tbody>
              </table>
            `
            : `
              <div class="resource-empty">
                <i class="fa-solid fa-people-group"></i>
                <p>No manpower records found.</p>
                ${buttonHTML("fa-plus", "Add Manpower", "btn-primary-lite", 'data-resource-add="manpower"')}
              </div>
            `
        }
      </div>
    `;
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

    const rows = state.workforceRows;

    const tableOrEmpty = !rows.length
      ? `
        <div class="resource-empty">
          <i class="fa-solid fa-people-group"></i>
          <p>No workforce records found.</p>
          ${buttonHTML("fa-plus", "Add Entry", "btn-primary-lite", 'data-report-add="workforce"')}
        </div>
      `
      : `
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
                <tr data-report-id="${escapeAttr(item.id)}" class="${item.is_total ? "resource-total-row" : ""}">
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
          </tbody>
        </table>
      `;

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

    renderMaterialsTable();
    renderHdpePipeStockTable();

    // Note: the 3 Equipment info cards (Dewatering Pumps, Excavators, HDD Rigs)
    // have been intentionally removed from the Equipment section per updated design.
    // Only the Equipment Deployment table (with Remarks) is shown below.
    renderEquipmentDeploymentTable();

    renderManpowerProgressCards();
    renderManpowerChart();
    renderManpowerActions();
    renderWorkforceByEmployerTable();
  }

  async function loadAllData() {
    if (!state.projectId) {
      showNoProjectState();
      return;
    }

    try {
      const [resourcesRes, hdpeRes, equipRes, workforceRes] = await Promise.all([
        api().request("GET", "/projects/" + state.projectId + "/resources?limit=200"),
        api().request("GET", REPORT_TYPES.hdpe.listPath(state.projectId)),
        api().request("GET", REPORT_TYPES.equipmentDeployment.listPath(state.projectId)),
        api().request("GET", REPORT_TYPES.workforce.listPath(state.projectId))
      ]);

      state.resources = Array.isArray(resourcesRes && resourcesRes.data) ? resourcesRes.data : [];
      state.hdpeStock = Array.isArray(hdpeRes && hdpeRes.data) ? hdpeRes.data : [];
      state.equipmentDeployments = Array.isArray(equipRes && equipRes.data) ? equipRes.data : [];
      state.workforceRows = Array.isArray(workforceRes && workforceRes.data) ? workforceRes.data : [];

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
  // ----------------------------------------------------------------------
  function openResourceModal(type, resource) {
    const isEdit = Boolean(resource);
    const config = RESOURCE_TYPES[type] || RESOURCE_TYPES.material;

    const allocatedQty = Number((resource && resource.allocated_quantity) || 0);
    const initialTotal = resource && resource.total_capacity ? Number(resource.total_capacity) : "";
    const initialRemaining = resource && resource.remaining_capacity !== undefined && resource.remaining_capacity !== null
      ? Number(resource.remaining_capacity)
      : (initialTotal !== "" ? initialTotal - allocatedQty : "");

    closeResourceModal();

    const backdrop = document.createElement("div");
    backdrop.className = "resource-modal-backdrop";
    backdrop.id = "resourceModalBackdrop";

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

    // Live-update Remaining Capacity as Total Capacity changes, using the
    // currently known Allocated Quantity (this form never changes that).
    capacityInput.addEventListener("input", function () {
      const total = Number(capacityInput.value || 0);
      remainingInput.value = (total - allocatedQty).toFixed(2);
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        name: form.name.value.trim(),
        type: form.type.value,
        unit: form.unit.value.trim(),
        total_capacity: Number(form.total_capacity.value),
        notes: form.notes.value.trim() || undefined
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

  // Wires up live-recalculation for any `computed: true` fields in a
  // report modal (e.g. Stock/Cover for HDPE, Variance for Equipment
  // Deployment), so the displayed value always updates immediately as
  // the user edits the source fields it depends on, and matches exactly
  // what the backend will compute and persist.
  function attachComputedFieldListeners(form, reportType) {
    const computedFns = COMPUTED_VALUE_FNS[reportType];
    if (!computedFns) return;

    function recompute() {
      const values = {};
      Array.from(form.elements).forEach(function (el) {
        if (el.name) values[el.name] = el.value;
      });

      Object.keys(computedFns).forEach(function (key) {
        const el = form.elements["reportField_" + key] || form.querySelector(`[name="${key}"]`);
        const target = document.getElementById("reportField_" + key);
        if (target) target.value = computedFns[key](values);
      });
    }

    form.addEventListener("input", recompute);
    recompute();
  }

  /** Generic Add/Edit modal for the 3 DB-backed report tables (HDPE Pipe
   * Stock, Equipment Deployment, Workforce By Employer). Fields are driven
   * entirely by REPORT_TYPES[reportType].fields so each table gets its own
   * form shape while sharing the exact same modal UX as Resources.
   * Fields marked `computed: true` are rendered disabled and are excluded
   * from the submitted payload — the backend always derives them itself. */
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
        ["Name", "Type", "Unit", "Total Capacity", "Allocated Quantity", "Remaining Capacity", "Notes"],
        ...state.resources.map(function (r) {
          return [
            r.name,
            r.type,
            r.unit,
            r.total_capacity,
            r.allocated_quantity || 0,
            r.remaining_capacity ?? r.total_capacity,
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
