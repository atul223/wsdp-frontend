(function () {
  "use strict";

  console.log("[construction-progress.js] BUILD v2026-08-25-01 loaded @", new Date().toISOString());

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
     ON-PAGE DIAGNOSTIC STRIP
     =========================================================
     Requires zero DevTools use. Shows: which project is loaded, row
     counts per table, last successful refresh time, and any error text.

     *** THIS BAR IS WHAT REVEALED THE ROOT CAUSE ***
     It stayed frozen on its initial "loading..." placeholder forever
     (Project: loading..., Last refresh: -, no error) which is only
     possible if loadDashboard() was NEVER invoked — not even to fail —
     since both its success and failure paths always update these
     fields to a real value. See the root-cause fix at the bottom of
     this file (kickOffDashboardLoad / the "fire now or listen" pattern)
     for the actual bug this uncovered and how it's fixed.
     ========================================================= */
  function ensureDiagnosticBar() {
    let bar = document.getElementById("cpDiagnosticBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "cpDiagnosticBar";
    bar.style.cssText =
      "position:sticky;top:0;z-index:5000;background:#111827;color:#e5e7eb;" +
      "font:12px/1.6 monospace;padding:8px 14px;display:flex;flex-wrap:wrap;" +
      "gap:16px;align-items:center;border-bottom:2px solid #374151;";

    const main = document.querySelector(".main-content") || document.body;
    main.insertBefore(bar, main.firstChild);
    return bar;
  }

  function renderDiagnosticBar(state) {
    const bar = ensureDiagnosticBar();
    const ok = state.status === "ok";

    bar.innerHTML = `
      <span style="color:${ok ? "#34d399" : "#f87171"};font-weight:700;">
        ${ok ? "&#9679; LIVE DATA" : "&#9679; FALLBACK / ERROR"}
      </span>
      <span>Project: <b>${escapeHtml(state.projectName || "?")}</b> (${escapeHtml(state.projectId || "none")})</span>
      <span>Area rows: <b>${state.areaCount ?? "-"}</b></span>
      <span>Diameter rows: <b>${state.pipeCount ?? "-"}</b></span>
      <span>Activity rows: <b>${state.activityCount ?? "-"}</b></span>
      <span>Last refresh: <b>${state.lastFetch || "-"}</b></span>
      ${state.error ? `<span style="color:#f87171;">Error: ${escapeHtml(state.error)}</span>` : ""}
      <button type="button" id="cpDiagRefreshBtn" style="margin-left:auto;background:#374151;color:#e5e7eb;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;">
        Force reload now
      </button>
    `;

    const refreshBtn = document.getElementById("cpDiagRefreshBtn");
    if (refreshBtn) {
      refreshBtn.onclick = function () {
        loadDashboard();
      };
    }
  }

  /* =========================================================
     REPORT-BASED FALLBACK DATA
     Source: 50CS3_LUBANGO_UCP-P_ENG_MR_Technical_July 2026 report
     ========================================================= */

  const FALLBACK_PIPELINE_SUMMARY = {
    total: 70.0,
    laid: 31.2005,
    hydroTested: 0,
    remaining: 38.7995,
  };

  const FALLBACK_HOUSE_CONNECTIONS = {
    completed: 0,
    inProgress: 0,
    remaining: 5000,
  };

  const FALLBACK_VALVE_SUMMARY = {
    planned: 11,
    completed: 0,
    inProgress: 0,
    notStarted: 11,
  };

  const FALLBACK_AREA_PROGRESS = [
    { area: "Casa Verde", designReport: 180, contract: 180, executed: 204 },
    { area: "Escola Portuguesa", designReport: 800, contract: 800, executed: 324 },
    { area: "Cowboy I", designReport: 0, contract: 0, executed: 0 },
    { area: "Sofrio", designReport: 2108, contract: 2108, executed: 798 },
    { area: "João de Almeida", designReport: 2500, contract: 2500, executed: 0 },
    { area: "Caixote ou Socombar", designReport: 500, contract: 500, executed: 342 },
    { area: "Arimba", designReport: 0, contract: 0, executed: 0 },
  ];

  const FALLBACK_PIPE_DIAMETER_PROGRESS = [
    { diameter: "De63 mm", proposedLength: 18796, executed: 16877 },
    { diameter: "De75 mm", proposedLength: 1078, executed: 768 },
    { diameter: "De90 mm", proposedLength: 6012, executed: 5277 },
    { diameter: "De110 mm", proposedLength: 2075, executed: 1236 },
    { diameter: "De160 mm PN10", proposedLength: 4929, executed: 2832 },
    { diameter: "De160 mm PN16", proposedLength: 299, executed: 0 },
    { diameter: "De200 mm", proposedLength: 1256, executed: 1152 },
    { diameter: "De250 mm", proposedLength: 2203, executed: 1966 },
    { diameter: "De315 mm", proposedLength: 1412, executed: 1092.5 },
    { diameter: "Steel Pipe", proposedLength: 79, executed: 0 },
  ];

  const FALLBACK_ACTIVITY_PROGRESS = [
    { activity: "Pipeline Installation", previousMonth: 29.5325, currentMonth: 1.668, cumulative: 31.2005, totalPercent: 44.6, unit: "km" },
    { activity: "Hydro Testing", previousMonth: 0, currentMonth: 0, cumulative: 0, totalPercent: 0, unit: "km" },
    { activity: "House Connections", previousMonth: 0, currentMonth: 0, cumulative: 0, totalPercent: 0, unit: "Nos" },
    { activity: "Valve Chambers", previousMonth: 0, currentMonth: 0, cumulative: 0, totalPercent: 0, unit: "Nos" },
    { activity: "Bridge Crossings", previousMonth: 0, currentMonth: 0, cumulative: 0, totalPercent: 0, unit: "Nos (of 3 planned)" },
  ];

  const FALLBACK_TESTING_ACTIVITIES = [
    { activityName: "Pipeline Pressure Testing", plannedValue: 70.0, actualValue: 0, unit: "km", status: "Not Started" },
    { activityName: "Disinfection Testing", plannedValue: 70.0, actualValue: 0, unit: "km", status: "Not Started" },
  ];

  const FALLBACK_BRIDGE_CROSSINGS = [
    { area: "As per Detailed Design", crossingType: "River/Stream Crossing", span: "3 Nos Planned", status: "Not Started" },
  ];

  let currentAreaRows = [];
  let currentPipeDiameterRows = [];
  let currentActivityRows = [];
  let currentTestingRows = [];
  let currentBridgeRows = [];

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

  function pickRows(source, fallback) {
    if (Array.isArray(source) && source.length) {
      return source;
    }
    return Array.isArray(fallback) ? fallback : [];
  }

  function ensureDashboardArray(field) {
    if (!dashboardData) {
      dashboardData = {};
    }
    if (!Array.isArray(dashboardData[field])) {
      dashboardData[field] = [];
    }
    return dashboardData[field];
  }

  function upsertById(list, item) {
    if (!item || !item.id) return list;
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx === -1) {
      list.push(item);
    } else {
      list[idx] = item;
    }
    return list;
  }

  function removeById(list, id) {
    return list.filter((x) => x.id !== id);
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function noCacheUrl(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}_ts=${Date.now()}`;
  }

  async function ensureSessionAndProject() {
    let user = WSDP_API.getCurrentUser();

    if (!user) {
      user = await WSDP_API.restoreSession();
    }

    if (!user) {
      console.warn("[construction-progress] No valid session/user found yet.");
      return false;
    }

    if (PROJECT_ID) {
      console.log("[construction-progress] Using existing PROJECT_ID from localStorage:", PROJECT_ID);
      return true;
    }

    console.log("[construction-progress] No PROJECT_ID in localStorage, calling /default-project...");

    const result = await WSDP_API.request(
      "GET",
      noCacheUrl("/construction-progress/default-project")
    );

    const project = unwrap(result);

    if (!project?.id) {
      console.error("[construction-progress] /default-project returned no usable project:", result);
      return false;
    }

    PROJECT_ID = project.id;
    console.log("[construction-progress] Resolved PROJECT_ID:", PROJECT_ID, project);

    localStorage.setItem("current_project", JSON.stringify(project));
    localStorage.setItem("current_project_code", project.code || "");
    localStorage.setItem("current_project_name", project.name || "");

    return true;
  }

  async function loadDashboard(attempt = 1) {
    const MAX_ATTEMPTS = 3;

    try {
      if (!PROJECT_ID) {
        const ready = await ensureSessionAndProject();
        if (!ready) {
          renderDiagnosticBar({
            status: "error",
            projectId: "none",
            projectName: "none",
            error: "Could not resolve a project id (no session yet?)",
          });
          return;
        }
      }

      const url = noCacheUrl(`/construction-progress/dashboard/${PROJECT_ID}`);
      console.log(`[construction-progress] Fetching dashboard (attempt ${attempt}): ${url}`);

      const response = await WSDP_API.request("GET", url);

      dashboardData = unwrap(response);

      console.log("[construction-progress] Dashboard loaded successfully. Row counts:", {
        area_progress: dashboardData?.area_progress?.length ?? "MISSING",
        pipe_diameter_progress: dashboardData?.pipe_diameter_progress?.length ?? "MISSING",
        activity_progress: dashboardData?.activity_progress?.length ?? "MISSING",
        testing: dashboardData?.testing?.length ?? "MISSING",
        crossings: dashboardData?.crossings?.length ?? "MISSING",
      });
      console.log("[construction-progress] Full dashboard payload:", dashboardData);

      renderDiagnosticBar({
        status: "ok",
        projectId: dashboardData?.project?.id || PROJECT_ID,
        projectName: dashboardData?.project?.name,
        areaCount: dashboardData?.area_progress?.length,
        pipeCount: dashboardData?.pipe_diameter_progress?.length,
        activityCount: dashboardData?.activity_progress?.length,
        lastFetch: new Date().toLocaleTimeString(),
      });

      renderAll();
    } catch (error) {
      console.error(
        `[construction-progress] Dashboard fetch FAILED on attempt ${attempt}/${MAX_ATTEMPTS}. ` +
        `Full error below — this is why fallback/old values may be showing:`,
        error
      );

      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 700);
        return loadDashboard(attempt + 1);
      }

      console.error("[construction-progress] Giving up after retries. Rendering static fallback data now.");

      renderDiagnosticBar({
        status: "error",
        projectId: PROJECT_ID || "none",
        projectName: "?",
        lastFetch: new Date().toLocaleTimeString(),
        error: error?.message || String(error),
      });

      toast(
        error.message || "Live data unavailable — showing latest report figures",
        "fa-circle-exclamation"
      );
      dashboardData = null;
      renderAll();
    }
  }

  async function verifyRowPersisted(field, id, label) {
    try {
      const response = await WSDP_API.request(
        "GET",
        noCacheUrl(`/construction-progress/dashboard/${PROJECT_ID}`)
      );
      const fresh = unwrap(response);
      const rows = Array.isArray(fresh?.[field]) ? fresh[field] : [];
      const found = rows.some((row) => row.id === id);

      if (!found) {
        console.error(`[construction-progress] VERIFICATION FAILED: ${label} id=${id} not found in a fresh re-fetch immediately after saving.`, {
          field,
          savedId: id,
          freshRowIds: rows.map((r) => r.id),
        });
        toast(
          `Warning: "${label}" saved, but could not be verified on a fresh reload. Please refresh and check.`,
          "fa-triangle-exclamation"
        );
      } else {
        console.log(`[construction-progress] Verified: ${label} id=${id} confirmed present in fresh re-fetch.`);
      }
    } catch (err) {
      console.warn(`[construction-progress] Could not verify persistence of ${label} (verification fetch itself failed):`, err);
    }
  }

  function renderAll() {
    renderPipelineKpis();
    renderAreaProgressTable();
    renderPipeDiameterTable();
    renderActivityProgressTable();
    updatePipelineAreaChart();

    renderHouseKpis();

    renderTestingTable();

    renderValveSummary();

    renderBridgeCrossingsTable();
  }

  /* =========================
     PIPELINE KPI CARDS
  ========================= */

  function renderPipelineKpis() {
    const override = dashboardData?.pipeline_summary;

    const pipeline = override
      ? { laid: override.laidKm, hydroTested: override.hydroTestedKm, remaining: override.remainingKm }
      : { laid: FALLBACK_PIPELINE_SUMMARY.laid, hydroTested: FALLBACK_PIPELINE_SUMMARY.hydroTested, remaining: FALLBACK_PIPELINE_SUMMARY.remaining };

    const totalLength = override ? override.totalLengthKm : FALLBACK_PIPELINE_SUMMARY.total;

    setCountValue("pipelineLaidKm", pipeline.laid, 1);
    setCountValue("pipelineHydroTestedKm", pipeline.hydroTested, 1);
    setCountValue("pipelineRemainingKm", pipeline.remaining, 1);

    const totalLabel = document.getElementById("pipelineTotalLabel");
    if (totalLabel) {
      totalLabel.textContent = `${formatProgressValue(totalLength, "km")} total alignment`;
    }

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

    const safeTotal = totalLength || 1;

    if (laidDelta) {
      laidDelta.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${((pipeline.laid / safeTotal) * 100).toFixed(1)}% of total`;
    }

    if (testedDelta) {
      testedDelta.textContent = `${((pipeline.hydroTested / safeTotal) * 100).toFixed(1)}% of total`;
    }

    if (remainingDelta) {
      remainingDelta.textContent = `${((pipeline.remaining / safeTotal) * 100).toFixed(1)}% of total`;
    }
  }

  function openPipelineSummaryModal() {
    const override = dashboardData?.pipeline_summary;
    const current = override || {
      totalLengthKm: FALLBACK_PIPELINE_SUMMARY.total,
      laidKm: FALLBACK_PIPELINE_SUMMARY.laid,
      hydroTestedKm: FALLBACK_PIPELINE_SUMMARY.hydroTested,
    };

    openCrudModal({
      title: "Update Pipeline Progress",
      fields: [
        inputField("Total Alignment (km)", "totalLengthKm", current.totalLengthKm, "number", true, "0.001"),
        inputField("Laid (km)", "laidKm", current.laidKm, "number", true, "0.001"),
        inputField("Hydro-Tested (km)", "hydroTestedKm", current.hydroTestedKm, "number", true, "0.001"),
      ],
      onSubmit: async (payload) => {
        payload.totalLengthKm = numberValue(payload.totalLengthKm);
        payload.laidKm = numberValue(payload.laidKm);
        payload.hydroTestedKm = numberValue(payload.hydroTestedKm);

        const response = await WSDP_API.request(
          "PUT",
          `/construction-progress/pipeline-summary/${PROJECT_ID}`,
          payload
        );

        const saved = unwrap(response);
        if (!dashboardData) dashboardData = {};
        dashboardData.pipeline_summary = saved;
        renderPipelineKpis();

        toast("Pipeline progress updated");
      },
    });
  }

  /* =========================
     AREA-WISE PROGRESS
  ========================= */

  function renderAreaProgressTable() {
    const tbody = document.querySelector("#areaProgressTableBody");
    if (!tbody) return;

    const rows = pickRows(dashboardData?.area_progress, FALLBACK_AREA_PROGRESS);
    currentAreaRows = rows;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(7, "No area-wise progress data available.");
      return;
    }

    rows.forEach((item, index) => {
      const areaName = normalizeAreaName(item.area);
      const designReport = item.designReport;
      const contract = item.contract;
      const executed = item.executed;
      const balance = item.balance !== undefined ? item.balance : numberValue(contract) - numberValue(executed);
      const balanceClass = numberValue(balance) < 0 ? "down" : numberValue(balance) > 0 ? "up" : "flat";
      const hasId = Boolean(item.id);

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td class="sno-col">${index + 1}</td>
            <td>${escapeHtml(areaName)}</td>
            <td class="num">${formatProgressValue(designReport, "m")}</td>
            <td class="num">${formatProgressValue(contract, "m")}</td>
            <td class="num">${formatProgressValue(executed, "m")}</td>
            <td class="num">
              <span class="kpi-card__delta ${balanceClass}" style="justify-content:flex-end;">
                ${formatSignedValue(balance, "m")}
              </span>
            </td>
            <td class="actions-col">
              <button class="btn-ghost edit-area-progress" type="button" data-index="${index}">Edit</button>
              ${hasId ? `<button class="btn-ghost delete-area-progress" type="button" data-index="${index}">Delete</button>` : ""}
            </td>
          </tr>
        `
      );
    });
  }

  function openAreaProgressModal(index) {
    const existing = index !== null && index !== undefined ? currentAreaRows[index] : null;

    openCrudModal({
      title: existing ? "Edit Area-wise Progress" : "Add Area-wise Progress",
      fields: [
        inputField("Area", "area", existing?.area, "text", true),
        inputField("As per Detailed Design Report (m)", "designReport", existing?.designReport ?? 0, "number", true, "0.01"),
        inputField("Contract (m)", "contract", existing?.contract ?? 0, "number", true, "0.01"),
        inputField("Executed (m)", "executed", existing?.executed ?? 0, "number", true, "0.01"),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;
        payload.designReport = numberValue(payload.designReport);
        payload.contract = numberValue(payload.contract);
        payload.executed = numberValue(payload.executed);

        console.log("[construction-progress] Submitting Area-wise Progress:", existing?.id ? "UPDATE" : "CREATE", payload);

        let response;
        if (existing?.id) {
          response = await WSDP_API.request(
            "PUT",
            `/construction-progress/area-progress/${existing.id}`,
            payload
          );
        } else {
          response = await WSDP_API.request(
            "POST",
            "/construction-progress/area-progress",
            payload
          );
        }

        console.log("[construction-progress] Area-wise Progress save response:", response);

        const saved = unwrap(response);
        if (!saved?.id) {
          console.error("[construction-progress] Save response did not contain a row id — treating as failed.", response);
          throw new Error("Server did not confirm the save. Please try again.");
        }
        const list = ensureDashboardArray("area_progress");
        upsertById(list, saved);
        renderAreaProgressTable();
        updatePipelineAreaChart();

        toast("Area-wise progress saved successfully");
        verifyRowPersisted("area_progress", saved.id, `Area: ${saved.area}`);
      },
    });
  }

  async function deleteAreaProgress(index) {
    const existing = currentAreaRows[index];
    if (!existing?.id) return;
    if (!confirm("Delete this area-wise progress row?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/area-progress/${existing.id}`
    );

    dashboardData.area_progress = removeById(ensureDashboardArray("area_progress"), existing.id);
    renderAreaProgressTable();
    updatePipelineAreaChart();

    toast("Area-wise progress row deleted");
  }

  /* =========================
     PIPE DIAMETER WISE PROGRESS
  ========================= */

  function renderPipeDiameterTable() {
    const tbody = document.querySelector("#pipeDiameterTableBody");
    if (!tbody) return;

    const rows = pickRows(dashboardData?.pipe_diameter_progress, FALLBACK_PIPE_DIAMETER_PROGRESS);
    currentPipeDiameterRows = rows;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "No pipe diameter progress data available.");
      return;
    }

    rows.forEach((item, index) => {
      const proposedLength = item.proposedLength;
      const executed = item.executed;
      const balance = item.balance !== undefined ? item.balance : numberValue(proposedLength) - numberValue(executed);
      const hasId = Boolean(item.id);

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td class="sno-col">${index + 1}</td>
            <td>${escapeHtml(item.diameter)}</td>
            <td class="num">${formatProgressValue(proposedLength, "m")}</td>
            <td class="num">${formatProgressValue(executed, "m")}</td>
            <td class="num">${formatProgressValue(balance, "m")}</td>
            <td class="actions-col">
              <button class="btn-ghost edit-pipe-diameter" type="button" data-index="${index}">Edit</button>
              ${hasId ? `<button class="btn-ghost delete-pipe-diameter" type="button" data-index="${index}">Delete</button>` : ""}
            </td>
          </tr>
        `
      );
    });
  }

  function openPipeDiameterModal(index) {
    const existing = index !== null && index !== undefined ? currentPipeDiameterRows[index] : null;

    openCrudModal({
      title: existing ? "Edit Pipe Diameter Wise Progress" : "Add Pipe Diameter Wise Progress",
      fields: [
        inputField("Pipe Diameter", "diameter", existing?.diameter, "text", true),
        inputField("Proposed Length (m)", "proposedLength", existing?.proposedLength ?? 0, "number", true, "0.01"),
        inputField("Executed (m)", "executed", existing?.executed ?? 0, "number", true, "0.01"),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;
        payload.proposedLength = numberValue(payload.proposedLength);
        payload.executed = numberValue(payload.executed);

        console.log("[construction-progress] Submitting Pipe Diameter Progress:", existing?.id ? "UPDATE" : "CREATE", payload);

        let response;
        if (existing?.id) {
          response = await WSDP_API.request(
            "PUT",
            `/construction-progress/pipe-diameter-progress/${existing.id}`,
            payload
          );
        } else {
          response = await WSDP_API.request(
            "POST",
            "/construction-progress/pipe-diameter-progress",
            payload
          );
        }

        console.log("[construction-progress] Pipe Diameter Progress save response:", response);

        const saved = unwrap(response);
        if (!saved?.id) {
          console.error("[construction-progress] Save response did not contain a row id — treating as failed.", response);
          throw new Error("Server did not confirm the save. Please try again.");
        }
        const list = ensureDashboardArray("pipe_diameter_progress");
        upsertById(list, saved);
        renderPipeDiameterTable();

        toast("Pipe diameter progress saved successfully");
        verifyRowPersisted("pipe_diameter_progress", saved.id, `Diameter: ${saved.diameter}`);
      },
    });
  }

  async function deletePipeDiameterProgress(index) {
    const existing = currentPipeDiameterRows[index];
    if (!existing?.id) return;
    if (!confirm("Delete this pipe diameter progress row?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/pipe-diameter-progress/${existing.id}`
    );

    dashboardData.pipe_diameter_progress = removeById(ensureDashboardArray("pipe_diameter_progress"), existing.id);
    renderPipeDiameterTable();

    toast("Pipe diameter progress row deleted");
  }

  /* =========================
     ACTIVITY WISE PROGRESS
  ========================= */

  function renderActivityProgressTable() {
    const tbody = document.querySelector("#activityProgressTableBody");
    if (!tbody) return;

    const rows = pickRows(dashboardData?.activity_progress, FALLBACK_ACTIVITY_PROGRESS);
    currentActivityRows = rows;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(7, "No activity-wise progress data available.");
      return;
    }

    rows.forEach((item, index) => {
      const unit = item.unit || "";
      const totalPercent = item.totalPercent;
      const hasId = Boolean(item.id);

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td class="sno-col">${index + 1}</td>
            <td>${escapeHtml(item.activity)}</td>
            <td class="num">${formatMaybeValue(item.previousMonth, unit)}</td>
            <td class="num">${formatMaybeValue(item.currentMonth, unit)}</td>
            <td class="num">${formatMaybeValue(item.cumulative, unit)}</td>
            <td class="num">${hasNumericValue(totalPercent) ? `${numberValue(totalPercent).toFixed(1)}%` : "-"}</td>
            <td class="actions-col">
              <button class="btn-ghost edit-activity-progress" type="button" data-index="${index}">Edit</button>
              ${hasId ? `<button class="btn-ghost delete-activity-progress" type="button" data-index="${index}">Delete</button>` : ""}
            </td>
          </tr>
        `
      );
    });
  }

  function openActivityProgressModal(index) {
    const existing = index !== null && index !== undefined ? currentActivityRows[index] : null;

    openCrudModal({
      title: existing ? "Edit Activity Wise Progress" : "Add Activity Wise Progress",
      fields: [
        inputField("Activity", "activity", existing?.activity, "text", true),
        inputField("Previous Month", "previousMonth", existing?.previousMonth ?? 0, "number", true, "0.01"),
        inputField("Current Month", "currentMonth", existing?.currentMonth ?? 0, "number", true, "0.01"),
        inputField("Cumulative", "cumulative", existing?.cumulative ?? 0, "number", true, "0.01"),
        inputField("Total (%)", "totalPercent", existing?.totalPercent ?? 0, "number", true, "0.1"),
        inputField("Unit", "unit", existing?.unit || "km", "text", false),
      ],
      onSubmit: async (payload) => {
        payload.projectId = PROJECT_ID;
        payload.previousMonth = numberValue(payload.previousMonth);
        payload.currentMonth = numberValue(payload.currentMonth);
        payload.cumulative = numberValue(payload.cumulative);
        payload.totalPercent = numberValue(payload.totalPercent);

        console.log("[construction-progress] Submitting Activity Wise Progress:", existing?.id ? "UPDATE" : "CREATE", payload);

        let response;
        if (existing?.id) {
          response = await WSDP_API.request(
            "PUT",
            `/construction-progress/activity-progress/${existing.id}`,
            payload
          );
        } else {
          response = await WSDP_API.request(
            "POST",
            "/construction-progress/activity-progress",
            payload
          );
        }

        console.log("[construction-progress] Activity Wise Progress save response:", response);

        const saved = unwrap(response);
        if (!saved?.id) {
          console.error("[construction-progress] Save response did not contain a row id — treating as failed.", response);
          throw new Error("Server did not confirm the save. Please try again.");
        }
        const list = ensureDashboardArray("activity_progress");
        upsertById(list, saved);
        renderActivityProgressTable();

        toast("Activity-wise progress saved successfully");
        verifyRowPersisted("activity_progress", saved.id, `Activity: ${saved.activity}`);
      },
    });
  }

  async function deleteActivityProgress(index) {
    const existing = currentActivityRows[index];
    if (!existing?.id) return;
    if (!confirm("Delete this activity-wise progress row?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/activity-progress/${existing.id}`
    );

    dashboardData.activity_progress = removeById(ensureDashboardArray("activity_progress"), existing.id);
    renderActivityProgressTable();

    toast("Activity-wise progress row deleted");
  }

  function updatePipelineAreaChart() {
    const chart = window.WSDP_PIPELINE_AREA_CHART;

    if (!chart) {
      return;
    }

    const rows = pickRows(dashboardData?.area_progress, null) || [];

    if (rows.length) {
      chart.data.labels = rows.map((item) => normalizeAreaName(item.area));
      chart.data.datasets[0].data = rows.map((item) => numberValue(item.contract) / 1000);
      chart.data.datasets[1].data = rows.map((item) => numberValue(item.executed) / 1000);
    } else {
      const fallbackRows = [
        { area: "Casa Verde", planned: 0.180, actual: 0.204 },
        { area: "Escola Portuguesa", planned: 0.800, actual: 0.324 },
        { area: "Cowboy I", planned: 0.000, actual: 0.000 },
        { area: "Sofrio", planned: 2.108, actual: 0.798 },
        { area: "João de Almeida", planned: 2.500, actual: 0.000 },
        { area: "Caixote ou Socombar", planned: 0.500, actual: 0.342 },
        { area: "Arimba", planned: 0.000, actual: 0.000 },
      ];
      chart.data.labels = fallbackRows.map((item) => item.area);
      chart.data.datasets[0].data = fallbackRows.map((item) => numberValue(item.planned));
      chart.data.datasets[1].data = fallbackRows.map((item) => numberValue(item.actual));
    }

    chart.update();
  }

  /* =========================
     HOUSE CONNECTIONS
  ========================= */

  function renderHouseKpis() {
    const override = dashboardData?.house_summary;

    const totals = override || FALLBACK_HOUSE_CONNECTIONS;
    const scopeTotal = numberValue(totals.completed) + numberValue(totals.inProgress) + numberValue(totals.remaining) || 1;

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

    if (completedDelta) completedDelta.textContent = `${((numberValue(totals.completed) / scopeTotal) * 100).toFixed(1)}% of scope`;
    if (inProgressDelta) inProgressDelta.textContent = `${((numberValue(totals.inProgress) / scopeTotal) * 100).toFixed(1)}% of scope`;
    if (remainingDelta) remainingDelta.textContent = `${((numberValue(totals.remaining) / scopeTotal) * 100).toFixed(1)}% of scope`;
  }

  function openHouseSummaryModal() {
    const totals = dashboardData?.house_summary || FALLBACK_HOUSE_CONNECTIONS;

    openCrudModal({
      title: "Update House Connections Summary",
      fields: [
        inputField("Completed", "completed", totals.completed, "number", true),
        inputField("In Progress", "inProgress", totals.inProgress, "number", true),
        inputField("Remaining", "remaining", totals.remaining, "number", true),
      ],
      onSubmit: async (payload) => {
        payload.completed = parseInt(payload.completed || 0, 10);
        payload.inProgress = parseInt(payload.inProgress || 0, 10);
        payload.remaining = parseInt(payload.remaining || 0, 10);

        const response = await WSDP_API.request(
          "PUT",
          `/construction-progress/house-summary/${PROJECT_ID}`,
          payload
        );

        const saved = unwrap(response);
        if (!dashboardData) dashboardData = {};
        dashboardData.house_summary = saved;
        renderHouseKpis();

        toast("House connections summary updated");
      },
    });
  }

  /* =========================
     TESTING (Pressure Testing Status)
  ========================= */

  function renderTestingTable() {
    const tbody = document.querySelector("#testingActivityTableBody");
    if (!tbody) return;

    const rows = pickRows(dashboardData?.testing, FALLBACK_TESTING_ACTIVITIES);
    currentTestingRows = rows;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "No testing activities added yet.");
      return;
    }

    rows.forEach((activity, index) => {
      const hasId = Boolean(activity.id);

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td class="sno-col">${index + 1}</td>
            <td>${escapeHtml(activity.activityName || "-")}</td>
            <td class="num">${formatProgressValue(activity.plannedValue, activity.unit || "")}</td>
            <td class="num">${formatProgressValue(activity.actualValue, activity.unit || "")}</td>
            <td>
              <span class="status-chip ${getStatusClass(activity.status)}">
                ${escapeHtml(activity.status || "Not Started")}
              </span>
            </td>
            <td class="actions-col">
              <button class="btn-ghost edit-testing" type="button" data-index="${index}">
                Edit
              </button>
              ${
                hasId
                  ? `<button class="btn-ghost delete-testing" type="button" data-index="${index}">Delete</button>`
                  : ""
              }
            </td>
          </tr>
        `
      );
    });
  }

  function openTestingModal(index) {
    const existing = index !== null && index !== undefined ? currentTestingRows[index] : null;

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

        let response;
        if (existing?.id) {
          response = await WSDP_API.request(
            "PUT",
            `/construction-progress/testing-activity/${existing.id}`,
            payload
          );
        } else {
          response = await WSDP_API.request(
            "POST",
            "/construction-progress/testing-activity",
            payload
          );
        }

        const saved = unwrap(response);
        if (!saved?.id) {
          throw new Error("Server did not confirm the save. Please try again.");
        }
        const list = ensureDashboardArray("testing");
        upsertById(list, saved);
        renderTestingTable();

        toast("Testing activity saved successfully");
        verifyRowPersisted("testing", saved.id, `Testing: ${saved.activityName}`);
      },
    });
  }

  async function deleteTestingActivity(index) {
    const existing = currentTestingRows[index];
    if (!existing?.id) return;
    if (!confirm("Delete this testing activity?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/testing-activity/${existing.id}`
    );

    dashboardData.testing = removeById(ensureDashboardArray("testing"), existing.id);
    renderTestingTable();

    toast("Testing activity deleted");
  }

  /* =========================
     VALVE SUMMARY (Valve Chamber Construction Progress)
  ========================= */

  function renderValveSummary() {
    const valve = dashboardData?.valve || FALLBACK_VALVE_SUMMARY;

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

        const response = await WSDP_API.request(
          "PUT",
          `/construction-progress/valve-summary/${PROJECT_ID}`,
          payload
        );

        const saved = unwrap(response);
        if (!dashboardData) dashboardData = {};
        dashboardData.valve = saved;
        renderValveSummary();

        toast("Valve chamber summary updated");
      },
    });
  }

  /* =========================
     BRIDGE CROSSINGS (Bridge-Crossing Structure Progress)
  ========================= */

  function renderBridgeCrossingsTable() {
    const tbody = document.querySelector("#bridgeCrossingTableBody");
    if (!tbody) return;

    const rows = pickRows(dashboardData?.crossings, FALLBACK_BRIDGE_CROSSINGS);
    currentBridgeRows = rows;

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = emptyRow(6, "No bridge crossings added yet.");
      return;
    }

    rows.forEach((crossing, index) => {
      const hasId = Boolean(crossing.id);

      tbody.insertAdjacentHTML(
        "beforeend",
        `
          <tr>
            <td class="sno-col">${index + 1}</td>
            <td>${escapeHtml(crossing.area || crossing.crossingName || "-")}</td>
            <td>${escapeHtml(crossing.crossingType || "-")}</td>
            <td class="num">${escapeHtml(crossing.span || crossing.method || "-")}</td>
            <td>
              <span class="status-chip ${getStatusClass(crossing.status)}">
                ${escapeHtml(crossing.status || "Not Started")}
              </span>
            </td>
            <td class="actions-col">
              <button class="btn-ghost edit-bridge" type="button" data-index="${index}">
                Edit
              </button>
              ${
                hasId
                  ? `<button class="btn-ghost delete-bridge" type="button" data-index="${index}">Delete</button>`
                  : ""
              }
            </td>
          </tr>
        `
      );
    });
  }

  function openBridgeModal(index) {
    const existing = index !== null && index !== undefined ? currentBridgeRows[index] : null;

    openCrudModal({
      title: existing ? "Edit Bridge Crossing" : "Add Bridge Crossing",
      fields: [
        inputField("Area", "area", existing?.area || existing?.crossingName, "text", true),
        inputField("Type", "crossingType", existing?.crossingType, "text", true),
        inputField("Span", "span", existing?.span || existing?.method || "", "text", true),
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

        let response;
        if (existing?.id) {
          response = await WSDP_API.request(
            "PUT",
            `/construction-progress/bridge-crossing/${existing.id}`,
            payload
          );
        } else {
          response = await WSDP_API.request(
            "POST",
            "/construction-progress/bridge-crossing",
            payload
          );
        }

        const saved = unwrap(response);
        if (!saved?.id) {
          throw new Error("Server did not confirm the save. Please try again.");
        }
        const list = ensureDashboardArray("crossings");
        upsertById(list, saved);
        renderBridgeCrossingsTable();

        toast("Bridge crossing saved successfully");
        verifyRowPersisted("crossings", saved.id, `Crossing: ${saved.crossingName}`);
      },
    });
  }

  async function deleteBridgeCrossing(index) {
    const existing = currentBridgeRows[index];
    if (!existing?.id) return;
    if (!confirm("Delete this bridge crossing?")) return;

    await WSDP_API.request(
      "DELETE",
      `/construction-progress/bridge-crossing/${existing.id}`
    );

    dashboardData.crossings = removeById(ensureDashboardArray("crossings"), existing.id);
    renderBridgeCrossingsTable();

    toast("Bridge crossing deleted");
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
      const submitBtn = document.querySelector('button[form="crudForm"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = "Saving...";
      }

      try {
        await config.onSubmit(payload);
        modal.hidden = true;
      } catch (err) {
        console.error("[construction-progress] Save failed:", err);
        toast(err.message || "Save failed", "fa-circle-exclamation");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Save";
        }
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
      const index = target.dataset.index !== undefined ? parseInt(target.dataset.index, 10) : null;

      if (target.id === "editPipelineSummaryBtn") {
        openPipelineSummaryModal();
      }

      if (target.id === "addAreaProgressBtn") {
        openAreaProgressModal();
      }

      if (target.classList.contains("edit-area-progress")) {
        openAreaProgressModal(index);
      }

      if (target.classList.contains("delete-area-progress")) {
        await deleteAreaProgress(index);
      }

      if (target.id === "addPipeDiameterBtn") {
        openPipeDiameterModal();
      }

      if (target.classList.contains("edit-pipe-diameter")) {
        openPipeDiameterModal(index);
      }

      if (target.classList.contains("delete-pipe-diameter")) {
        await deletePipeDiameterProgress(index);
      }

      if (target.id === "addActivityProgressBtn") {
        openActivityProgressModal();
      }

      if (target.classList.contains("edit-activity-progress")) {
        openActivityProgressModal(index);
      }

      if (target.classList.contains("delete-activity-progress")) {
        await deleteActivityProgress(index);
      }

      if (target.id === "editHouseSummaryBtn") {
        openHouseSummaryModal();
      }

      if (target.id === "addTestingActivityBtn") {
        openTestingModal();
      }

      if (target.classList.contains("edit-testing")) {
        openTestingModal(index);
      }

      if (target.classList.contains("delete-testing")) {
        await deleteTestingActivity(index);
      }

      if (target.id === "editValveSummaryBtn") {
        openValveModal();
      }

      if (target.id === "addBridgeCrossingBtn") {
        openBridgeModal();
      }

      if (target.classList.contains("edit-bridge")) {
        openBridgeModal(index);
      }

      if (target.classList.contains("delete-bridge")) {
        await deleteBridgeCrossing(index);
      }

      if (target.id === "cancelCrudBtn") {
        document.getElementById("crudModal").hidden = true;
      }
    } catch (err) {
      console.error(err);
      toast(err.message || "Action failed", "fa-circle-exclamation");
    }
  });

  /* =========================================================
     *** ROOT-CAUSE FIX: "fire now or listen" pattern ***
     =========================================================
     Previously, loadDashboard() was ONLY ever triggered by a single
     "wsdp:authready" event listener. This script is the LAST one loaded
     on the page (after api.js, i18n.js, shell.js, main.js). If any
     earlier script checks the session and dispatches "wsdp:authready"
     SYNCHRONOUSLY during its own execution — a very common pattern —
     that event fires and is gone forever before this file even reaches
     the addEventListener("wsdp:authready", ...) line. A CustomEvent
     dispatched before a listener exists is simply missed; it is never
     replayed or queued by the browser.

     The on-page diagnostic bar proved this was happening: it stayed on
     its initial "loading..." placeholder forever ("Last refresh: -",
     no error), which is only possible if loadDashboard() was NEVER
     invoked — not even to fail — since both its success and failure
     branches always update those fields to a real value.

     This explains every previously reported symptom: dashboardData
     stayed null forever, renderAll() only ever painted the static
     FALLBACK_* constants, Add/Edit "worked" (those call the API
     directly, independent of loadDashboard) but a refresh always
     re-showed old numbers — because the real data was NEVER being
     fetched in the first place. It wasn't reverting; it was never
     loaded to begin with.

     FIX: "fire now or listen". Try to resolve the session/project
     immediately and synchronously with this script's own execution —
     do not wait for an event that may already have fired and been
     missed. ALSO keep listening for "wsdp:authready" in case the
     session genuinely resolves later. ALSO poll briefly as a final
     safety net in case neither the immediate check nor the event ever
     succeeds right away (e.g. async token restore takes a moment). A
     guard flag ensures the dashboard is only actually loaded once no
     matter which of these three paths triggers it first.
     ========================================================= */
  let dashboardLoadKicked = false;

  async function kickOffDashboardLoad(source) {
    if (dashboardLoadKicked) {
      return;
    }

    const ready = await ensureSessionAndProject();

    if (!ready) {
      console.warn(`[construction-progress] Session/project not ready yet (trigger: "${source}"). Will retry shortly.`);
      return;
    }

    dashboardLoadKicked = true;
    console.log(`[construction-progress] Session ready — loading dashboard now (triggered by: "${source}")`);
    await loadDashboard();
  }

  document.addEventListener("wsdp:authready", function () {
    console.log("[construction-progress] wsdp:authready event received.");
    kickOffDashboardLoad("wsdp:authready event");
  });

  document.addEventListener("DOMContentLoaded", function () {
    ensureDiagnosticBar();
    renderDiagnosticBar({ status: "error", projectId: PROJECT_ID || "resolving...", projectName: "loading...", error: null });

    initConstructionDateRangePicker();

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

    // Covers the case where "wsdp:authready" already fired (dispatched
    // by an earlier script) before this file's listener above was even
    // attached. Try immediately rather than waiting on an event that
    // may never come again.
    kickOffDashboardLoad("DOMContentLoaded direct check");

    // Final safety net: briefly poll in case the session takes a moment
    // to hydrate (async token restore, etc.) and neither the immediate
    // check above nor the event listener has succeeded yet. Stops as
    // soon as real data loads, or after ~10 seconds.
    let pollAttempts = 0;
    const pollInterval = setInterval(() => {
      pollAttempts++;
      if (dashboardLoadKicked || pollAttempts > 20) {
        clearInterval(pollInterval);
        return;
      }
      kickOffDashboardLoad(`poll attempt ${pollAttempts}`);
    }, 500);
  });

})();
