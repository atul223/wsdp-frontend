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

  /* =========================================================
     REPORT-BASED DATA
     Source: 50CS3_LUBANGO_UCP-P_ENG_MR_Technical_July 2026 report
     ========================================================= */

  const REPORT_PIPELINE_SUMMARY = {
    total: 70.0,
    laid: 31.2005,
    hydroTested: 0,
    remaining: 38.7995,
  };

  const REPORT_HOUSE_CONNECTIONS = {
    completed: 0,
    inProgress: 0,
    remaining: 5000,
  };

  const REPORT_VALVE_SUMMARY = {
    planned: 11,
    completed: 0,
    inProgress: 0,
    notStarted: 11,
  };

  // Area-wise Progress (Section 3.2 Planning Control, monthly Planned/Executed per area)
  const FALLBACK_AREA_PROGRESS = [
    {
      area: "Casa Verde",
      planned: 0.180,
      actual: 0.204,
      variance: 0.024,
      unit: "km",
    },
    {
      area: "Escola Portuguesa",
      planned: 0.800,
      actual: 0.324,
      variance: -0.476,
      unit: "km",
    },
    {
      area: "Cowboy I",
      planned: 0.000,
      actual: 0.000,
      variance: 0.000,
      unit: "km",
    },
    {
      area: "Sofrio",
      planned: 2.108,
      actual: 0.798,
      variance: -1.310,
      unit: "km",
    },
    {
      area: "João de Almeida",
      planned: 2.500,
      actual: 0.000,
      variance: -2.500,
      unit: "km",
    },
    {
      area: "Caixote ou Socombar",
      planned: 0.500,
      actual: 0.342,
      variance: -0.158,
      unit: "km",
    },
    {
      area: "Arimba",
      planned: 0.000,
      actual: 0.000,
      variance: 0.000,
      unit: "km",
    }
  ];

  // Pipe Diameter Progress Matrix (Design/Planned per diameter vs. Installed per
  // "Materials and Equipment in Stock" - Quantity Used, Section 9)
  const FALLBACK_PIPE_DIAMETER_MATRIX = [
    {
      diameter: "De63 mm",
      planned: 18.796,
      installed: 16.877,
      unit: "km",
    },
    {
      diameter: "De75 mm",
      planned: 1.078,
      installed: 0.768,
      unit: "km",
    },
    {
      diameter: "De90 mm",
      planned: 6.012,
      installed: 5.277,
      unit: "km",
    },
    {
      diameter: "De110 mm",
      planned: 2.075,
      installed: 1.236,
      unit: "km",
    },
    {
      diameter: "De160 mm PN10",
      planned: 4.929,
      installed: 2.832,
      unit: "km",
    },
    {
      diameter: "De160 mm PN16",
      planned: 0.299,
      installed: 0.000,
      unit: "km",
    },
    {
      diameter: "De200 mm",
      planned: 1.256,
      installed: 1.152,
      unit: "km",
    },
    {
      diameter: "De250 mm",
      planned: 2.203,
      installed: 1.966,
      unit: "km",
    },
    {
      diameter: "De315 mm",
      planned: 1.412,
      installed: 1.0925,
      unit: "km",
    },
    {
      diameter: "Steel Pipe",
      planned: 0.079,
      installed: 0.000,
      unit: "km",
    }
  ];

  // Monthly Progress Summary (Section 3.2 Planning Control + Executive Summary)
  const FALLBACK_MONTHLY_PROGRESS = [
    {
      activity: "Pipeline Installation",
      previousMonth: 29.5325,
      currentMonth: 1.668,
      cumulative: 31.2005,
      unit: "km",
    },
    {
      activity: "Hydro Testing",
      previousMonth: 0,
      currentMonth: 0,
      cumulative: 0,
      unit: "km",
    },
    {
      activity: "House Connections",
      previousMonth: 0,
      currentMonth: 0,
      cumulative: 0,
      unit: "Nos",
    },
    {
      activity: "Valve Chambers",
      previousMonth: 0,
      currentMonth: 0,
      cumulative: 0,
      unit: "Nos",
    },
    {
      activity: "Bridge Crossings",
      previousMonth: "Not specified",
      currentMonth: "Not specified",
      cumulative: "3 Nos planned",
      unit: "",
    }
  ];

  // Testing & Commissioning (Section 3.4 Tests / Executive Summary - Pressure/Disinfection Tests [E])
  const FALLBACK_TESTING_ACTIVITIES = [
    {
      id: "report-testing-1",
      activityName: "Pipeline Pressure Testing",
      plannedValue: 70.0,
      actualValue: 0,
      unit: "km",
      status: "Not Started",
    },
    {
      id: "report-testing-2",
      activityName: "Disinfection Testing",
      plannedValue: 70.0,
      actualValue: 0,
      unit: "km",
      status: "Not Started",
    }
  ];

  // Bridge Crossings (Section 2.2 Table 1 - "Pipeline crossing a river/stream: 3 no's")
  const FALLBACK_BRIDGE_CROSSINGS = [
    {
      id: "report-bridge-1",
      area: "As per Detailed Design",
      crossingType: "River/Stream Crossing",
      span: "3 Nos Planned",
      status: "Not Started",
    }
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
      .replaceAll("'", "&#39;");
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

  // Returns `source` when it is a non-empty array, otherwise falls back to
  // the provided report-based fallback rows. Used by every table renderer so
  // that live backend data (once available) always takes priority over the
  // static report fallback.
  function pickRows(source, fallback) {
    if (Array.isArray(source) && source.length) {
      return source;
    }
    return Array.isArray(fallback) ? fallback : [];
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
      console.error("[construction-progress] dashboard fetch failed, showing report fallback data:", error);
      toast(
        error.message || "Live data unavailable — showing latest report figures",
        "fa-circle-exclamation"
      );
      // Even if the backend call fails (404 / 500 / CORS / not authenticated yet),
      // still render the tables using the report-based fallback data so the
      // page is never left blank.
      dashboardData = null;
      renderAll();
    }
  }

  function renderAll() {
    renderPipelineKpis();
    renderAreaProgressTable();
    renderPipeDiameterMatrix();
    renderMonthlyProgressTable();
    updatePipelineAreaChart();

    renderHouseKpis();

    renderTestingTable();

    renderValveSummary();

    renderBridgeCrossingsTable();
  }

  /* =========================
     PIPELINE
  ========================= */

  function renderPipelineKpis() {
    const pipeline = REPORT_PIPELINE_SUMMARY;
    const totalLength = REPORT_PIPELINE_SUMMARY.total;

    setCountValue("pipelineLaidKm", pipeline.laid, 1);
    setCountValue("pipelineHydroTestedKm", pipeline.hydroTested, 1);
    setCountValue("pipelineRemainingKm", pipeline.remaining, 1);

    const laidDelta = document
      .getElementById("pipelineLaidKm")
      ?.closest(".card-body")
      ?.querySelector(".kpi-card__delta");

    const testedDelta = document
      .getElementById("pipelineHydroTestedKm")
      ?.closest(".card-body")
      ?.querySelector(".kpi-card__delta");

    const remainingDelta = document
      .getElementById("pipelineRemainingKm")
      ?.closest(".card-body")
      ?.querySelector(".kpi-card__delta");

    if (laidDelta) {
      laidDelta.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${((pipeline.laid / totalLength) * 100).toFixed(1)}% of total`;
    }

    if (testedDelta) {
      testedDelta.textContent = `${((pipeline.hydroTested / totalLength) * 100).toFixed(1)}% of total`;
    }

    if (remainingDelta) {
      remainingDelta.textContent = `${((pipeline.remaining / totalLength) * 100).toFixed(1)}% of total`;
    }
  }

  function renderAreaProgressTable() {
    const tbody = document.querySelector("#areaProgressTableBody");
    if (!tbody) return;

    const source =
      dashboardData?.area_progress ||
      dashboardData?.areaProgress ||
      dashboardData?.area_wise_progress;

    const rows = pickRows(source, FALLBACK_AREA_PROGRESS);

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(4, "No area-wise progress data available.");
      return;
    }

    rows.forEach((item) => {
      const areaName = normalizeAreaName(item.area || item.zone || item.name);
      const planned = item.planned;
      const actual = item.actual;
      const varianceValue =
        item.variance !== undefined && item.variance !== null
          ? item.variance
          : numberValue(actual) - numberValue(planned);

      const unit = item.unit || "km";
      const varianceClass =
        numberValue(varianceValue) < 0 ? "down" :
        numberValue(varianceValue) > 0 ? "up" : "flat";

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(areaName)}</td>
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

    const source =
      dashboardData?.pipe_diameter_matrix ||
      dashboardData?.pipeDiameterMatrix ||
      dashboardData?.diameter_matrix;

    const rows = pickRows(source, FALLBACK_PIPE_DIAMETER_MATRIX);

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

    const rows = FALLBACK_AREA_PROGRESS;

    chart.data.labels = rows.map((item) => item.area);
    chart.data.datasets[0].data = rows.map((item) => numberValue(item.planned));
    chart.data.datasets[1].data = rows.map((item) => numberValue(item.actual));
    chart.update();
  }

  /* =========================
     HOUSE CONNECTIONS
  ========================= */

  function renderHouseKpis() {
    const totals = REPORT_HOUSE_CONNECTIONS;

    setCountValue("houseCompletedCount", totals.completed, 0);
    setCountValue("houseInProgressCount", totals.inProgress, 0);
    setCountValue("houseRemainingCount", totals.remaining, 0);

    const completedDelta = document
      .getElementById("houseCompletedCount")
      ?.closest(".card-body")
      ?.querySelector(".kpi-card__delta");

    const inProgressDelta = document
      .getElementById("houseInProgressCount")
      ?.closest(".card-body")
      ?.querySelector(".kpi-card__delta");

    const remainingDelta = document
      .getElementById("houseRemainingCount")
      ?.closest(".card-body")
      ?.querySelector(".kpi-card__delta");

    if (completedDelta) completedDelta.textContent = "0.0% of scope";
    if (inProgressDelta) inProgressDelta.textContent = "0.0% of scope";
    if (remainingDelta) remainingDelta.textContent = "100.0% of scope";
  }

  /* =========================
     TESTING
  ========================= */

  function renderTestingTable() {
    const tbody = document.querySelector("#testingActivityTableBody");
    if (!tbody) return;

    const rows = pickRows(dashboardData?.testing, FALLBACK_TESTING_ACTIVITIES);

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "No testing activities added yet.");
      return;
    }

    rows.forEach((activity) => {
      const isReportFallback = String(activity.id || "").startsWith("report-");

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(activity.activityName || activity.name || "-")}</td>
            <td class="num">${formatProgressValue(activity.plannedValue ?? activity.planned, activity.unit || "")}</td>
            <td class="num">${formatProgressValue(activity.actualValue ?? activity.actual, activity.unit || "")}</td>
            <td>
              <span class="status-chip ${getStatusClass(activity.status)}">
                ${escapeHtml(activity.status || "Not Started")}
              </span>
            </td>
            <td class="actions-col">
              ${
                isReportFallback
                  ? `<span style="color:var(--text-muted);font-size:12px;">Report data</span>`
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
    const valve = REPORT_VALVE_SUMMARY;

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

    const rows = pickRows(dashboardData?.crossings, FALLBACK_BRIDGE_CROSSINGS);

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(5, "No bridge crossings added yet.");
      return;
    }

    rows.forEach((crossing) => {
      const isReportFallback = String(crossing.id || "").startsWith("report-");

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(crossing.area || crossing.crossingName || "-")}</td>
            <td>${escapeHtml(crossing.crossingType || crossing.type || "-")}</td>
            <td class="num">${escapeHtml(crossing.span || "-")}</td>
            <td>
              <span class="status-chip ${getStatusClass(crossing.status)}">
                ${escapeHtml(crossing.status || "Not Started")}
              </span>
            </td>
            <td class="actions-col">
              ${
                isReportFallback
                  ? `<span style="color:var(--text-muted);font-size:12px;">Report fallback</span>`
                  : `
                    <button class="btn-ghost edit-bridge" type="button" data-id="${crossing.id}">
                      Edit
                    </button>
                    <button class="btn-ghost delete-bridge" type="button" data-id="${crossing.id}">
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

  function openBridgeModal(id) {
    const existing = id
      ? dashboardData.crossings.find((x) => x.id === id)
      : null;

    openCrudModal({
      title: existing ? "Edit Bridge Crossing" : "Add Bridge Crossing",
      fields: [
        inputField("Area", "area", existing?.area || existing?.crossingName, "text", true),
        inputField("Type", "crossingType", existing?.crossingType || existing?.type, "text", true),
        inputField("Span", "span", existing?.span || "", "text", true),
        selectField("Status", "status", existing?.status, [
          "Complete",
          "In Progress",
          "Delayed",
          "Not Started",
        ]),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;

        payload.crossingName = payload.area;
        payload.method = payload.span;

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

    // Render tables immediately with report-based fallback data (dashboardData
    // is still null at this point). This guarantees the tables are never left
    // blank, even if the "wsdp:authready" event is delayed, never fires, or the
    // backend dashboard endpoint errors out. Once live data loads successfully
    // (see loadDashboard/renderAll below), this gets overwritten automatically.
    renderAll();

    const areaFilter = document.getElementById("areaScopeFilter");

    if (areaFilter) {
      areaFilter.addEventListener("change", function () {
        renderAreaProgressTable();
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
