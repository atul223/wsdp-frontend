(function () {
  "use strict";

  let PROJECT_ID = (() => {
    const stored = localStorage.getItem("current_project");

    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored);
      return parsed.id || parsed.projectId || parsed.project_id || null;
    } catch (e) {
      return stored;
    }
  })();
  let dashboardData = null;

  const FALLBACK_AREA_PROGRESS = [
    {
      area: "Casa Verde",
      planned: 10.3,
      actual: 8.2,
      variance: -2.1,
      unit: "km",
    },
    {
      area: "Escola Portuguesa",
      planned: 12.5,
      actual: 10.4,
      variance: -2.1,
      unit: "km",
    },
    {
      area: "Comandante Cowboy",
      planned: 8.4,
      actual: 6.7,
      variance: -1.7,
      unit: "km",
    },
    {
      area: "Caixote / Socombar",
      planned: 13.2,
      actual: 8.9,
      variance: -4.3,
      unit: "km",
    },
    {
      area: "Joao de Almeida",
      planned: 9.1,
      actual: 7.4,
      variance: -1.7,
      unit: "km",
    },
    {
      area: "Arimba",
      planned: 8.6,
      actual: 6.0,
      variance: -2.6,
      unit: "km",
    },
    {
      area: "Sofrio",
      planned: 8.6,
      actual: 5.4,
      variance: -3.2,
      unit: "km",
    }
  ];

  const FALLBACK_PIPE_DIAMETER_MATRIX = [
    {
      diameter: "63 mm",
      planned: 9.8,
      installed: 8.1,
      unit: "km",
    },
    {
      diameter: "90 mm",
      planned: 14.2,
      installed: 11.7,
      unit: "km",
    },
    {
      diameter: "110 mm",
      planned: 16.8,
      installed: 13.9,
      unit: "km",
    },
    {
      diameter: "160 mm",
      planned: 12.9,
      installed: 10.7,
      unit: "km",
    },
    {
      diameter: "200 mm",
      planned: 9.7,
      installed: 6.2,
      unit: "km",
    },
    {
      diameter: "250 mm",
      planned: 4.5,
      installed: 2.8,
      unit: "km",
    },
    {
      diameter: "315 mm",
      planned: 2.1,
      installed: 1.3,
      unit: "km",
    }
  ];

  const FALLBACK_MONTHLY_PROGRESS = [
    {
      activity: "Pipeline Installation",
      previousMonth: "5.8 km",
      currentMonth: "8.2 km",
      cumulative: "15.1 km",
    },
    {
      activity: "Hydro Testing",
      previousMonth: "3.2 km",
      currentMonth: "4.4 km",
      cumulative: "7.6 km",
    },
    {
      activity: "House Connections",
      previousMonth: "580 Nos",
      currentMonth: "860 Nos",
      cumulative: "1,440 Nos",
    },
    {
      activity: "Valve Chambers",
      previousMonth: "8 Nos",
      currentMonth: "12 Nos",
      cumulative: "20 Nos",
    },
    {
      activity: "Road Restoration",
      previousMonth: "1,400 m²",
      currentMonth: "2,250 m²",
      cumulative: "3,650 m²",
    },
  ];

  function unwrap(result) {
    return result?.data?.data ?? result?.data ?? result;
  }

  function toast(message, icon) {
    window.WSDP_TOAST?.(message, {
      icon: icon || "fa-circle-check",
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

    function hasNumericValue(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function formatMaybeValue(value, unit) {
    if (!hasNumericValue(value)) {
      return escapeHtml(value || "Not quantified in report");
    }

    return formatProgressValue(value, unit);
  }

  function normalizeAreaName(value) {
    const raw = String(value || "").trim();
    const normalized = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const map = {
      "zone a": "Casa Verde",
      "zone b": "Escola Portuguesa",
      "zone c": "Cowboy I",
      "zone d": "Sofrio",
      "casa verde": "Casa Verde",
      "escola portuguesa": "Escola Portuguesa",
      "comandante cowboy": "Cowboy I",
      "cowboy i": "Cowboy I",
      "sofrio": "Sofrio",
      "so frio": "Sofrio",
      "joao de almeida": "João de Almeida",
      "joão de almeida": "João de Almeida",
      "caixote / socombar": "Caixote ou Socombar",
      "caixote o socumber": "Caixote ou Socombar",
      "caixote o socombar": "Caixote ou Socombar",
      "caixote ou socombar": "Caixote ou Socombar",
      "arimba": "Arimba"
    };

    return map[normalized] || raw || "-";
  }

  function getSelectedArea() {
    const select = document.getElementById("areaScopeFilter");
    return select ? select.value : "all";
  }

  function areaMatchesSelection(areaName) {
    const selected = getSelectedArea();

    if (!selected || selected === "all") {
      return true;
    }

    return normalizeAreaName(areaName) === selected;
  }

  function formatProgressValue(value, unit) {
    const n = numberValue(value);
    const formatted = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
    return `${formatted}${unit ? ` ${escapeHtml(unit)}` : ""}`;
  }

  function formatSignedValue(value, unit) {
    const n = numberValue(value);
    const sign = n > 0 ? "+" : "";
    const formatted = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
    return `${sign}${formatted}${unit ? ` ${escapeHtml(unit)}` : ""}`;
  }

  function getStatusClass(status) {
    const normalized = String(status || "").toLowerCase();

    if (
      normalized.includes("complete") ||
      normalized.includes("on track")
    ) {
      return "ok";
    }

    if (
      normalized.includes("delay") ||
      normalized.includes("noc") ||
      normalized.includes("not started")
    ) {
      return "crit";
    }

    return "warn";
  }

  async function ensureSessionAndProject() {
    let user = WSDP_API.getCurrentUser();

    if (!user) {
      user = await WSDP_API.restoreSession();
    }

    if (!user) {
      toast("Session expired. Please login again.", "fa-lock");
      window.location.href = "login.html";
      return false;
    }

    if (PROJECT_ID) {
      return true;
    }

    const result = await WSDP_API.request(
      "GET",
      "/construction-progress/default-project"
    );

    const project = unwrap(result);

    if (!project?.id) {
      toast("No project found for construction progress", "fa-circle-exclamation");
      return false;
    }

    PROJECT_ID = project.id;

    localStorage.setItem("current_project", JSON.stringify(project));
    localStorage.setItem("current_project_code", project.code || "");
    localStorage.setItem("current_project_name", project.name || "");

    return true;
  }

  async function loadDashboard() {
    try {
      if (!PROJECT_ID) {
        const ready = await ensureSessionAndProject();
        if (!ready) return;
      }

      const response = await WSDP_API.request(
        "GET",
        `/construction-progress/dashboard/${PROJECT_ID}`
      );

      dashboardData = unwrap(response);

      renderAll();
    } catch (error) {
      console.error(error);
      toast(
        error.message || "Failed to load construction data",
        "fa-circle-exclamation"
      );
    }
  }

  function renderAll() {
    renderPipelineKpis();
    renderAreaProgressTable();
    renderPipeDiameterMatrix();
    renderMonthlyProgressTable();
    renderPipelineTable();
    updatePipelineAreaChart();
    renderHouseKpis();
    
    renderTestingTable();
    renderBridgeCrossingsTable();

    renderValveSummary();

    renderBridgeCrossingsTable();
  }

  /* =========================
     PIPELINE
  ========================= */

  function renderPipelineKpis() {
    const pipeline = dashboardData?.pipeline;

    if (!pipeline) {
      setCountValue("pipelineLaidKm", null, 1);
      setCountValue("pipelineHydroTestedKm", null, 1);
      setCountValue("pipelineRemainingKm", null, 1);
      return;
    }

    setCountValue("pipelineLaidKm", pipeline.laid, 1);
    setCountValue(
      "pipelineHydroTestedKm",
      pipeline.tested ?? pipeline.hydroTested ?? pipeline.hydro_tested ?? null,
      1
    );
    setCountValue("pipelineRemainingKm", pipeline.remaining, 1);
  }

  function renderPipelineTable() {
    const tbody = document.querySelector("#pipelineTableBody");
    if (!tbody) return;

    const rows = dashboardData?.pipeline_sections || [];
    const selectedArea = getSelectedArea();

    const filteredRows = selectedArea === "all"
      ? rows
      : rows.filter((section) => areaMatchesSelection(section.zone || section.area));

    tbody.innerHTML = "";

    if (!filteredRows.length) {
      tbody.innerHTML = emptyRow(5, "No pipeline sections added yet.");
      return;
    }

    filteredRows.forEach((section) => {
      const areaName = normalizeAreaName(section.zone || section.area);
      const chainage = `${section.chainageFrom || "-"} - ${section.chainageTo || "-"}`;
      const planned = section.plannedValue ?? section.lengthKm ?? section.planned ?? null;
      const actual = section.actualValue ?? section.installed ?? section.laid ?? null;

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr data-area="${escapeHtml(areaName)}">
            <td>
              <strong>${escapeHtml(areaName)}</strong><br>
              <span style="color:var(--text-muted);font-size:12px;">${escapeHtml(chainage)}</span>
            </td>
            <td class="num">${formatMaybeValue(planned, "km")}</td>
            <td class="num">${formatMaybeValue(actual, "km")}</td>
            <td>
              <span class="status-chip ${getStatusClass(section.status)}">
                ${escapeHtml(section.status || "In Progress")}
              </span>
            </td>
            <td class="actions-col">
              <button class="btn-ghost edit-pipeline" type="button" data-id="${section.id}">
                Edit
              </button>
              <button class="btn-ghost delete-pipeline" type="button" data-id="${section.id}">
                Delete
              </button>
            </td>
          </tr>
        `
      );
    });
  }

  function renderAreaProgressTable() {
    const tbody = document.querySelector("#areaProgressTableBody");
    if (!tbody) return;

    const rows =
      dashboardData?.area_progress ||
      dashboardData?.areaProgress ||
      dashboardData?.area_wise_progress ||
      FALLBACK_AREA_PROGRESS;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(4, "No area-wise progress data available.");
      return;
    }

    rows.forEach((item) => {
      const planned = numberValue(item.planned);
      const actual = numberValue(item.actual);
      const varianceValue =
        item.variance !== undefined && item.variance !== null
          ? numberValue(item.variance)
          : actual - planned;

      const unit = item.unit || "km";
      const varianceClass =
        varianceValue < 0 ? "down" : varianceValue > 0 ? "up" : "flat";

      tbody.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>${escapeHtml(item.area || item.zone || item.name || "-")}</td>
          <td class="num">${formatProgressValue(planned, unit)}</td>
          <td class="num">${formatProgressValue(actual, unit)}</td>
          <td class="num">
            <span class="kpi-card__delta ${varianceClass}" style="justify-content:flex-end;">
              ${formatSignedValue(varianceValue, unit)}
            </span>
          </td>
        </tr>
        `
      );
    });
  }

  function renderPipeDiameterMatrix() {
    const tbody = document.querySelector("#pipeDiameterTableBody");
    if (!tbody) return;

    const rows =
      dashboardData?.pipe_diameter_matrix ||
      dashboardData?.pipeDiameterMatrix ||
      dashboardData?.diameter_matrix ||
      FALLBACK_PIPE_DIAMETER_MATRIX;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(3, "No pipe diameter matrix data available.");
      return;
    }

    rows.forEach((item) => {
      const unit = item.unit || "km";

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(item.diameter || item.pipeDiameter || "-")}</td>
            <td class="num">${formatProgressValue(item.planned, unit)}</td>
            <td class="num">${formatProgressValue(item.installed ?? item.actual, unit)}</td>
          </tr>
        `
      );
    });
  }

  function renderMonthlyProgressTable() {
    const tbody = document.querySelector("#monthlyProgressTableBody");
    if (!tbody) return;

    const rows =
      dashboardData?.monthly_progress ||
      dashboardData?.monthlyProgress ||
      dashboardData?.progress_monthly ||
      FALLBACK_MONTHLY_PROGRESS;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(4, "No monthly progress data available.");
      return;
    }

    rows.forEach((item) => {
      const unit = item.unit || "";

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(item.activity || item.activityName || "-")}</td>
            <td class="num">${formatMaybeValue(item.previousMonth ?? item.previous_month, unit)}</td>
            <td class="num">${formatMaybeValue(item.currentMonth ?? item.current_month, unit)}</td>
            <td class="num">${formatMaybeValue(item.cumulative, unit)}</td>
          </tr>
        `
      );
    });
  }

  function updatePipelineAreaChart() {
    const chart = window.WSDP_PIPELINE_AREA_CHART;

    if (!chart) {
      return;
    }

    const sourceRows =
      dashboardData?.area_progress ||
      dashboardData?.areaProgress ||
      dashboardData?.area_wise_progress ||
      FALLBACK_AREA_PROGRESS;

    const areaOrder = [
      "Casa Verde",
      "Escola Portuguesa",
      "Cowboy I",
      "Sofrio",
      "João de Almeida",
      "Caixote ou Socombar",
      "Arimba"
    ];

    const planned = [];
    const actual = [];

    areaOrder.forEach((areaName) => {
      const match = sourceRows.find((item) => {
        return normalizeAreaName(item.area || item.zone || item.name) === areaName;
      });

      planned.push(hasNumericValue(match?.planned) ? numberValue(match.planned) : 0);
      actual.push(hasNumericValue(match?.actual) ? numberValue(match.actual) : 0);
    });

    chart.data.labels = areaOrder;
    chart.data.datasets[0].data = planned;
    chart.data.datasets[1].data = actual;
    chart.update();
  }
  
  function openPipelineModal(id) {
    const existing = id
      ? dashboardData.pipeline_sections.find((x) => x.id === id)
      : null;

    openCrudModal({
      title: existing ? "Edit Pipeline Section" : "Add Pipeline Section",
      fields: [
        inputField("Zone", "zone", existing?.zone, "text", true),
        inputField("Chainage From", "chainageFrom", existing?.chainageFrom, "text", true),
        inputField("Chainage To", "chainageTo", existing?.chainageTo, "text", true),
        inputField("Diameter", "diameter", existing?.diameter, "text", true),
        inputField("Length KM", "lengthKm", existing?.lengthKm, "number", true, "0.01"),
        inputField("Laying %", "layingPct", existing?.layingPct ?? 0, "number", true, "0.01"),
        inputField("Testing %", "testingPct", existing?.testingPct ?? 0, "number", true, "0.01"),
        selectField("Status", "status", existing?.status, [
          "Complete",
          "In Progress",
          "Testing",
          "Not Started",
          "Delayed",
        ]),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;
        payload.lengthKm = numberValue(payload.lengthKm);
        payload.layingPct = numberValue(payload.layingPct);
        payload.testingPct = numberValue(payload.testingPct);

        if (id) {
          await WSDP_API.request(
            "PUT",
            `/construction-progress/pipeline-section/${id}`,
            payload
          );
        } else {
          await WSDP_API.request(
            "POST",
            "/construction-progress/pipeline-section",
            payload
          );
        }

        toast("Pipeline section saved successfully");
        await loadDashboard();
      },
    });
  }

  async function deletePipeline(id) {
    if (!confirm("Delete this pipeline section?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/pipeline-section/${id}`
    );

    toast("Pipeline section deleted");
    await loadDashboard();
  }

  /* =========================
     HOUSE CONNECTIONS
  ========================= */

  function renderHouseKpis() {
    const totals = dashboardData?.house_connections;
    if (!totals) return;

    setCountValue("houseCompletedCount", totals.completed, 0);
    setCountValue("houseInProgressCount", totals.inProgress, 0);
    setCountValue("houseRemainingCount", totals.remaining, 0);
  }

  /* =========================
     TESTING
  ========================= */

  function renderTestingTable() {
    const tbody = document.querySelector("#testingActivityTableBody");
    if (!tbody) return;

    const rows =
      dashboardData?.testing && dashboardData.testing.length
        ? dashboardData.testing
        : FALLBACK_TESTING_ACTIVITIES;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "No testing activities added yet.");
      return;
    }

    rows.forEach((activity) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(activity.activityName || activity.name || "-")}</td>
            <td class="num">${formatMaybeValue(activity.plannedValue ?? activity.planned, activity.unit || "")}</td>
            <td class="num">${formatMaybeValue(activity.actualValue ?? activity.actual, activity.unit || "")}</td>
            <td>
              <span class="status-chip ${getStatusClass(activity.status)}">
                ${escapeHtml(activity.status || "In Progress")}
              </span>
            </td>
            <td class="actions-col">
              ${
                String(activity.id || "").startsWith("report-")
                  ? `<span style="color:var(--text-muted);font-size:12px;">Report fallback</span>`
                  : `
                    <button class="btn-ghost edit-testing" type="button" data-id="${activity.id}">
                      Edit
                    </button>
                    <button class="btn-ghost delete-testing" type="button" data-id="${activity.id}">
                      Delete
                    </button>
                  `
              }
            </td>
          </tr>
        `
      );
    });
  }

  function openTestingModal(id) {
    const existing = id
      ? dashboardData.testing.find((x) => x.id === id)
      : null;

    openCrudModal({
      title: existing ? "Edit Testing Activity" : "Add Testing Activity",
      fields: [
        inputField("Activity Name", "activityName", existing?.activityName, "text", true),
        inputField("Planned Value", "plannedValue", existing?.plannedValue ?? 0, "number", true, "0.01"),
        inputField("Actual Value", "actualValue", existing?.actualValue ?? 0, "number", true, "0.01"),
        inputField("Unit", "unit", existing?.unit || "km", "text", true),
        selectField("Status", "status", existing?.status, [
          "On Track",
          "In Progress",
          "Complete",
          "Delayed",
          "Not Started",
        ]),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;
        payload.plannedValue = numberValue(payload.plannedValue);
        payload.actualValue = numberValue(payload.actualValue);

        if (id) {
          await WSDP_API.request(
            "PUT",
            `/construction-progress/testing-activity/${id}`,
            payload
          );
        } else {
          await WSDP_API.request(
            "POST",
            "/construction-progress/testing-activity",
            payload
          );
        }

        toast("Testing activity saved successfully");
        await loadDashboard();
      },
    });
  }

  async function deleteTestingActivity(id) {
    if (!confirm("Delete this testing activity?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/testing-activity/${id}`
    );

    toast("Testing activity deleted");
    await loadDashboard();
  }

  /* =========================
     VALVE SUMMARY
  ========================= */

  function renderValveSummary() {
    const valve = dashboardData?.valve || {
      planned: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
    };

    setText("valvePlannedCount", valve.planned);
    setText("valveCompletedCount", valve.completed);
    setText("valveInProgressCount", valve.inProgress);
    setText("valveNotStartedCount", valve.notStarted);
  }

  function openValveModal() {
    const valve = dashboardData?.valve || {
      planned: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
    };

    openCrudModal({
      title: "Update Valve Chamber Summary",
      fields: [
        inputField("Total Planned", "planned", valve.planned, "number", true),
        inputField("Completed", "completed", valve.completed, "number", true),
        inputField("In Progress", "inProgress", valve.inProgress, "number", true),
        inputField("Not Started", "notStarted", valve.notStarted, "number", true),
      ],
      onSubmit: async (payload) => {
        payload.planned = parseInt(payload.planned || 0, 10);
        payload.completed = parseInt(payload.completed || 0, 10);
        payload.inProgress = parseInt(payload.inProgress || 0, 10);
        payload.notStarted = parseInt(payload.notStarted || 0, 10);

        await WSDP_API.request(
          "PUT",
          `/construction-progress/valve-summary/${PROJECT_ID}`,
          payload
        );

        toast("Valve chamber summary updated");
        await loadDashboard();
      },
    });
  }

  /* =========================
     BRIDGE CROSSINGS
  ========================= */

  function renderBridgeCrossingsTable() {
    const tbody = document.querySelector("#bridgeCrossingTableBody");
    if (!tbody) return;

    const rows = dashboardData?.crossings || [];
    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "No bridge crossings added yet.");
      return;
    }

    rows.forEach((crossing) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(crossing.crossingName)}</td>
            <td>${escapeHtml(crossing.crossingType)}</td>
            <td>${escapeHtml(crossing.method)}</td>
            <td>
              <span class="status-chip ${getStatusClass(crossing.status)}">
                ${escapeHtml(crossing.status)}
              </span>
            </td>
            <td class="actions-col">
              <button class="btn-ghost edit-bridge" type="button" data-id="${crossing.id}">
                Edit
              </button>
              <button class="btn-ghost delete-bridge" type="button" data-id="${crossing.id}">
                Delete
              </button>
            </td>
          </tr>
        `
      );
    });
  }

  function openBridgeModal(id) {
    const existing = id
      ? dashboardData.crossings.find((x) => x.id === id)
      : null;

    openCrudModal({
      title: existing ? "Edit Bridge Crossing" : "Add Bridge Crossing",
      fields: [
        inputField("Crossing Name", "crossingName", existing?.crossingName, "text", true),
        inputField("Type", "crossingType", existing?.crossingType, "text", true),
        inputField("Method", "method", existing?.method, "text", true),
        selectField("Status", "status", existing?.status, [
          "Complete",
          "In Progress",
          "Delayed — NOC",
          "Not Started",
        ]),
        inputField("Remarks", "remarks", existing?.remarks || "", "text", false),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;

        if (id) {
          await WSDP_API.request(
            "PUT",
            `/construction-progress/bridge-crossing/${id}`,
            payload
          );
        } else {
          await WSDP_API.request(
            "POST",
            "/construction-progress/bridge-crossing",
            payload
          );
        }

        toast("Bridge crossing saved successfully");
        await loadDashboard();
      },
    });
  }

  async function deleteBridgeCrossing(id) {
    if (!confirm("Delete this bridge crossing?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/bridge-crossing/${id}`
    );

    toast("Bridge crossing deleted");
    await loadDashboard();
  }

  /* =========================
     MODAL HELPERS
  ========================= */

  function openCrudModal(config) {
    const modal = document.getElementById("crudModal");
    const form = document.getElementById("crudForm");
    const title = document.getElementById("crudModalTitle");

    if (!modal || !form) return;

    if (title) {
      title.textContent = config.title;
    }

    form.innerHTML = config.fields.join("");

    modal.hidden = false;

    form.onsubmit = async function (e) {
      e.preventDefault();

      const payload = Object.fromEntries(new FormData(form));

      try {
        await config.onSubmit(payload);
        modal.hidden = true;
      } catch (err) {
        console.error(err);
        toast(err.message || "Save failed", "fa-circle-exclamation");
      }
    };
  }

  function inputField(label, name, value, type, required, step) {
    return `
      <label style="display:block;margin-top:10px;font-weight:600;">
        ${escapeHtml(label)}
      </label>
      <input
        name="${escapeHtml(name)}"
        type="${escapeHtml(type || "text")}"
        value="${escapeHtml(value ?? "")}"
        ${required ? "required" : ""}
        ${step ? `step="${escapeHtml(step)}"` : ""}
        style="width:100%;padding:10px;margin-top:4px;border:1px solid #d0d5dd;border-radius:8px;"
      >
    `;
  }

  function selectField(label, name, selected, options) {
    const opts = options
      .map((option) => {
        const isSelected = option === selected ? "selected" : "";
        return `<option value="${escapeHtml(option)}" ${isSelected}>${escapeHtml(option)}</option>`;
      })
      .join("");

    return `
      <label style="display:block;margin-top:10px;font-weight:600;">
        ${escapeHtml(label)}
      </label>
      <select
        name="${escapeHtml(name)}"
        required
        style="width:100%;padding:10px;margin-top:4px;border:1px solid #d0d5dd;border-radius:8px;"
      >
        ${opts}
      </select>
    `;
  }

  function emptyRow(colspan, message) {
    return `
      <tr>
        <td colspan="${colspan}">
          <div class="empty-state">
            <i class="fa-solid fa-circle-info"></i>
            <p>${escapeHtml(message)}</p>
          </div>
        </td>
      </tr>
    `;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value ?? 0;
    }
  }

  function setCountValue(id, value, decimals) {
    const el = document.getElementById(id);
    if (!el) return;

    if (!hasNumericValue(value)) {
      el.dataset.count = "0";
      el.textContent = "N/A";
      return;
    }

    const n = numberValue(value);
    el.dataset.count = String(n);
    el.textContent = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  }

  function initConstructionDateRangePicker() {
    const picker = document.getElementById("constructionDateRangePicker");
    const button = document.getElementById("constructionDateRangeButton");
    const panel = document.getElementById("constructionDateRangePanel");
    const label = document.getElementById("constructionDateRangeLabel");
    const monthSelect = document.getElementById("constructionCalendarMonth");
    const yearSelect = document.getElementById("constructionCalendarYear");
    const grid = document.getElementById("constructionCalendarGrid");
    const clearBtn = document.getElementById("clearConstructionDateRange");
    const applyBtn = document.getElementById("applyConstructionDateRange");

    if (!picker || !button || !panel || !label || !monthSelect || !yearSelect || !grid) {
      return;
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const today = new Date();
    let selectedStart = null;
    let selectedEnd = null;
    let visibleMonth = today.getMonth();
    let visibleYear = today.getFullYear();

    function pad(value) {
      return String(value).padStart(2, "0");
    }

    function toIsoDate(date) {
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    }

    function formatDate(date) {
      return pad(date.getDate()) + " " + monthNames[date.getMonth()].slice(0, 3) + " " + date.getFullYear();
    }

    function sameDate(a, b) {
      return a && b && toIsoDate(a) === toIsoDate(b);
    }

    function isBetween(date, start, end) {
      if (!start || !end) return false;
      const time = date.getTime();
      return time > start.getTime() && time < end.getTime();
    }

    function populateSelectors() {
      monthSelect.innerHTML = "";
      yearSelect.innerHTML = "";

      monthNames.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = month;
        monthSelect.appendChild(option);
      });

      for (let year = today.getFullYear() - 5; year <= today.getFullYear() + 5; year++) {
        const yearOption = document.createElement("option");
        yearOption.value = String(year);
        yearOption.textContent = String(year);
        yearSelect.appendChild(yearOption);
      }

      monthSelect.value = String(visibleMonth);
      yearSelect.value = String(visibleYear);
    }

    function updateLabel() {
      if (selectedStart && selectedEnd) {
        label.textContent = formatDate(selectedStart) + " - " + formatDate(selectedEnd);
      } else if (selectedStart) {
        label.textContent = formatDate(selectedStart);
      } else {
        label.textContent = "Select date range";
      }
    }

    function renderCalendar() {
      grid.innerHTML = "";

      const firstDay = new Date(visibleYear, visibleMonth, 1);
      const lastDay = new Date(visibleYear, visibleMonth + 1, 0);
      const startOffset = firstDay.getDay();
      const totalDays = lastDay.getDate();

      for (let blank = 0; blank < startOffset; blank++) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.className = "calendar-day is-muted";
        empty.disabled = true;
        grid.appendChild(empty);
      }

      for (let day = 1; day <= totalDays; day++) {
        const date = new Date(visibleYear, visibleMonth, day);
        const dayButton = document.createElement("button");

        dayButton.type = "button";
        dayButton.className = "calendar-day";
        dayButton.textContent = String(day);
        dayButton.dataset.date = toIsoDate(date);

        if (sameDate(date, selectedStart) || sameDate(date, selectedEnd)) {
          dayButton.classList.add("is-selected");
        } else if (isBetween(date, selectedStart, selectedEnd)) {
          dayButton.classList.add("is-in-range");
        }

        dayButton.addEventListener("click", function () {
          const parts = this.dataset.date.split("-");
          const clicked = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

          if (!selectedStart || selectedEnd) {
            selectedStart = clicked;
            selectedEnd = null;
          } else if (clicked.getTime() < selectedStart.getTime()) {
            selectedEnd = selectedStart;
            selectedStart = clicked;
          } else {
            selectedEnd = clicked;
          }

          updateLabel();
          renderCalendar();

          picker.dispatchEvent(new CustomEvent("construction-date-range-change", {
            detail: {
              startDate: selectedStart ? toIsoDate(selectedStart) : null,
              endDate: selectedEnd ? toIsoDate(selectedEnd) : null
            }
          }));
        });

        grid.appendChild(dayButton);
      }
    }

    button.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
    });

    monthSelect.addEventListener("change", function () {
      visibleMonth = Number(monthSelect.value);
      renderCalendar();
    });

    yearSelect.addEventListener("change", function () {
      visibleYear = Number(yearSelect.value);
      renderCalendar();
    });

    clearBtn.addEventListener("click", function () {
      selectedStart = null;
      selectedEnd = null;
      updateLabel();
      renderCalendar();

      picker.dispatchEvent(new CustomEvent("construction-date-range-change", {
        detail: {
          startDate: null,
          endDate: null
        }
      }));
    });

    applyBtn.addEventListener("click", function () {
      panel.hidden = true;
    });

    document.addEventListener("click", function (event) {
      if (!picker.contains(event.target)) {
        panel.hidden = true;
      }
    });

    populateSelectors();
    renderCalendar();
    updateLabel();
  }

  /* =========================
     EVENTS
  ========================= */

  document.addEventListener("click", async function (e) {
    const target = e.target.closest("button");
    if (!target) return;

    try {
      if (target.id === "addPipelineSectionBtn") {
        openPipelineModal();
      }

      if (target.classList.contains("edit-pipeline")) {
        openPipelineModal(target.dataset.id);
      }

      if (target.classList.contains("delete-pipeline")) {
        await deletePipeline(target.dataset.id);
      }

      if (target.id === "addTestingActivityBtn") {
        openTestingModal();
      }

      if (target.classList.contains("edit-testing")) {
        openTestingModal(target.dataset.id);
      }

      if (target.classList.contains("delete-testing")) {
        await deleteTestingActivity(target.dataset.id);
      }

      if (target.id === "editValveSummaryBtn") {
        openValveModal();
      }

      if (target.id === "addBridgeCrossingBtn") {
        openBridgeModal();
      }

      if (target.classList.contains("edit-bridge")) {
        openBridgeModal(target.dataset.id);
      }

      if (target.classList.contains("delete-bridge")) {
        await deleteBridgeCrossing(target.dataset.id);
      }

      if (target.id === "cancelCrudBtn") {
        document.getElementById("crudModal").hidden = true;
      }
    } catch (err) {
      console.error(err);
      toast(err.message || "Action failed", "fa-circle-exclamation");
    }
  });

  document.addEventListener("wsdp:authready", async function () {
    const ready = await ensureSessionAndProject();

    if (!ready) {
      return;
    }

    await loadDashboard();
  });

  document.addEventListener("DOMContentLoaded", function () {
    initConstructionDateRangePicker();

    const areaFilter = document.getElementById("areaScopeFilter");

    if (areaFilter) {
      areaFilter.addEventListener("change", function () {
        renderAreaProgressTable();
        renderPipelineTable();
      });
    }

    const picker = document.getElementById("constructionDateRangePicker");

    if (picker) {
      picker.addEventListener("construction-date-range-change", function (event) {
        window.WSDP_CONSTRUCTION_DATE_RANGE = event.detail;
      });
    }
  });

})();