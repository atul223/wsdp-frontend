/* ============================================================
   resource-dashboard.js
   Resource Dashboard
   - DB-backed CRUD for Materials, Equipment and Manpower
   - Static monthly reporting sections from reference dashboard
   - Auth-safe initialization using wsdp:authready
   ============================================================ */

(function () {
  "use strict";

  const RESOURCE_TYPES = {
    material: {
      label: "Material",
      plural: "Materials",
      defaultUnit: "nos"
    },
    equipment: {
      label: "Equipment",
      plural: "Equipment",
      defaultUnit: "nos"
    },
    manpower: {
      label: "Manpower",
      plural: "Manpower",
      defaultUnit: "persons"
    }
  };

  const SAMPLE_MATERIALS = [
    { name: "DI Pipe — 600mm", unit: "m", total_capacity: 1200, allocated_quantity: 2400, remaining_capacity: 1200, reorder_level: 1500, statusText: "Below Reorder" },
    { name: "DI Pipe — 450mm", unit: "m", total_capacity: 3100, allocated_quantity: 2900, remaining_capacity: 3100, reorder_level: 2000, statusText: "Adequate" },
    { name: "HDPE Pipe — 315mm", unit: "m", total_capacity: 5400, allocated_quantity: 1800, remaining_capacity: 5400, reorder_level: 2500, statusText: "Adequate" },
    { name: "Cement (OPC 53)", unit: "bags", total_capacity: 2850, allocated_quantity: 3200, remaining_capacity: 2850, reorder_level: 3000, statusText: "Watch" },
    { name: "Sluice Valves", unit: "nos", total_capacity: 34, allocated_quantity: 18, remaining_capacity: 34, reorder_level: 25, statusText: "Adequate" }
  ];

  const SAMPLE_EQUIPMENT = [
    { name: "Excavators", unit: "nos", total_capacity: 10, allocated_quantity: 8, remaining_capacity: 2 },
    { name: "HDD Rigs", unit: "nos", total_capacity: 3, allocated_quantity: 2, remaining_capacity: 1 },
    { name: "Dewatering Pumps", unit: "nos", total_capacity: 12, allocated_quantity: 11, remaining_capacity: 1 },
    { name: "Idle / Under Maintenance", unit: "nos", total_capacity: 6, allocated_quantity: 6, remaining_capacity: 0, fixedWarning: true }
  ];

  const SAMPLE_MANPOWER = [
    { name: "Supervisory", unit: "persons", total_capacity: 65, allocated_quantity: 0, remaining_capacity: 65 },
    { name: "Unskilled", unit: "persons", total_capacity: 520, allocated_quantity: 0, remaining_capacity: 520 }
  ];

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
    { label: "Planned", value: "133", note: "Per Month-5 plan", icon: "fa-helmet-safety", accent: "warning", iconTone: "icon-tone-amber" },
    { label: "Deployed", value: "115", note: "CTCE + 2 Subcontractors", icon: "fa-helmet-safety", accent: "primary", iconTone: "icon-tone-blue" },
    { label: "Gap", value: "-18", note: "Shortfall", icon: "fa-triangle-exclamation", accent: "warning", iconTone: "icon-tone-amber" },
    { label: "Female %", value: "4.8%", note: "5 of 115", icon: "fa-people-group", accent: "warning", iconTone: "icon-tone-amber" },
    { label: "Local Nationals", value: "90", note: "Subcontracted unqualified", icon: "fa-users", accent: "success", iconTone: "icon-tone-green" },
    { label: "Foreign Workers", value: "8", note: "Subcontracted specialists", icon: "fa-user-group", accent: "primary", iconTone: "icon-tone-blue" }
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

  const state = {
    projectId: null,
    resources: [],
    chart: null,
    initialized: false
  };

  function api() {
    if (!window.WSDP_API) {
      throw new Error("WSDP_API is not loaded.");
    }

    return window.WSDP_API;
  }

  function toast(message, icon) {
    if (window.WSDP_TOAST) {
      window.WSDP_TOAST(message, { icon: icon || "fa-circle-check" });
      return;
    }

    console.log(message);
  }

  function showError(error, fallback) {
    const message = error && error.message ? error.message : fallback || "Something went wrong";
    console.error(error);
    toast(message, "fa-triangle-exclamation");
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
    if (value === null || value === undefined || value === "") return "—";

    const num = Number(value);

    if (Number.isNaN(num)) return String(value);

    return Number.isInteger(num)
      ? num.toLocaleString()
      : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();

    return value || fallback;
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
        const firstProject = projects[0];
        const projectId = firstProject.id || firstProject.project_id;

        if (projectId) {
          localStorage.setItem("current_project", JSON.stringify(firstProject));
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

  function getDisplayMaterials() {
    const rows = byType("material");
    return rows.length ? rows : SAMPLE_MATERIALS;
  }

  function getDisplayEquipment() {
    const rows = byType("equipment");
    return rows.length ? rows : SAMPLE_EQUIPMENT;
  }

  function getDisplayManpower() {
    const rows = byType("manpower");
    return rows.length ? rows : SAMPLE_MANPOWER;
  }

  function getRemaining(resource) {
    if (resource.remaining_capacity !== undefined && resource.remaining_capacity !== null) {
      return Number(resource.remaining_capacity || 0);
    }

    return Number(resource.total_capacity || 0) - Number(resource.allocated_quantity || 0);
  }

  function getStatusForMaterial(resource) {
    if (resource.statusText) {
      const normalized = String(resource.statusText).toLowerCase();

      if (normalized.indexOf("below") !== -1 || normalized.indexOf("critical") !== -1 || normalized.indexOf("re-order") !== -1) {
        return { className: "crit", icon: "fa-circle-exclamation", text: resource.statusText };
      }

      if (normalized.indexOf("watch") !== -1) {
        return { className: "warn", icon: "fa-triangle-exclamation", text: resource.statusText };
      }

      return { className: "ok", icon: "fa-circle-check", text: resource.statusText };
    }

    const total = Number(resource.total_capacity || 0);
    const remaining = getRemaining(resource);

    if (remaining <= 0) {
      return { className: "crit", icon: "fa-circle-exclamation", text: "Below Reorder" };
    }

    if (total > 0 && remaining <= total * 0.25) {
      return { className: "warn", icon: "fa-triangle-exclamation", text: "Watch" };
    }

    return { className: "ok", icon: "fa-circle-check", text: "Adequate" };
  }

  function getCoverStatus(cover) {
    const normalized = String(cover || "").toLowerCase();

    if (normalized.indexOf("re-order") !== -1 || normalized.indexOf("reorder") !== -1) {
      return { className: "crit", icon: "fa-circle-exclamation" };
    }

    if (normalized.indexOf("watch") !== -1) {
      return { className: "warn", icon: "fa-triangle-exclamation" };
    }

    return { className: "ok", icon: "fa-circle-check" };
  }

  function ensureStyles() {
    if (document.getElementById("resourceDashboardStyles")) return;

    const style = document.createElement("style");
    style.id = "resourceDashboardStyles";

    style.textContent = `
      .resource-heading-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        width: 100%;
        margin-top: 28px;
        margin-bottom: 12px;
      }

      .resource-heading-row .section-heading {
        margin: 0;
        flex: 1;
      }

      .resource-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        margin-left: auto;
        flex-shrink: 0;
      }

      .btn-primary-lite {
        border: none;
        background: var(--color-primary, #0A4595);
        color: #fff;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        line-height: 1;
      }

      .btn-primary-lite:hover {
        filter: brightness(0.96);
      }

      .btn-primary-lite:disabled,
      .btn-ghost:disabled {
        opacity: 0.6;
        cursor: not-allowed;
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

      .manpower-chart-wrap {
        height: 300px;
        min-height: 300px;
        position: relative;
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

      .resource-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
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

      @media (max-width: 720px) {
        .resource-heading-row {
          flex-direction: column;
          align-items: flex-start;
        }

        .resource-actions {
          width: 100%;
          justify-content: flex-start;
          margin-left: 0;
        }

        .resource-form-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function computeKPIs() {
    const materials = getDisplayMaterials();
    const equipment = getDisplayEquipment();
    const manpower = getDisplayManpower();

    const materialsBelowReorder = materials.filter(function (resource) {
      const status = getStatusForMaterial(resource);
      return status.className === "crit";
    }).length;

    const equipmentCapacity = equipment.reduce(function (sum, resource) {
      if (resource.fixedWarning) return sum;
      return sum + Number(resource.total_capacity || 0);
    }, 0);

    const equipmentAllocated = equipment.reduce(function (sum, resource) {
      if (resource.fixedWarning) return sum;
      return sum + Number(resource.allocated_quantity || 0);
    }, 0);

    const equipmentUtilization = equipmentCapacity > 0
      ? Math.round((equipmentAllocated / equipmentCapacity) * 100)
      : 0;

    const manpowerDeployed = manpower.reduce(function (sum, resource) {
      return sum + Number(resource.total_capacity || 0);
    }, 0);

    const idleOrMaintenance = equipment.reduce(function (sum, resource) {
      if (resource.fixedWarning) return sum + Number(resource.total_capacity || 0);
      return sum + Number(resource.remaining_capacity || 0);
    }, 0);

    return {
      materialsBelowReorder,
      equipmentUtilization,
      manpowerDeployed,
      idleOrMaintenance
    };
  }

  function updateKPIs() {
    const kpis = computeKPIs();

    setText("materialsBelowReorderCount", formatNumber(kpis.materialsBelowReorder));
    setText("equipmentUtilizationCount", formatNumber(kpis.equipmentUtilization));
    setText("manpowerDeployedCount", formatNumber(kpis.manpowerDeployed));
    setText("idleMaintenanceCount", formatNumber(kpis.idleOrMaintenance));

    const delta = document.getElementById("materialsBelowReorderDelta");

    if (delta) {
      if (kpis.materialsBelowReorder > 0) {
        delta.innerHTML = '<i class="fa-solid fa-arrow-down"></i> DI Pipe 600mm critical';
      } else {
        delta.innerHTML = '<i class="fa-solid fa-circle-check"></i> No material below reorder';
      }
    }
  }

  function renderMaterialsTable() {
    const mount = document.getElementById("materialsTableMount");
    if (!mount) return;

    const materials = getDisplayMaterials();

    let html = "";
    html += '<table class="data-table">';
    html += "<thead>";
    html += "<tr>";
    html += "<th>Material</th>";
    html += "<th>Unit</th>";
    html += '<th class="num">In Stock</th>';
    html += '<th class="num">Monthly Consumption</th>';
    html += '<th class="num">Reorder Level</th>';
    html += "<th>Status</th>";

    if (byType("material").length) {
      html += '<th class="num">Actions</th>';
    }

    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    materials.forEach(function (item) {
      const status = getStatusForMaterial(item);
      const stock = item.remaining_capacity !== undefined && item.remaining_capacity !== null
        ? item.remaining_capacity
        : item.total_capacity;

      const consumption = item.allocated_quantity || 0;
      const reorderLevel = item.reorder_level || Math.round(Number(item.total_capacity || 0) * 0.25);

      html += '<tr data-resource-id="' + escapeAttr(item.id || "") + '">';
      html += "<td>" + escapeHTML(item.name) + "</td>";
      html += "<td>" + escapeHTML(item.unit || "") + "</td>";
      html += '<td class="num">' + formatNumber(stock) + "</td>";
      html += '<td class="num">' + formatNumber(consumption) + "</td>";
      html += '<td class="num">' + formatNumber(reorderLevel) + "</td>";
      html += "<td>";
      html += '<span class="status-chip ' + status.className + '">';
      html += '<i class="fa-solid ' + status.icon + '"></i> ' + escapeHTML(status.text);
      html += "</span>";
      html += "</td>";

      if (byType("material").length) {
        html += "<td>";
        html += renderActionButtons(item.id);
        html += "</td>";
      }

      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";

    mount.innerHTML = html;
  }

  function renderActionButtons(id) {
    if (!id) return "";

    let html = "";
    html += '<div class="resource-action-cell">';
    html += '<button type="button" title="Edit" data-resource-edit="' + escapeAttr(id) + '">';
    html += '<i class="fa-solid fa-pen"></i>';
    html += "</button>";
    html += '<button type="button" title="Delete" class="danger" data-resource-delete="' + escapeAttr(id) + '">';
    html += '<i class="fa-solid fa-trash"></i>';
    html += "</button>";
    html += "</div>";

    return html;
  }

  function renderHdpePipeStockTable() {
    const card = document.getElementById("hdpePipeStockCard");
    if (!card) return;

    let html = "";
    html += '<div class="resource-report-heading">';
    html += "<h3>HDPE Pipe Stock (May 2026)</h3>";
    html += "<p>Received, used and available HDPE pipe stock summary</p>";
    html += "</div>";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table resource-report-table">';
    html += "<thead>";
    html += "<tr>";
    html += "<th>Diameter</th>";
    html += '<th class="num">Received (m)</th>';
    html += '<th class="num">Used (m)</th>';
    html += '<th class="num">Stock (m)</th>';
    html += "<th>Cover</th>";
    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    HDPE_PIPE_STOCK.forEach(function (item) {
      const status = getCoverStatus(item.cover);

      html += "<tr>";
      html += "<td>" + escapeHTML(item.diameter) + "</td>";
      html += '<td class="num">' + formatNumber(item.received) + "</td>";
      html += '<td class="num">' + formatNumber(item.used) + "</td>";
      html += '<td class="num">' + formatNumber(item.stock) + "</td>";
      html += "<td>";
      html += '<span class="status-chip ' + status.className + '">';
      html += '<i class="fa-solid ' + status.icon + '"></i> ' + escapeHTML(item.cover);
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
    const mount = document.getElementById("equipmentCardsMount");
    if (!mount) return;

    const equipment = getDisplayEquipment();
    const hasDbRecords = byType("equipment").length > 0;

    let html = "";

    equipment.forEach(function (item) {
      const total = Number(item.total_capacity || 0);
      const allocated = Number(item.allocated_quantity || 0);
      const utilization = total > 0 ? Math.round((allocated / total) * 100) : 0;
      const accent = item.fixedWarning ? "warning" : utilization >= 80 ? "success" : utilization >= 50 ? "secondary" : "warning";

      html += '<div class="card card-accent card-accent--' + accent + '" data-resource-id="' + escapeAttr(item.id || "") + '">';
      html += '<div class="card-body">';
      html += '<div class="kpi-card__label">' + escapeHTML(item.name) + "</div>";

      if (item.fixedWarning) {
        html += '<div class="kpi-card__value" style="font-size:1.5rem;color:var(--color-warning);">' + formatNumber(total) + "</div>";
        html += '<div class="kpi-card__delta flat">Across all categories</div>';
      } else {
        html += '<div class="kpi-card__value" style="font-size:1.5rem;">';
        html += formatNumber(allocated) + " / " + formatNumber(total);
        html += "</div>";
        html += '<div class="kpi-card__delta ' + (utilization >= 75 ? "up" : "flat") + '">';
        html += utilization + "% utilization";
        html += "</div>";
      }

      if (hasDbRecords && item.id) {
        html += '<div class="resource-action-cell" style="margin-top:12px;justify-content:flex-start;">';
        html += renderActionButtons(item.id);
        html += "</div>";
      }

      html += "</div>";
      html += "</div>";
    });

    mount.innerHTML = html;
  }

  function renderEquipmentDeploymentTable() {
    const card = document.getElementById("equipmentDeploymentCard");
    if (!card) return;

    let html = "";
    html += '<div class="resource-report-heading">';
    html += "<h3>Equipment Deployment (May 2026)</h3>";
    html += "<p>Planned versus deployed equipment summary</p>";
    html += "</div>";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table resource-report-table">';
    html += "<thead>";
    html += "<tr>";
    html += "<th>Category</th>";
    html += '<th class="num">Planned</th>';
    html += '<th class="num">Deployed</th>';
    html += '<th class="num">Variance</th>';
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
    const mount = document.getElementById("manpowerProgressCards");
    if (!mount) return;

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

    mount.innerHTML = html;
  }

  function renderManpowerChart() {
    const canvas = document.getElementById("manpowerChart");
    if (!canvas) return;

    const manpower = getDisplayManpower();

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

    if (typeof Chart === "undefined") {
      const parent = canvas.parentElement;
      if (parent) {
        parent.innerHTML =
          '<div class="resource-empty">' +
          '<i class="fa-solid fa-chart-pie"></i>' +
          '<p>Manpower chart could not load because Chart.js is unavailable.</p>' +
          "</div>";
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    state.chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["No manpower data"],
        datasets: [
          {
            data: values.length ? values : [1],
            backgroundColor: [
              cssVar("--color-primary", "#0a4595"),
              "#07858c",
              cssVar("--color-warning", "#c47a14"),
              cssVar("--color-success", "#00875a"),
              "#0ea5e9",
              "#f97316"
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

  function renderManpowerTable() {
    const card = document.getElementById("manpowerListCard");
    if (!card) return;

    const manpower = getDisplayManpower();
    const hasDbRecords = byType("manpower").length > 0;

    let html = "";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table">';
    html += "<thead>";
    html += "<tr>";
    html += "<th>Category</th>";
    html += "<th>Unit</th>";
    html += '<th class="num">Total</th>';
    html += '<th class="num">Allocated</th>';
    html += '<th class="num">Remaining</th>';

    if (hasDbRecords) {
      html += '<th class="num">Actions</th>';
    }

    html += "</tr>";
    html += "</thead>";
    html += "<tbody>";

    manpower.forEach(function (item) {
      const remaining = getRemaining(item);

      html += '<tr data-resource-id="' + escapeAttr(item.id || "") + '">';
      html += "<td>" + escapeHTML(item.name) + "</td>";
      html += "<td>" + escapeHTML(item.unit || "") + "</td>";
      html += '<td class="num">' + formatNumber(item.total_capacity) + "</td>";
      html += '<td class="num">' + formatNumber(item.allocated_quantity || 0) + "</td>";
      html += '<td class="num">' + formatNumber(remaining) + "</td>";

      if (hasDbRecords) {
        html += "<td>" + renderActionButtons(item.id) + "</td>";
      }

      html += "</tr>";
    });

    html += "</tbody>";
    html += "</table>";
    html += "</div>";

    card.innerHTML = html;
  }

  function renderWorkforceByEmployerTable() {
    const card = document.getElementById("workforceByEmployerCard");
    if (!card) return;

    let html = "";
    html += '<div class="resource-report-heading">';
    html += "<h3>Workforce By Employer</h3>";
    html += "<p>Employer, category and headcount breakdown</p>";
    html += "</div>";
    html += '<div class="card-body table-scroll">';
    html += '<table class="data-table resource-report-table">';
    html += "<thead>";
    html += "<tr>";
    html += "<th>Group</th>";
    html += "<th>Category</th>";
    html += '<th class="num">Headcount</th>';
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

  function renderAll() {
    updateKPIs();
    renderMaterialsTable();
    renderHdpePipeStockTable();
    renderEquipmentCards();
    renderEquipmentDeploymentTable();
    renderManpowerProgressCards();
    renderManpowerChart();
    renderManpowerTable();
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
    if (box) box.remove();
  }

  async function loadResources() {
    if (!state.projectId) {
      showDashboardError("No project is selected. The dashboard is showing sample resource data until a project is selected.");
      renderAll();
      return;
    }

    try {
      const result = await api().request("GET", "/projects/" + state.projectId + "/resources?limit=200");
      state.resources = Array.isArray(result && result.data) ? result.data : [];
      clearDashboardError();
      renderAll();
    } catch (err) {
      state.resources = [];
      showError(err, "Failed to load resource dashboard data");
      showDashboardError(err.message || "Failed to load resource dashboard data. Showing sample resource data.");
      renderAll();
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
    html += '<div class="resource-modal" role="dialog" aria-modal="true">';
    html += '<div class="resource-modal__header">';
    html += "<h3>" + (isEdit ? "Edit " : "Add ") + config.label + "</h3>";
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

      if (!state.projectId && !isEdit) {
        toast("No project is selected. Please select or create a project first.", "fa-triangle-exclamation");
        return;
      }

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
    const exportBtn = document.getElementById("resourceExportBtn");
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

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function init() {
    if (state.initialized) return;

    state.initialized = true;

    ensureStyles();
    initGlobalClicks();
    initExportButton();

    renderAll();

    state.projectId = await resolveProjectId();

    await loadResources();
  }

  document.addEventListener("wsdp:authready", function () {
    init();
  });
})();