/* ============================================================
   resource-dashboard.js
   Resource Dashboard
   - Keeps existing DB-backed CRUD for Materials, Equipment, Manpower
   - Adds reference-style reporting tables and manpower KPI cards
   - No backend or database changes required for the added report sections
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

  let state = {
    projectId: null,
    resources: [],
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

  function escapeHTML(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/"/g, "&quot;");
  }

  function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    const num = Number(value);

    if (Number.isNaN(num)) {
      return String(value);
    }

    return Number.isInteger(num)
      ? num.toLocaleString()
      : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

    if (fromStorage) {
      return fromStorage;
    }

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

  function byType(type) {
    return state.resources.filter(function (resource) {
      return resource.type === type;
    });
  }

  function buttonHTML(icon, text, className, attrs) {
    return (
      '<button type="button" class="' + (className || "btn-ghost") + '" ' + (attrs || "") + ">" +
        '<i class="fa-solid ' + icon + '"></i> ' + text +
      "</button>"
    );
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
        align-items: center;
        width: 100%;
      }

      .resource-heading-row .section-heading {
        flex: 1;
      }

      .resource-actions {
        display: flex;
        margin-left: auto;
        gap: 10px;
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
        border: 1px solid var(--border-color, #e3e7eb);
        background: var(--card-bg, #ffffff);
        color: var(--text-primary, #16232f);
        border-radius: 8px;
        padding: 6px 8px;
        cursor: pointer;
      }

      .resource-action-cell button:hover {
        background: rgba(49, 130, 206, 0.08);
      }

      .resource-action-cell .danger {
        color: var(--color-critical, #c0392b);
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
        background: var(--card-bg, #ffffff);
        color: var(--text-primary, #16232f);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.22);
        border: 1px solid var(--border-color, #e3e7eb);
        overflow: hidden;
      }

      .resource-modal__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border-color, #e3e7eb);
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
        color: var(--text-muted, #6b7280);
      }

      .resource-form-field input,
      .resource-form-field select,
      .resource-form-field textarea {
        width: 100%;
        border: 1px solid var(--border-color, #e3e7eb);
        border-radius: 10px;
        padding: 10px 11px;
        background: var(--card-bg, #ffffff);
        color: var(--text-primary, #16232f);
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
        border-top: 1px solid var(--border-color, #e3e7eb);
      }

      .btn-primary-lite {
        border: none;
        background: var(--color-primary, #2563eb);
        color: #ffffff;
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
        color: var(--text-muted, #6b7280);
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
        color: var(--color-primary, #0a4595);
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.01em;
      }

      .resource-report-heading p {
        margin: 4px 0 0;
        color: var(--text-muted, #8a99aa);
        font-size: 13px;
      }

      .resource-report-table tbody tr:nth-child(even) {
        background: rgba(10, 69, 149, 0.06);
      }

      .resource-total-row {
        background: rgba(10, 69, 149, 0.12) !important;
        font-weight: 800;
        color: var(--color-primary, #0a4595);
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
    const remaining = Number(resource.remaining_capacity !== undefined && resource.remaining_capacity !== null ? resource.remaining_capacity : total);

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

    if (normalized.indexOf("re-order") !== -1 || normalized.indexOf("reorder") !== -1) {
      return "crit";
    }

    if (normalized.indexOf("watch") !== -1) {
      return "warn";
    }

    return "ok";
  }

  function getCoverStatusIcon(cover) {
    const normalized = String(cover || "").toLowerCase();

    if (normalized.indexOf("re-order") !== -1 || normalized.indexOf("reorder") !== -1) {
      return "fa-circle-exclamation";
    }

    if (normalized.indexOf("watch") !== -1) {
      return "fa-triangle-exclamation";
    }

    return "fa-circle-check";
  }

  function computeKPIs() {
    const materials = byType("material");
    const equipment = byType("equipment");
    const manpower = byType("manpower");

    const materialsBelowReorder = materials.filter(function (resource) {
      const total = Number(resource.total_capacity || 0);
      const remaining = Number(resource.remaining_capacity !== undefined && resource.remaining_capacity !== null ? resource.remaining_capacity : total);
      return remaining <= total * 0.25;
    }).length;

    const equipmentCapacity = equipment.reduce(function (sum, resource) {
      return sum + Number(resource.total_capacity || 0);
    }, 0);

    const equipmentAllocated = equipment.reduce(function (sum, resource) {
      return sum + Number(resource.allocated_quantity || 0);
    }, 0);

    const equipmentUtilization = equipmentCapacity > 0
      ? Math.round((equipmentAllocated / equipmentCapacity) * 100)
      : 0;

    const manpowerDeployed = manpower.reduce(function (sum, resource) {
      return sum + Number(resource.total_capacity || 0);
    }, 0);

    const idleOrMaintenance = equipment.reduce(function (sum, resource) {
      return sum + Number(resource.remaining_capacity || 0);
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
      if (kpis.materialsBelowReorder > 0) {
        criticalDelta.innerHTML =
          '<i class="fa-solid fa-arrow-down"></i> ' +
          kpis.materialsBelowReorder +
          " material item(s) need attention";
      } else {
        criticalDelta.innerHTML =
          '<i class="fa-solid fa-circle-check"></i> No material below reorder';
      }
    }
  }

  function renderMaterialsTable() {
    const section = document.getElementById("materials");
    if (!section) return;

    const cardBody = section.querySelector(".card-body");
    if (!cardBody) return;

    const materials = byType("material");

    if (!materials.length) {
      cardBody.innerHTML =
        '<div class="resource-empty">' +
          '<i class="fa-solid fa-box-open"></i>' +
          "<p>No material records found.</p>" +
          buttonHTML("fa-plus", "Add Material", "btn-primary-lite", 'data-resource-add="material"') +
        "</div>";
      return;
    }

    let html = "";
    html += '<table class="data-table">';
    html += "<thead>";
    html += "<tr>";
    html += '<th scope="col">Material</th>';
    html += '<th scope="col">Unit</th>';
    html += '<th scope="col" class="num">Total Capacity</th>';
    html += '<th scope="col" class="num">Allocated</th>';
    html += '<th scope="col" class="num">Remaining</th>';
    html += '<th scope="col">Status</th>';
    html += '<th scope="col" class="num">Actions</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    materials.forEach(function (item) {
      const status = getStatusForMaterial(item);
      const remaining = item.remaining_capacity !== undefined && item.remaining_capacity !== null
        ? item.remaining_capacity
        : item.total_capacity;

      html += '<tr data-resource-id="' + escapeAttr(item.id) + '">';
      html += "<td>" + escapeHTML(item.name) + "</td>";
      html += "<td>" + escapeHTML(item.unit || "") + "</td>";
      html += '<td class="num">' + formatNumber(item.total_capacity) + "</td>";
      html += '<td class="num">' + formatNumber(item.allocated_quantity || 0) + "</td>";
      html += '<td class="num">' + formatNumber(remaining) + "</td>";
      html += "<td>";
      html += '<span class="status-chip ' + status.className + '">';
      html += '<i class="fa-solid ' + status.icon + '"></i> ' + status.text;
      html += "</span>";
      html += "</td>";
      html += "<td>";
      html += '<div class="resource-action-cell">';
      html += '<button type="button" title="Edit" data-resource-edit="' + escapeAttr(item.id) + '">';
      html += '<i class="fa-solid fa-pen"></i>';
      html += "</button>";
      html += '<button type="button" title="Delete" class="danger" data-resource-delete="' + escapeAttr(item.id) + '">';
      html += '<i class="fa-solid fa-trash"></i>';
      html += "</button>";
      html += "</div>";
      html += "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";

    cardBody.innerHTML = html;
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

    let html = "";
    html += '<div class="resource-report-heading">';
    html += "<h3>HDPE Pipe Stock (May 2026)</h3>";
    html += "<p>Received, used and available HDPE pipe stock summary</p>";
    html += "</div>";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table resource-report-table">';
    html += "<thead>";
    html += "<tr>";
    html += '<th scope="col">Diameter</th>';
    html += '<th scope="col" class="num">Received (m)</th>';
    html += '<th scope="col" class="num">Used (m)</th>';
    html += '<th scope="col" class="num">Stock (m)</th>';
    html += '<th scope="col">Cover</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    HDPE_PIPE_STOCK.forEach(function (item) {
      const statusClass = getCoverStatusClass(item.cover);
      const statusIcon = getCoverStatusIcon(item.cover);

      html += "<tr>";
      html += "<td>" + escapeHTML(item.diameter) + "</td>";
      html += '<td class="num">' + formatNumber(item.received) + "</td>";
      html += '<td class="num">' + formatNumber(item.used) + "</td>";
      html += '<td class="num">' + formatNumber(item.stock) + "</td>";
      html += "<td>";
      html += '<span class="status-chip ' + statusClass + '">';
      html += '<i class="fa-solid ' + statusIcon + '"></i> ' + escapeHTML(item.cover);
      html += "</span>";
      html += "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";
    html += "</div>";

    card.innerHTML = html;
  }

  function renderEquipmentCards() {
    const section = document.getElementById("equipment");
    if (!section) return;

    const grid = section.querySelector(".grid");
    if (!grid) return;

    const equipment = byType("equipment");

    if (!equipment.length) {
      grid.innerHTML =
        '<div class="card" style="grid-column:1/-1;">' +
          '<div class="resource-empty">' +
            '<i class="fa-solid fa-truck-monster"></i>' +
            "<p>No equipment records found.</p>" +
            buttonHTML("fa-plus", "Add Equipment", "btn-primary-lite", 'data-resource-add="equipment"') +
          "</div>" +
        "</div>";
      return;
    }

    let html = "";

    equipment.forEach(function (item) {
      const total = Number(item.total_capacity || 0);
      const allocated = Number(item.allocated_quantity || 0);
      const utilization = total > 0 ? Math.round((allocated / total) * 100) : 0;
      const accent = utilization >= 80 ? "success" : utilization >= 50 ? "secondary" : "warning";

      html += '<div class="card card-accent card-accent--' + accent + '" data-resource-id="' + escapeAttr(item.id) + '">';
      html += '<div class="card-body">';
      html += '<div class="kpi-card__label">' + escapeHTML(item.name) + "</div>";
      html += '<div class="kpi-card__value" style="font-size:1.5rem;">';
      html += formatNumber(allocated) + " / " + formatNumber(total);
      html += "</div>";
      html += '<div class="kpi-card__delta ' + (utilization >= 75 ? "up" : "flat") + '">';
      html += utilization + "% utilization · " + escapeHTML(item.unit || "unit");
      html += "</div>";
      html += '<div class="resource-action-cell" style="margin-top:12px;justify-content:flex-start;">';
      html += '<button type="button" title="Edit" data-resource-edit="' + escapeAttr(item.id) + '">';
      html += '<i class="fa-solid fa-pen"></i>';
      html += "</button>";
      html += '<button type="button" title="Delete" class="danger" data-resource-delete="' + escapeAttr(item.id) + '">';
      html += '<i class="fa-solid fa-trash"></i>';
      html += "</button>";
      html += "</div>";
      html += "</div>";
      html += "</div>";
    });

    grid.innerHTML = html;
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

    let html = "";
    html += '<div class="resource-report-heading">';
    html += "<h3>Equipment Deployment (May 2026)</h3>";
    html += "<p>Planned versus deployed equipment summary</p>";
    html += "</div>";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table resource-report-table">';
    html += "<thead>";
    html += "<tr>";
    html += '<th scope="col">Category</th>';
    html += '<th scope="col" class="num">Planned</th>';
    html += '<th scope="col" class="num">Deployed</th>';
    html += '<th scope="col" class="num">Variance</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    EQUIPMENT_DEPLOYMENT.forEach(function (item) {
      html += '<tr class="' + (item.isTotal ? "resource-total-row" : "") + '">';
      html += "<td>" + escapeHTML(item.category) + "</td>";
      html += '<td class="num">' + formatNumber(item.planned) + "</td>";
      html += '<td class="num">' + formatNumber(item.deployed) + "</td>";
      html += '<td class="num">' + formatNumber(item.variance) + "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";
    html += "</div>";

    card.innerHTML = html;
  }

  function renderManpowerProgressCards() {
    const section = document.getElementById("manpower");
    if (!section) return;

    let grid = document.getElementById("manpowerProgressCards");

    if (!grid) {
      grid = document.createElement("div");
      grid.id = "manpowerProgressCards";
      grid.className = "grid grid-4 resource-manpower-kpis";

      const chartCard = section.querySelector(".manpower-chart-card") || section.querySelector(".card");

      if (chartCard) {
        section.insertBefore(grid, chartCard);
      } else {
        section.appendChild(grid);
      }
    }

    let html = "";

    MANPOWER_PROGRESS.forEach(function (item) {
      html += '<div class="card kpi-card card-accent card-accent--' + item.accent + '">';
      html += '<div class="kpi-card__top">';
      html += '<div class="kpi-card__label">' + escapeHTML(item.label) + "</div>";
      html += '<div class="kpi-card__icon ' + item.iconTone + '">';
      html += '<i class="fa-solid ' + item.icon + '"></i>';
      html += "</div>";
      html += "</div>";
      html += '<div class="kpi-card__value">' + escapeHTML(item.value) + "</div>";
      html += '<div class="kpi-card__delta flat">' + escapeHTML(item.note) + "</div>";
      html += "</div>";
    });

    grid.innerHTML = html;
  }

  function renderManpowerChart() {
    const canvas = document.getElementById("manpowerChart");

    if (!canvas || !window.Chart) return;

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

    const cssVar = function (name, fallback) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    };

    state.chart = new Chart(ctx,{
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["No manpower data"],
        datasets: [
          {
            data: values.length ? values : [1],
            backgroundColor: [
              cssVar("--color-primary", "#2563eb"),
              cssVar("--color-secondary", "#7c3aed"),
              cssVar("--color-warning", "#d97706"),
              cssVar("--color-success", "#059669"),
              "#0ea5e9",
              "#f97316",
              "#14b8a6"
            ],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
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

    let html = "";
    html += '<div class="card-body table-scroll">';

    if (!manpower.length) {
      html += '<div class="resource-empty">';
      html += '<i class="fa-solid fa-people-group"></i>';
      html += "<p>No manpower records found.</p>";
      html += buttonHTML("fa-plus", "Add Manpower", "btn-primary-lite", 'data-resource-add="manpower"');
      html += "</div>";
      html += "</div>";
      list.innerHTML = html;
      return;
    }

    html += '<table class="data-table">';
    html += "<thead>";
    html += "<tr>";
    html += "<th>Category</th>";
    html += "<th>Unit</th>";
    html += '<th class="num">Total</th>';
    html += '<th class="num">Allocated</th>';
    html += '<th class="num">Remaining</th>';
    html += '<th class="num">Actions</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    manpower.forEach(function (item) {
      const remaining = item.remaining_capacity !== undefined && item.remaining_capacity !== null
        ? item.remaining_capacity
        : item.total_capacity;

      html += '<tr data-resource-id="' + escapeAttr(item.id) + '">';
      html += "<td>" + escapeHTML(item.name) + "</td>";
      html += "<td>" + escapeHTML(item.unit || "") + "</td>";
      html += '<td class="num">' + formatNumber(item.total_capacity) + "</td>";
      html += '<td class="num">' + formatNumber(item.allocated_quantity || 0) + "</td>";
      html += '<td class="num">' + formatNumber(remaining) + "</td>";
      html += "<td>";
      html += '<div class="resource-action-cell">';
      html += '<button type="button" title="Edit" data-resource-edit="' + escapeAttr(item.id) + '">';
      html += '<i class="fa-solid fa-pen"></i>';
      html += "</button>";
      html += '<button type="button" title="Delete" class="danger" data-resource-delete="' + escapeAttr(item.id) + '">';
      html += '<i class="fa-solid fa-trash"></i>';
      html += "</button>";
      html += "</div>";
      html += "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";
    html += "</div>";

    list.innerHTML = html;
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

    let html = "";
    html += '<div class="resource-report-heading">';
    html += "<h3>Workforce By Employer</h3>";
    html += "<p>Employer, category and headcount breakdown</p>";
    html += "</div>";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table resource-report-table">';
    html += "<thead>";
    html += "<tr>";
    html += '<th scope="col">Group</th>';
    html += '<th scope="col">Category</th>';
    html += '<th scope="col" class="num">Headcount</th>';
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    WORKFORCE_BY_EMPLOYER.forEach(function (item) {
      html += '<tr class="' + (item.isTotal ? "resource-total-row" : "") + '">';
      html += "<td>" + escapeHTML(item.group) + "</td>";
      html += "<td>" + escapeHTML(item.category) + "</td>";
      html += '<td class="num">' + formatNumber(item.headcount) + "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";
    html += "</div>";

    card.innerHTML = html;
  }

  function injectSectionActions() {
    [
      { id: "materials", type: "material" },
      { id: "equipment", type: "equipment" },
      { id: "manpower", type: "manpower" }
    ].forEach(function (entry) {
      const section = document.getElementById(entry.id);
      if (!section) return;

      const heading = section.querySelector(".section-heading");

      if (!heading || heading.closest(".resource-heading-row")) {
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "resource-heading-row";

      heading.parentNode.insertBefore(wrapper, heading);
      wrapper.appendChild(heading);

      const actions = document.createElement("div");
      actions.className = "resource-actions";
      actions.innerHTML = buttonHTML(
        "fa-plus",
        "Add " + RESOURCE_TYPES[entry.type].label,
        "btn-primary-lite",
        'data-resource-add="' + entry.type + '"'
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

    box.innerHTML =
      '<div class="card-body">' +
        '<div class="empty-state">' +
          '<i class="fa-solid fa-triangle-exclamation"></i>' +
          "<p>" + escapeHTML(message) + "</p>" +
        "</div>" +
      "</div>";
  }

  function clearDashboardError() {
    const box = document.getElementById("resourceDashboardError");

    if (box) {
      box.remove();
    }
  }

  function showNoProjectState() {
    showDashboardError(
      "No project is selected. Add a project in the database and store it in localStorage as current_project, or expose GET /projects so the dashboard can auto-select the first project."
    );
  }

  async function loadResources() {
    if (!state.projectId) {
      showNoProjectState();
      renderAll();
      return;
    }

    try {
      const result = await api().request("GET", "/projects/" + state.projectId + "/resources?limit=200");
      state.resources = Array.isArray(result && result.data) ? result.data : [];
      clearDashboardError();
      renderAll();
    } catch (err) {
      showError(err, "Failed to load resource dashboard data");
      showDashboardError(err.message || "Failed to load resource dashboard data");
      renderAll();
    }
  }

  function closeResourceModal() {
    const modal = document.getElementById("resourceModalBackdrop");

    if (modal) {
      modal.remove();
    }
  }

  function openResourceModal(type, resource) {
    const isEdit = Boolean(resource);
    const config = RESOURCE_TYPES[type] || RESOURCE_TYPES.material;

    closeResourceModal();

    const backdrop = document.createElement("div");
    backdrop.className = "resource-modal-backdrop";
    backdrop.id = "resourceModalBackdrop";

    const resourceName = resource && resource.name ? resource.name : "";
    const resourceUnit = resource && resource.unit ? resource.unit : config.defaultUnit;
    const resourceCapacity = resource && resource.total_capacity ? resource.total_capacity : "";
    const resourceNotes = resource && resource.notes ? resource.notes : "";

    let html = "";
    html += '<div class="resource-modal" role="dialog" aria-modal="true" aria-labelledby="resourceModalTitle">';
    html += '<div class="resource-modal__header">';
    html += '<h3 id="resourceModalTitle">' + (isEdit ? "Edit" : "Add") + " " + config.label + "</h3>";
    html += '<button type="button" class="icon-btn" data-resource-modal-close aria-label="Close">';
    html += '<i class="fa-solid fa-xmark"></i>';
    html += "</button>";
    html += "</div>";

    html += '<form id="resourceForm">';
    html += '<div class="resource-modal__body">';
    html += '<div class="resource-form-grid">';

    html += '<div class="resource-form-field full">';
    html += '<label for="resourceName">Name</label>';
    html += '<input id="resourceName" name="name" type="text" required maxlength="200" value="' + escapeAttr(resourceName) + '" />';
    html += "</div>";

    html += '<div class="resource-form-field">';
    html += '<label for="resourceType">Type</label>';
    html += '<select id="resourceType" name="type" required>';
    html += '<option value="material" ' + (type === "material" ? "selected" : "") + ">Material</option>";
    html += '<option value="equipment" ' + (type === "equipment" ? "selected" : "") + ">Equipment</option>";
    html += '<option value="manpower" ' + (type === "manpower" ? "selected" : "") + ">Manpower</option>";
    html += "</select>";
    html += "</div>";

    html += '<div class="resource-form-field">';
    html += '<label for="resourceUnit">Unit</label>';
    html += '<input id="resourceUnit" name="unit" type="text" required maxlength="20" value="' + escapeAttr(resourceUnit) + '" />';
    html += "</div>";

    html += '<div class="resource-form-field">';
    html += '<label for="resourceCapacity">Total Capacity / Quantity</label>';
    html += '<input id="resourceCapacity" name="total_capacity" type="number" step="0.01" min="0.01" required value="' + escapeAttr(resourceCapacity) + '" />';
    html += "</div>";

    html += '<div class="resource-form-field full">';
    html += '<label for="resourceNotes">Notes</label>';
    html += '<textarea id="resourceNotes" name="notes" maxlength="1000">' + escapeHTML(resourceNotes) + "</textarea>";
    html += "</div>";

    html += "</div>";
    html += "</div>";

    html += '<div class="resource-modal__footer">';
    html += '<button type="button" class="btn-ghost" data-resource-modal-close>Cancel</button>';
    html += '<button type="submit" class="btn-primary-lite">';
    html += '<i class="fa-solid fa-floppy-disk"></i> ' + (isEdit ? "Update" : "Save");
    html += "</button>";
    html += "</div>";

    html += "</form>";
    html += "</div>";

    backdrop.innerHTML = html;
    document.body.appendChild(backdrop);

    const form = backdrop.querySelector("#resourceForm");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      const payload = {
        name: form.elements.name.value.trim(),
        type: form.elements.type.value,
        unit: form.elements.unit.value.trim(),
        total_capacity: Number(form.elements.total_capacity.value),
        notes: form.elements.notes.value.trim() || undefined
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
      if (event.target === backdrop) {
        closeResourceModal();
      }
    });

    setTimeout(function () {
      const input = backdrop.querySelector("#resourceName");

      if (input) {
        input.focus();
      }
    }, 0);
  }

  async function deleteResource(id) {
    const resource = state.resources.find(function (item) {
      return item.id === id;
    });

    if (!resource) return;

    const confirmed = window.confirm(
      'Delete resource "' + resource.name + '"? This is allowed only if it has no allocations.'
    );

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

        if (resource) {
          openResourceModal(resource.type, resource);
        }

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
    const buttons = Array.prototype.slice.call(document.querySelectorAll(".filter-bar button"));

    const exportBtn = buttons.find(function (btn) {
      return /export/i.test(btn.textContent || "");
    });

    if (!exportBtn) return;

    exportBtn.addEventListener("click", function () {
      const rows = [
        ["Name", "Type", "Unit", "Total Capacity", "Allocated Quantity", "Remaining Capacity", "Notes"]
      ];

      state.resources.forEach(function (resource) {
        rows.push([
          resource.name,
          resource.type,
          resource.unit,
          resource.total_capacity,
          resource.allocated_quantity || 0,
          resource.remaining_capacity !== undefined && resource.remaining_capacity !== null
            ? resource.remaining_capacity
            : resource.total_capacity,
          resource.notes || ""
        ]);
      });

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
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      toast("Resource data exported", "fa-download");
    });
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
  
})();