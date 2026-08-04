/* ============================================================
   resource-dashboard.js
   DB-backed Resource Dashboard CRUD for:
   - Materials
   - Equipment
   - Manpower

   Added reporting sections:
   - HDPE Pipe Stock (May 2026)
   - Equipment Deployment (May 2026)
   - Manpower KPI cards
   - Workforce By Employer

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

  const HDPE_PIPE_STOCK = [
    { diameter: "De20 PN16", received: 41100, used: 1200, stock: 39900, cover: "OK" },
    { diameter: "De25 PN16", received: 44844, used: 7200, stock: 37644, cover: "OK" },
    { diameter: "De63 PN10", received: 32784, used: 12960, stock: 19824, cover: "OK" },
    { diameter: "De75 PN10", received: 1968, used: 0, stock: 1968, cover: "OK" },
    { diameter: "De90 PN10", received: 7728, used: 4836, stock: 2892, cover: "Watch" },
    { diameter: "De110 PN10", received: 3420, used: 1032, stock: 2388, cover: "OK" },
    { diameter: "De160 PN10", received: 6860, used: 912, stock: 5948, cover: "OK" },
    { diameter: "De200 PN10", received: 4896, used: 1152, stock: 3744, cover: "OK" },
    { diameter: "De250 PN10", received: 2592, used: 1964, stock: 628, cover: "Re-order" },
    { diameter: "De315 PN10", received: 1872, used: 888, stock: 984, cover: "OK" },
    { diameter: "De110 PN16", received: 12, used: 0, stock: 12, cover: "OK" },
    { diameter: "De160 PN16", received: 300, used: 0, stock: 300, cover: "OK" }
  ];

  const EQUIPMENT_DEPLOYMENT = [
    { category: "Earthmoving (Excavator, dump truck, backhoe)", planned: null, deployed: 4, variance: null },
    { category: "Welding (Butt fusion, manual, handheld)", planned: null, deployed: 11, variance: null },
    { category: "Generators (30/15/10/2.5 kW)", planned: null, deployed: 5, variance: null },
    { category: "Light Vehicles (Pickups + truck)", planned: null, deployed: 7, variance: null },
    { category: "Tamping, cutting, grinder, jackhammer", planned: null, deployed: 12, variance: null },
    { category: "Survey (GPS, level)", planned: null, deployed: 2, variance: null },
    { category: "Test equipment (Pump, tanks)", planned: null, deployed: 3, variance: null },
    { category: "Other", planned: null, deployed: 2, variance: null },
    { category: "TOTAL", planned: 61, deployed: 46, variance: -15, isTotal: true }
  ];

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

  const WORKFORCE_BY_EMPLOYER = [
    { group: "CTCE Direct (17)", category: "Construction Manager", headcount: 1 },
    { group: "", category: "Site Engineers", headcount: 2 },
    { group: "", category: "Land Surveyor", headcount: 1 },
    { group: "", category: "HSE Officer + Assistant", headcount: 2 },
    { group: "", category: "Social Expert + Assistants", headcount: 9 },
    { group: "", category: "Other Specialists", headcount: 2 },
    { group: "XINYI Subcontractor (58)", category: "Skilled", headcount: 4 },
    { group: "", category: "Unskilled", headcount: 54 },
    { group: "SHIGUO Subcontractor (40)", category: "Skilled", headcount: 4 },
    { group: "", category: "Unskilled", headcount: 36 },
    { group: "Grand Total", category: "", headcount: 115, isTotal: true }
  ];

  const FALLBACK_PAYMENT_TRACKING = [
    {
      description: "Contract Value",
      amount: 3625580000
    },
    {
      description: "Amount Invoiced",
      amount: 650999524.39
    },
    {
      description: "Amount Paid",
      amount: 404659374.56
    },
    {
      description: "Outstanding",
      amount: 246340149.83
    }
  ];

  let state = {
    projectId: null,
    resources: [],
    editingResourceId: null,
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

      .resource-report-heading {
        padding: 18px 20px 0;
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
            .map(function (item) {
              const status = getStatusForMaterial(item);

              return `
                <tr data-resource-id="${escapeAttr(item.id)}">
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

    card.innerHTML = `
      <div class="resource-report-heading">
        <h3>HDPE Pipe Stock (May 2026)</h3>
        <p>Received, used and available HDPE pipe stock summary</p>
      </div>

      <div class="card-body table-scroll">
        <table class="data-table resource-report-table">
          <thead>
            <tr>
              <th scope="col">Diameter</th>
              <th scope="col" class="num">Received (m)</th>
              <th scope="col" class="num">Used (m)</th>
              <th scope="col" class="num">Stock (m)</th>
              <th scope="col">Cover</th>
            </tr>
          </thead>
          <tbody>
            ${HDPE_PIPE_STOCK.map(function (item) {
              const statusClass = getCoverStatusClass(item.cover);
              const statusIcon = getCoverStatusIcon(item.cover);

              return `
                <tr>
                  <td>${escapeHTML(item.diameter)}</td>
                  <td class="num">${formatNumber(item.received)}</td>
                  <td class="num">${formatNumber(item.used)}</td>
                  <td class="num">${formatNumber(item.stock)}</td>
                  <td>
                    <span class="status-chip ${statusClass}">
                      <i class="fa-solid ${statusIcon}"></i> ${escapeHTML(item.cover)}
                    </span>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEquipmentCards() {
    const section = document.getElementById("equipment");
    if (!section) return;

    const grid = section.querySelector(".grid");
    if (!grid) return;

    const equipment = byType("equipment");

    if (!equipment.length) {
      grid.innerHTML = `
        <div class="card" style="grid-column:1/-1;">
          <div class="resource-empty">
            <i class="fa-solid fa-truck-monster"></i>
            <p>No equipment records found.</p>
            ${buttonHTML("fa-plus", "Add Equipment", "btn-primary-lite", 'data-resource-add="equipment"')}
          </div>
        </div>
      `;
      return;
    }

    grid.innerHTML = equipment
      .map(function (item) {
        const total = Number(item.total_capacity || 0);
        const allocated = Number(item.allocated_quantity || 0);
        const utilization = total > 0 ? Math.round((allocated / total) * 100) : 0;
        const accent = utilization >= 80 ? "success" : utilization >= 50 ? "secondary" : "warning";

        return `
          <div class="card card-accent card-accent--${accent}" data-resource-id="${escapeAttr(item.id)}">
            <div class="card-body">
              <div class="kpi-card__label">${escapeHTML(item.name)}</div>
              <div class="kpi-card__value" style="font-size:1.5rem;">
                ${formatNumber(allocated)} / ${formatNumber(total)}
              </div>
              <div class="kpi-card__delta ${utilization >= 75 ? "up" : "flat"}">
                ${utilization}% utilization · ${escapeHTML(item.unit || "unit")}
              </div>
              <div class="resource-action-cell" style="margin-top:12px;justify-content:flex-start;">
                <button type="button" title="Edit" data-resource-edit="${escapeAttr(item.id)}">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" title="Delete" class="danger" data-resource-delete="${escapeAttr(item.id)}">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
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

    card.innerHTML = `
      <div class="resource-report-heading">
        <h3>Equipment Deployment (May 2026)</h3>
        <p>Planned versus deployed equipment summary</p>
      </div>

      <div class="card-body table-scroll">
        <table class="data-table resource-report-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" class="num">Planned</th>
              <th scope="col" class="num">Deployed</th>
              <th scope="col" class="num">Variance</th>
            </tr>
          </thead>
          <tbody>
            ${EQUIPMENT_DEPLOYMENT.map(function (item) {
              return `
                <tr class="${item.isTotal ? "resource-total-row" : ""}">
                  <td>${escapeHTML(item.category)}</td>
                  <td class="num">${formatNumber(item.planned)}</td>
                  <td class="num">${formatNumber(item.deployed)}</td>
                  <td class="num">${formatNumber(item.variance)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
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

  function renderManpowerChart() {
    const el = document.getElementById("manpowerChart");
    if (!el || !window.Chart) return;

    const manpower = byType("manpower");

    const labels = manpower.map(function (item) {
      return item.name;
    });

    const values = manpower.map(function (item) {
      return Number(item.total_capacity || 0);
    });

    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    const cssVar = function (name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    };

    state.chart = new Chart(el, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["No manpower data"],
        datasets: [
          {
            data: values.length ? values : [1],
            backgroundColor: [
              cssVar("--color-primary") || "#2563EB",
              cssVar("--color-secondary") || "#7C3AED",
              cssVar("--color-warning") || "#D97706",
              cssVar("--color-success") || "#059669",
              "#0EA5E9",
              "#F97316",
              "#14B8A6"
            ],
            borderWidth: 0
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle"
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
                    .map(function (item) {
                      return `
                        <tr data-resource-id="${escapeAttr(item.id)}">
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

    card.innerHTML = `
      <div class="resource-report-heading">
        <h3>Workforce By Employer</h3>
        <p>Employer, category and headcount breakdown</p>
      </div>

      <div class="card-body table-scroll">
        <table class="data-table resource-report-table">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Category</th>
              <th scope="col" class="num">Headcount</th>
            </tr>
          </thead>
          <tbody>
            ${WORKFORCE_BY_EMPLOYER.map(function (item) {
              return `
                <tr class="${item.isTotal ? "resource-total-row" : ""}">
                  <td>${escapeHTML(item.group)}</td>
                  <td>${escapeHTML(item.category)}</td>
                  <td class="num">${formatNumber(item.headcount)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
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

    renderEquipmentCards();
    renderEquipmentDeploymentTable();

    renderManpowerProgressCards();
    renderManpowerChart();
    renderManpowerActions();
    renderWorkforceByEmployerTable();
  }

  async function loadResources() {
    if (!state.projectId) {
      showNoProjectState();
      return;
    }

    try {
      const result = await api().request("GET", "/projects/" + state.projectId + "/resources?limit=200");
      state.resources = Array.isArray(result && result.data) ? result.data : [];
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

  function openResourceModal(type, resource) {
    const isEdit = Boolean(resource);
    const config = RESOURCE_TYPES[type] || RESOURCE_TYPES.material;

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
                <input id="resourceCapacity" name="total_capacity" type="number" step="0.01" min="0.01" required value="${escapeAttr(resource && resource.total_capacity ? resource.total_capacity : "")}" />
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
        await loadResources();
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
      await loadResources();
    } catch (err) {
      showError(err, "Failed to delete resource");
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
      }
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

    state.projectId = await resolveProjectId();

    if (!state.projectId) {
      showNoProjectState();
      renderAll();
      return;
    }

    await loadResources();
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