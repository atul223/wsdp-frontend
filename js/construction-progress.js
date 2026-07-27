(function () {
  "use strict";

  let PROJECT_ID = localStorage.getItem("current_project");
  let dashboardData = null;

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
    const user = await WSDP_API.restoreSession();

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
    localStorage.setItem("current_project", project.id);
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
    renderPipelineTable();

    renderHouseKpis();
    renderHouseClustersTable();

    renderTestingTable();

    renderValveSummary();

    renderBridgeCrossingsTable();
  }

  /* =========================
     PIPELINE
  ========================= */

  function renderPipelineKpis() {
    if (!dashboardData?.pipeline) return;

    setCountValue("pipelineLaidKm", dashboardData.pipeline.laid, 1);
    setCountValue("pipelineTestedKm", dashboardData.pipeline.tested, 1);
    setCountValue("pipelineRemainingKm", dashboardData.pipeline.remaining, 1);
  }

  function renderPipelineTable() {
    const tbody = document.querySelector("#pipelineTableBody");
    if (!tbody) return;

    const rows = dashboardData?.pipeline_sections || [];
    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(7, "No pipeline sections added yet.");
      return;
    }

    rows.forEach((section) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr data-zone="${escapeHtml(section.zone)}">
            <td>${escapeHtml(section.chainageFrom)} - ${escapeHtml(section.chainageTo)}</td>
            <td>${escapeHtml(section.diameter)}</td>
            <td class="num">${numberValue(section.lengthKm).toFixed(2)}</td>
            <td class="num">${numberValue(section.layingPct).toFixed(2)}%</td>
            <td class="num">${numberValue(section.testingPct).toFixed(2)}%</td>
            <td>
              <span class="status-chip ${getStatusClass(section.status)}">
                ${escapeHtml(section.status)}
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

  function renderHouseClustersTable() {
    const tbody = document.querySelector("#houseClusterTableBody");
    if (!tbody) return;

    const rows = dashboardData?.house_clusters || [];
    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "No house connection clusters added yet.");
      return;
    }

    rows.forEach((cluster) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td>${escapeHtml(cluster.clusterName)}</td>
            <td class="num">${cluster.planned}</td>
            <td class="num">${cluster.completed}</td>
            <td class="num">${cluster.inProgress}</td>
            <td class="num">${cluster.remaining}</td>
            <td class="actions-col">
              <button class="btn-ghost edit-house" type="button" data-id="${cluster.id}">
                Edit
              </button>
              <button class="btn-ghost delete-house" type="button" data-id="${cluster.id}">
                Delete
              </button>
            </td>
          </tr>
        `
      );
    });
  }

  function openHouseModal(id) {
    const existing = id
      ? dashboardData.house_clusters.find((x) => x.id === id)
      : null;

    openCrudModal({
      title: existing ? "Edit House Connection Cluster" : "Add House Connection Cluster",
      fields: [
        inputField("Cluster Name", "clusterName", existing?.clusterName, "text", true),
        inputField("Planned", "planned", existing?.planned ?? 0, "number", true),
        inputField("Completed", "completed", existing?.completed ?? 0, "number", true),
        inputField("In Progress", "inProgress", existing?.inProgress ?? 0, "number", true),
        inputField("Remaining", "remaining", existing?.remaining ?? 0, "number", true),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;
        payload.planned = parseInt(payload.planned || 0, 10);
        payload.completed = parseInt(payload.completed || 0, 10);
        payload.inProgress = parseInt(payload.inProgress || 0, 10);
        payload.remaining = parseInt(payload.remaining || 0, 10);

        if (id) {
          await WSDP_API.request(
            "PUT",
            `/construction-progress/house-cluster/${id}`,
            payload
          );
        } else {
          await WSDP_API.request(
            "POST",
            "/construction-progress/house-cluster",
            payload
          );
        }

        toast("House connection cluster saved successfully");
        await loadDashboard();
      },
    });
  }

  async function deleteHouseCluster(id) {
    if (!confirm("Delete this house connection cluster?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/house-cluster/${id}`
    );

    toast("House connection cluster deleted");
    await loadDashboard();
  }

  /* =========================
     TESTING
  ========================= */

  function renderTestingTable() {
    const tbody = document.querySelector("#testingActivityTableBody");
    if (!tbody) return;

    const rows = dashboardData?.testing || [];
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
            <td>${escapeHtml(activity.activityName)}</td>
            <td class="num">${numberValue(activity.plannedValue).toFixed(2)} ${escapeHtml(activity.unit)}</td>
            <td class="num">${numberValue(activity.actualValue).toFixed(2)} ${escapeHtml(activity.unit)}</td>
            <td>
              <span class="status-chip ${getStatusClass(activity.status)}">
                ${escapeHtml(activity.status)}
              </span>
            </td>
            <td class="actions-col">
              <button class="btn-ghost edit-testing" type="button" data-id="${activity.id}">
                Edit
              </button>
              <button class="btn-ghost delete-testing" type="button" data-id="${activity.id}">
                Delete
              </button>
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

    const n = numberValue(value);
    el.dataset.count = String(n);
    el.textContent = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
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

      if (target.id === "addHouseClusterBtn") {
        openHouseModal();
      }

      if (target.classList.contains("edit-house")) {
        openHouseModal(target.dataset.id);
      }

      if (target.classList.contains("delete-house")) {
        await deleteHouseCluster(target.dataset.id);
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

  document.addEventListener("DOMContentLoaded", async function () {
    const ready = await ensureSessionAndProject();
    if (!ready) return;

    await loadDashboard();
  });
})();