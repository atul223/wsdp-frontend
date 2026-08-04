/* ============================================================
   reports.js - Reports module CRUD wiring
   Requires:
   - js/api.js
   - js/shell.js
   - js/main.js
   ============================================================ */

(function () {
  "use strict";

  let projectId = null;
  let projectInfo = null;
  let reports = [];

  let periodicReports = [];
  let ipcs = [];
  let amendments = [];
  let methodStatements = [];

  let initialized = false;

  const els = {};

  function bindElements() {
    els.projectLabel = document.getElementById("reportsProjectLabel");
    els.tableBody = document.getElementById("reportsTableBody");

    els.periodicReportsTableBody = document.getElementById("periodicReportsTableBody");
    els.ipcsTableBody = document.getElementById("ipcsTableBody");
    els.amendmentsTableBody = document.getElementById("amendmentsTableBody");
    els.methodStatementsTableBody = document.getElementById("methodStatementsTableBody");

    els.form = document.getElementById("reportForm");
    els.reportId = document.getElementById("reportId");
    els.title = document.getElementById("reportTitle");
    els.period = document.getElementById("reportPeriod");
    els.module = document.getElementById("reportModule");
    els.dateFrom = document.getElementById("reportDateFrom");
    els.dateTo = document.getElementById("reportDateTo");
    els.generatedDate = document.getElementById("reportGeneratedDate");
    els.status = document.getElementById("reportStatus");
    els.summary = document.getElementById("reportSummary");

    els.saveBtn = document.getElementById("saveReportBtn");
    els.resetBtn = document.getElementById("resetReportFormBtn");
    els.customBtn = document.getElementById("customReportBtn");
  }

  function toast(message, icon) {
    if (window.WSDP_TOAST) {
      window.WSDP_TOAST(message, { icon: icon || "fa-circle-check" });
    } else {
      console.log(message);
    }
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function setLoading(isLoading) {
    if (!els.saveBtn) return;

    els.saveBtn.disabled = isLoading;
    els.saveBtn.innerHTML = isLoading
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'
      : '<i class="fa-solid fa-floppy-disk"></i> Save Report';
  }

  function formatDate(value) {
    if (!value) return "-";

    const stringValue = String(value);

    let normalized = stringValue;
    if (stringValue.includes("T")) {
      normalized = stringValue.split("T")[0];
    }

    const dt = new Date(normalized + "T00:00:00");

    if (Number.isNaN(dt.getTime())) {
      return stringValue;
    }

    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function prettyModule(value) {
    const map = {
      overall: "Overall",
      construction_progress: "Construction",
      financial_dashboard: "Financial",
      resource_dashboard: "Resources",
      risk_delay: "Risk & Delay",
      ehs: "EHS",
      gis: "GIS",
    };

    return map[value] || value || "-";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusClass(value) {
    return String(value || "pending")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function renderProjectLabel() {
    if (!els.projectLabel) return;

    if (!projectInfo) {
      els.projectLabel.innerHTML = 'Project: <strong>Not loaded</strong>';
      return;
    }

    els.projectLabel.innerHTML = `Project: <strong>${escapeHtml(projectInfo.name || "Unnamed Project")}</strong>`;
  }

  function renderEmpty(message) {
    if (!els.tableBody) return;

    els.tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-message">${escapeHtml(message)}</td>
      </tr>
    `;
  }

  function renderLibraryEmpty(tbody, colspan, message) {
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="table-empty-message">${escapeHtml(message)}</td>
      </tr>
    `;
  }

  function renderStatusChip(status) {
    const safeStatus = status || "pending";
    return `<span class="status-chip ${escapeHtml(statusClass(safeStatus))}">${escapeHtml(safeStatus)}</span>`;
  }

  function renderReports() {
    if (!els.tableBody) return;

    if (!reports.length) {
      renderEmpty("No reports found. Add your first report above.");
      return;
    }

    els.tableBody.innerHTML = reports
      .map((report) => {
        const id = report.id;
        const title = report.title || "-";
        const period = report.period || "-";
        const moduleName = prettyModule(report.module);
        const generatedDate = report.generated_date || report.generatedDate || report.generatedDateAt;
        const status = report.status || "draft";

        return `
          <tr data-id="${escapeHtml(id)}">
            <td>
              <strong>${escapeHtml(title)}</strong>
              ${
                report.summary
                  ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${escapeHtml(report.summary)}</div>`
                  : ""
              }
            </td>
            <td>${escapeHtml(period)}</td>
            <td>${escapeHtml(moduleName)}</td>
            <td>${formatDate(generatedDate)}</td>
            <td>${renderStatusChip(status)}</td>
            <td style="text-align:right; white-space:nowrap;">
              <button class="export-btn" type="button" data-action="export" data-format="pdf" data-id="${escapeHtml(id)}">
                <i class="fa-solid fa-file-pdf"></i> PDF
              </button>
              <button class="export-btn" type="button" data-action="export" data-format="excel" data-id="${escapeHtml(id)}">
                <i class="fa-solid fa-file-excel"></i> Excel
              </button>
              <button class="export-btn" type="button" data-action="export" data-format="powerpoint" data-id="${escapeHtml(id)}">
                <i class="fa-solid fa-file-powerpoint"></i> PPT
              </button>
              <button class="table-action-btn" type="button" data-action="edit" data-id="${escapeHtml(id)}">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="table-action-btn danger" type="button" data-action="delete" data-id="${escapeHtml(id)}">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderPeriodicReports() {
    if (!els.periodicReportsTableBody) return;

    if (!periodicReports.length) {
      renderLibraryEmpty(els.periodicReportsTableBody, 3, "No periodic reports found.");
      return;
    }

    els.periodicReportsTableBody.innerHTML = periodicReports
      .map((item) => {
        return `
          <tr>
            <td>${escapeHtml(item.document || item.title || "-")}</td>
            <td>${escapeHtml(item.latest_issue || item.latestIssue || "-")}</td>
            <td>${renderStatusChip(item.status)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderIpcs() {
    if (!els.ipcsTableBody) return;

    if (!ipcs.length) {
      renderLibraryEmpty(els.ipcsTableBody, 3, "No IPCs found.");
      return;
    }

    els.ipcsTableBody.innerHTML = ipcs
      .map((item) => {
        return `
          <tr>
            <td>${escapeHtml(item.ipc || item.name || "-")}</td>
            <td>${formatDate(item.date || item.ipc_date || item.ipcDate)}</td>
            <td>${renderStatusChip(item.status)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAmendments() {
    if (!els.amendmentsTableBody) return;

    if (!amendments.length) {
      renderLibraryEmpty(els.amendmentsTableBody, 3, "No amendments found.");
      return;
    }

    els.amendmentsTableBody.innerHTML = amendments
      .map((item) => {
        return `
          <tr>
            <td>${escapeHtml(item.amendment || item.name || "-")}</td>
            <td>${escapeHtml(item.subject || "-")}</td>
            <td>${renderStatusChip(item.status)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderMethodStatements() {
    if (!els.methodStatementsTableBody) return;

    if (!methodStatements.length) {
      renderLibraryEmpty(els.methodStatementsTableBody, 3, "No method statements found.");
      return;
    }

    els.methodStatementsTableBody.innerHTML = methodStatements
      .map((item) => {
        return `
          <tr>
            <td>${escapeHtml(item.method_statement || item.methodStatement || item.title || "-")}</td>
            <td>${formatDate(item.date || item.statement_date || item.statementDate)}</td>
            <td>${renderStatusChip(item.status)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderReportLibrary() {
    renderPeriodicReports();
    renderIpcs();
    renderAmendments();
    renderMethodStatements();
  }

  function getPayload() {
    return {
      title: els.title.value.trim(),
      period: els.period.value.trim(),
      module: els.module.value,
      date_from: els.dateFrom.value || null,
      date_to: els.dateTo.value || null,
      generated_date: els.generatedDate.value,
      status: els.status.value,
      summary: els.summary.value.trim() || null,
    };
  }

  function validatePayload(payload) {
    if (!payload.title) return "Report title is required.";
    if (!payload.period) return "Report period is required.";
    if (!payload.generated_date) return "Generated date is required.";

    if (payload.date_from && payload.date_to) {
      if (new Date(payload.date_from) > new Date(payload.date_to)) {
        return "Date From cannot be later than Date To.";
      }
    }

    return null;
  }

  function resetForm() {
    if (!els.form) return;

    els.reportId.value = "";
    els.form.reset();
    els.generatedDate.value = todayIso();
    els.module.value = "overall";
    els.status.value = "draft";

    if (els.saveBtn) {
      els.saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Report';
    }
  }

  function fillForm(report) {
    els.reportId.value = report.id || "";
    els.title.value = report.title || "";
    els.period.value = report.period || "";
    els.module.value = report.module || "overall";
    els.dateFrom.value = report.date_from || report.dateFrom || "";
    els.dateTo.value = report.date_to || report.dateTo || "";
    els.generatedDate.value = report.generated_date || report.generatedDate || todayIso();
    els.status.value = report.status || "draft";
    els.summary.value = report.summary || "";

    if (els.saveBtn) {
      els.saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Report';
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function loadDefaultProject() {
    const result = await window.WSDP_API.request(
      "GET",
      "/reports/context/default-project"
    );

    projectInfo = result.data;
    projectId = projectInfo && projectInfo.id ? projectInfo.id : null;

    renderProjectLabel();

    if (!projectId) {
      throw new Error("Default project was not returned by the backend.");
    }
  }

  async function loadReports() {
    if (!projectId) return;

    renderEmpty("Loading reports...");

    const result = await window.WSDP_API.request(
      "GET",
      `/projects/${projectId}/reports?limit=100&sort=generatedDate&order=desc`
    );

    reports = Array.isArray(result.data) ? result.data : [];
    renderReports();
  }

  async function loadReportLibrary() {
    if (!projectId) return;

    renderLibraryEmpty(els.periodicReportsTableBody, 3, "Loading periodic reports...");
    renderLibraryEmpty(els.ipcsTableBody, 3, "Loading IPCs...");
    renderLibraryEmpty(els.amendmentsTableBody, 3, "Loading amendments...");
    renderLibraryEmpty(els.methodStatementsTableBody, 3, "Loading method statements...");

    try {
      const result = await window.WSDP_API.request(
        "GET",
        `/projects/${projectId}/reports/library`
      );

      const data = result.data || {};

      periodicReports = Array.isArray(data.periodic_reports)
        ? data.periodic_reports
        : [];

      ipcs = Array.isArray(data.ipcs)
        ? data.ipcs
        : [];

      amendments = Array.isArray(data.amendments)
        ? data.amendments
        : [];

      methodStatements = Array.isArray(data.method_statements)
        ? data.method_statements
        : [];

      renderReportLibrary();
    } catch (err) {
      console.error("Failed to load report library:", err);

      renderLibraryEmpty(els.periodicReportsTableBody, 3, "Failed to load periodic reports.");
      renderLibraryEmpty(els.ipcsTableBody, 3, "Failed to load IPCs.");
      renderLibraryEmpty(els.amendmentsTableBody, 3, "Failed to load amendments.");
      renderLibraryEmpty(els.methodStatementsTableBody, 3, "Failed to load method statements.");

      toast(err.message || "Failed to load reports library.", "fa-triangle-exclamation");
    }
  }

  async function saveReport(e) {
    e.preventDefault();

    if (!projectId) {
      toast("Project context is missing. Please seed or create a project first.", "fa-triangle-exclamation");
      return;
    }

    const payload = getPayload();
    const validationError = validatePayload(payload);

    if (validationError) {
      toast(validationError, "fa-triangle-exclamation");
      return;
    }

    const id = els.reportId.value;
    setLoading(true);

    try {
      if (id) {
        await window.WSDP_API.request("PUT", `/reports/${id}`, payload);
        toast("Report updated successfully.", "fa-pen");
      } else {
        await window.WSDP_API.request("POST", `/projects/${projectId}/reports`, payload);
        toast("Report created successfully.", "fa-file-circle-plus");
      }

      resetForm();
      await loadReports();
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to save report.", "fa-triangle-exclamation");
    } finally {
      setLoading(false);
    }
  }

  async function deleteReport(id) {
    const report = reports.find((item) => item.id === id);
    const name = report ? report.title : "this report";

    const ok = confirm(`Delete "${name}"? This will remove it from the Reports list.`);
    if (!ok) return;

    try {
      await window.WSDP_API.request("DELETE", `/reports/${id}`);
      toast("Report deleted successfully.", "fa-trash");
      await loadReports();

      if (els.reportId.value === id) {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to delete report.", "fa-triangle-exclamation");
    }
  }

  function downloadBase64File(fileData) {
    if (!fileData || !fileData.content_base64) {
      toast("Export response is missing file content.", "fa-triangle-exclamation");
      return;
    }

    const binary = atob(fileData.content_base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], {
      type: fileData.mime_type || "application/octet-stream",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileData.filename || "report";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async function exportReport(id, format) {
    try {
      const result = await window.WSDP_API.request(
        "GET",
        `/reports/${id}/export?format=${encodeURIComponent(format)}`
      );

      downloadBase64File(result.data);

      const labelMap = {
        pdf: "PDF",
        excel: "Excel",
        powerpoint: "PowerPoint",
      };

      toast(`${labelMap[format] || "Report"} exported successfully.`, "fa-file-export");
    } catch (err) {
      console.error(err);
      toast(err.message || "Failed to export report.", "fa-triangle-exclamation");
    }
  }

  function handleTableClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");

    if (!id) return;

    if (action === "edit") {
      const report = reports.find((item) => item.id === id);
      if (report) fillForm(report);
      return;
    }

    if (action === "delete") {
      deleteReport(id);
      return;
    }

    if (action === "export") {
      exportReport(id, btn.getAttribute("data-format") || "pdf");
    }
  }

  function generateCustomDraft() {
    const now = new Date();
    const monthName = now.toLocaleString("en-US", { month: "long" });
    const shortMonth = now.toLocaleString("en-US", { month: "short" });
    const year = now.getFullYear();

    els.reportId.value = "";
    els.title.value = `Custom Progress Report - ${monthName} ${year}`;
    els.period.value = `${shortMonth} ${year}`;
    els.module.value = "overall";
    els.generatedDate.value = todayIso();
    els.status.value = "draft";
    els.summary.value = "Custom report draft generated from the Reports module.";

    toast("Custom draft prepared. Review and click Save Report.", "fa-wand-magic-sparkles");
  }

  function bindEvents() {
    els.form?.addEventListener("submit", saveReport);
    els.resetBtn?.addEventListener("click", resetForm);
    els.customBtn?.addEventListener("click", generateCustomDraft);
    els.tableBody?.addEventListener("click", handleTableClick);
  }

  async function ensureAuthReady() {
    if (!window.WSDP_API) {
      throw new Error("WSDP_API is not available. Check that js/api.js is loaded before js/reports.js.");
    }

    if (typeof window.WSDP_API.restoreSession === "function") {
      const user = await window.WSDP_API.restoreSession();

      if (!user) {
        window.location.href = "login.html";
        return false;
      }
    }

    return true;
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    bindElements();

    if (!els.form || !els.tableBody) {
      console.error("Reports module DOM elements are missing.");
      initialized = false;
      return;
    }

    bindEvents();
    resetForm();

    try {
      const authOk = await ensureAuthReady();
      if (!authOk) return;

      await loadDefaultProject();
      await loadReports();
      await loadReportLibrary();
    } catch (err) {
      console.error(err);

      renderProjectLabel();
      renderEmpty(err.message || "Failed to load reports.");

      renderLibraryEmpty(els.periodicReportsTableBody, 3, "Failed to load periodic reports.");
      renderLibraryEmpty(els.ipcsTableBody, 3, "Failed to load IPCs.");
      renderLibraryEmpty(els.amendmentsTableBody, 3, "Failed to load amendments.");
      renderLibraryEmpty(els.methodStatementsTableBody, 3, "Failed to load method statements.");

      toast(err.message || "Failed to load reports.", "fa-triangle-exclamation");
    }
  }

  function initWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  }

  document.addEventListener("wsdp:authready", init, { once: true });

  initWhenReady();
})();