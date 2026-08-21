/* ============================================================
   js/ehs.js — EHS Dashboard data + CRUD engine
   Load AFTER api.js, i18n.js, shell.js, main.js, charts.js and
   the jsPDF / html2canvas CDN scripts, BEFORE </body>.

   ------------------------------------------------------------
   v2 fixes:
   1. resolveProjectId() now reads the SAME source every other
      module already uses: localStorage.current_project (a JSON
      string with an `id` field) — confirmed via console dump.
   2. Backend routing fix: all EHS routers are mounted at
      '/api/v1/ehs' in app.js. Endpoints come in two shapes:
        - project-nested   -> /ehs/projects/:projectId/<resource>
                               (list + create)
        - id-addressed      -> /ehs/<resource>/:id
                               (get one / update / delete)
      p()  builds the first shape.
      pid() builds the second shape.
      Mixing these up (as v1 did for the by-id calls) causes
      404s on every Edit/Delete/Save action.
   ============================================================ */
(function () {
  "use strict";

  function resolveProjectId() {
    // 1) Explicit global, if some page sets it directly.
    if (window.WSDP_PROJECT_ID) return window.WSDP_PROJECT_ID;

    // 2) The convention actually used across this app:
    //    localStorage.current_project = '{"id":"...","name":"...",...}'
    try {
      const raw = localStorage.getItem("current_project");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) return parsed.id;
      }
    } catch (e) {
      /* ignore malformed JSON */
    }

    // 3) Fallbacks kept for safety / future-proofing.
    try {
      const stored = sessionStorage.getItem("wsdp_project_id");
      if (stored) return stored;
      const user = JSON.parse(sessionStorage.getItem("wsdp_user") || "null");
      if (user && user.project_id) return user.project_id;
      if (user && user.projects && user.projects[0]) return user.projects[0].id;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  const PROJECT_ID = resolveProjectId();
  const api = window.WSDP_API;

  // All EHS routers are mounted at '/api/v1/ehs' in app.js (same prefix
  // as the pre-existing ehsIncidentRoutes / ehsInspectionRoutes) — see
  // note at top of file.
  const EHS_BASE = "/ehs";

  /** Project-nested endpoints: list + create.
   *  e.g. p("/ehs-incident-summary") -> /ehs/projects/:projectId/ehs-incident-summary */
  function p(path) {
    return `${EHS_BASE}/projects/${PROJECT_ID}${path}`;
  }

  /** Id-addressed endpoints: get one / update / delete (NOT nested under
   *  /projects/:projectId/).
   *  e.g. pid("/ehs-incident-summary/abc123") -> /ehs/ehs-incident-summary/abc123 */
  function pid(path) {
    return `${EHS_BASE}${path}`;
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    compliance: null,
    incidentSummary: [],
    nonConformitySummary: [],
    resourceConsumption: [],
    importTargets: [],
  };

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function statusChipClass(status) {
    const s = (status || "").toLowerCase();
    if (["closed", "effective", "resolved", "nil", "ok", "compliant"].includes(s)) return "ok";
    if (["open", "critical", "non-compliance", "overdue"].includes(s)) return "crit";
    return "warn";
  }

  function animateNumber(elNode, target, suffix) {
    if (!elNode) return;
    const isFloat = !Number.isInteger(target);
    const start = 0;
    const duration = 700;
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const value = start + (target - start) * progress;
      elNode.textContent = isFloat ? value.toFixed(1) : Math.round(value);
      if (progress < 1) requestAnimationFrame(step);
      else elNode.textContent = isFloat ? target.toFixed(1) : target;
    }
    requestAnimationFrame(step);
    if (suffix !== undefined) elNode.dataset.count = target;
  }

  function toast(message, isError) {
    let box = document.getElementById("ehsToast");
    if (!box) {
      box = el(`<div id="ehsToast" class="ehs-toast"></div>`);
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.toggle("ehs-toast--error", !!isError);
    box.classList.add("ehs-toast--visible");
    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => box.classList.remove("ehs-toast--visible"), 3200);
  }

  // ------------------------------------------------------------------
  // Generic modal
  // ------------------------------------------------------------------
  function ensureModalMounted() {
    if (document.getElementById("ehsModalOverlay")) return;
    document.body.appendChild(
      el(`
      <div class="ehs-modal-overlay" id="ehsModalOverlay" hidden>
        <div class="ehs-modal" role="dialog" aria-modal="true">
          <div class="ehs-modal__header">
            <h3 id="ehsModalTitle">Title</h3>
            <button type="button" class="ehs-modal__close" id="ehsModalCloseBtn" aria-label="Close">&times;</button>
          </div>
          <div class="ehs-modal__body" id="ehsModalBody"></div>
          <div class="ehs-modal__footer">
            <button type="button" class="ehs-btn ehs-btn--danger" id="ehsModalDeleteBtn" hidden>
              <i class="fa-solid fa-trash"></i> Delete
            </button>
            <div class="ehs-modal__footer-right">
              <button type="button" class="ehs-btn ehs-btn--secondary" id="ehsModalCancelBtn">Cancel</button>
              <button type="button" class="ehs-btn ehs-btn--primary" id="ehsModalSaveBtn">Save</button>
            </div>
          </div>
        </div>
      </div>
    `)
    );
    document.getElementById("ehsModalCloseBtn").addEventListener("click", closeModal);
    document.getElementById("ehsModalCancelBtn").addEventListener("click", closeModal);
    document.getElementById("ehsModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "ehsModalOverlay") closeModal();
    });
  }

  function closeModal() {
    const overlay = document.getElementById("ehsModalOverlay");
    if (overlay) overlay.setAttribute("hidden", "");
  }

  /**
   * fields: [{ name, label, type: 'text'|'number'|'textarea'|'select'|'checkbox', value, options, placeholder, help }]
   */
  function openModal({ title, fields, onSave, onDelete, saveLabel }) {
    ensureModalMounted();
    const overlay = document.getElementById("ehsModalOverlay");
    const body = document.getElementById("ehsModalBody");
    document.getElementById("ehsModalTitle").textContent = title;
    body.innerHTML = "";

    fields.forEach((f) => {
      const wrap = document.createElement("div");
      wrap.className = "ehs-field";
      const labelHtml = `<label class="ehs-field__label" for="ehsField_${f.name}">${escapeHtml(f.label)}</label>`;
      let inputHtml = "";

      if (f.type === "textarea") {
        inputHtml = `<textarea class="ehs-field__input" id="ehsField_${f.name}" placeholder="${escapeHtml(
          f.placeholder || ""
        )}">${escapeHtml(f.value || "")}</textarea>`;
      } else if (f.type === "select") {
        const opts = (f.options || [])
          .map(
            (o) =>
              `<option value="${escapeHtml(o.value)}" ${o.value === f.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`
          )
          .join("");
        inputHtml = `<select class="ehs-field__input" id="ehsField_${f.name}">${opts}</select>`;
      } else if (f.type === "checkbox") {
        inputHtml = `<label class="ehs-field__checkbox"><input type="checkbox" id="ehsField_${f.name}" ${
          f.value ? "checked" : ""
        }/> ${escapeHtml(f.checkboxLabel || "")}</label>`;
      } else {
        inputHtml = `<input class="ehs-field__input" type="${f.type || "text"}" id="ehsField_${f.name}" value="${escapeHtml(
          f.value !== undefined && f.value !== null ? f.value : ""
        )}" placeholder="${escapeHtml(f.placeholder || "")}" ${f.step ? `step="${f.step}"` : ""}/>`;
      }

      const helpHtml = f.help ? `<div class="ehs-field__help">${escapeHtml(f.help)}</div>` : "";
      wrap.innerHTML = f.type === "checkbox" ? `${inputHtml}${helpHtml}` : `${labelHtml}${inputHtml}${helpHtml}`;
      body.appendChild(wrap);
    });

    const saveBtn = document.getElementById("ehsModalSaveBtn");
    const deleteBtn = document.getElementById("ehsModalDeleteBtn");
    saveBtn.textContent = saveLabel || "Save";

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener("click", async () => {
      const values = {};
      fields.forEach((f) => {
        const inputEl = document.getElementById(`ehsField_${f.name}`);
        if (!inputEl) return;
        if (f.type === "checkbox") values[f.name] = inputEl.checked;
        else if (f.type === "number") values[f.name] = inputEl.value === "" ? null : Number(inputEl.value);
        else values[f.name] = inputEl.value;
      });
      try {
        newSaveBtn.disabled = true;
        await onSave(values);
        closeModal();
      } catch (err) {
        toast(err.message || "Something went wrong. Please try again.", true);
      } finally {
        newSaveBtn.disabled = false;
      }
    });

    if (onDelete) {
      deleteBtn.hidden = false;
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to delete this item? This cannot be undone.")) return;
        try {
          await onDelete();
          closeModal();
        } catch (err) {
          toast(err.message || "Delete failed.", true);
        }
      });
    } else {
      deleteBtn.hidden = true;
    }

    overlay.removeAttribute("hidden");
  }

  // ------------------------------------------------------------------
  // Compliance summary (7 KPI cards)
  // ------------------------------------------------------------------
  const CARD_META = {
    overall_eshs_pct: { label: "Overall ESHS", elId: "kpiOverallEshs", kind: "pct" },
    pgas_esmp_pct: { label: "PGAS / ESMP", elId: "kpiPgasEsmp", kind: "pct" },
    health_safety_plan_pct: { label: "Health & Safety Plan", elId: "kpiHealthSafety", kind: "pct" },
    site_management_plan_pct: { label: "Site Management Plan", elId: "kpiSiteMgmt", kind: "pct" },
    method_statements_pct: { label: "Method Statements", elId: "kpiMethodStatements", kind: "pct" },
    open_incidents: { label: "Open Incidents", elId: "kpiOpenIncidents", kind: "override" },
    toolbox_talks_30d: { label: "Toolbox Talks (30d)", elId: "kpiToolboxTalks", kind: "override" },
  };

  async function loadCompliance() {
    const res = await api.request("GET", p("/ehs-compliance-summary"));
    state.compliance = res.data;
    renderCompliance();
  }

  function renderCompliance() {
    const c = state.compliance || {};
    Object.entries(CARD_META).forEach(([key, meta]) => {
      const valueEl = document.querySelector(`#${meta.elId} .count-up`);
      if (!valueEl) return;
      const value = c[key];
      if (value === null || value === undefined) {
        valueEl.textContent = "—";
        return;
      }
      animateNumber(valueEl, Number(value));

      if (meta.kind === "override") {
        const deltaEl = document.querySelector(`#${meta.elId} .kpi-card__delta`);
        if (deltaEl) {
          const note = key === "open_incidents" ? c.open_incidents_note : c.toolbox_talks_30d_note;
          deltaEl.textContent = note || (key === "open_incidents" ? "No note added" : "Across all active work fronts");
        }
      }
    });
  }

  function openCardEditModal(cardKey) {
    const meta = CARD_META[cardKey];
    const c = state.compliance || {};

    if (meta.kind === "pct") {
      openModal({
        title: `Edit ${meta.label}`,
        fields: [
          { name: "value", label: `${meta.label} (%)`, type: "number", value: c[cardKey], step: "0.1", help: "Target ≥ 90%" },
        ],
        onSave: async (values) => {
          const payload = { [cardKey]: values.value };
          const res = await api.request("PATCH", p("/ehs-compliance-summary"), payload);
          state.compliance = res.data;
          renderCompliance();
          toast(`${meta.label} updated.`);
        },
      });
      return;
    }

    // override-type cards: Open Incidents / Toolbox Talks (30d)
    const overrideField = cardKey === "open_incidents" ? "open_incidents_override" : "toolbox_talks_30d_override";
    const noteField = cardKey === "open_incidents" ? "open_incidents_note" : "toolbox_talks_30d_note";
    const isOverride = cardKey === "open_incidents" ? c.open_incidents_is_override : c.toolbox_talks_30d_is_override;

    openModal({
      title: `Edit ${meta.label}`,
      fields: [
        {
          name: "useOverride",
          type: "checkbox",
          value: isOverride,
          checkboxLabel: "Manually override this value (uncheck to auto-calculate)",
        },
        { name: "value", label: "Value", type: "number", value: c[cardKey] },
        { name: "note", label: "Note / detail shown under the value", type: "text", value: c[noteField] },
      ],
      onSave: async (values) => {
        const payload = {
          [overrideField]: values.useOverride ? values.value : null,
          [noteField]: values.note,
        };
        const res = await api.request("PATCH", p("/ehs-compliance-summary"), payload);
        state.compliance = res.data;
        renderCompliance();
        toast(`${meta.label} updated.`);
      },
    });
  }

  // ------------------------------------------------------------------
  // Incidents & Non-Conformities summary tables (Type / Count / Details / Status)
  // ------------------------------------------------------------------
  const SUMMARY_TABLES = {
    incident_summary: { path: "/ehs-incident-summary", byIdPath: "/ehs-incident-summary", bodyId: "ehsIncidentSummaryBody", label: "Incident" },
    nonconformity_summary: {
      path: "/ehs-nonconformity-summary",
      byIdPath: "/ehs-nonconformity-summary",
      bodyId: "ehsNonConformitySummaryBody",
      label: "Non-Conformity",
    },
  };

  async function loadSummaryTable(kind) {
    const cfg = SUMMARY_TABLES[kind];
    const res = await api.request("GET", p(cfg.path));
    if (kind === "incident_summary") state.incidentSummary = res.data;
    else state.nonConformitySummary = res.data;
    renderSummaryTable(kind);
  }

  function renderSummaryTable(kind) {
    const cfg = SUMMARY_TABLES[kind];
    const rows = kind === "incident_summary" ? state.incidentSummary : state.nonConformitySummary;
    const tbody = document.getElementById(cfg.bodyId);
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="ehs-empty-row">No records yet. Click "Add" to create the first entry.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (row, idx) => `
      <tr data-id="${row.id}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.type)}</td>
        <td class="num">${row.count}</td>
        <td>${escapeHtml(row.details || "—")}</td>
        <td><span class="status-chip ${statusChipClass(row.status)}">${escapeHtml(row.status)}</span></td>
        <td class="ehs-actions-col">
          <button class="ehs-icon-btn" data-action="edit" data-kind="${kind}" data-id="${row.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="ehs-icon-btn ehs-icon-btn--danger" data-action="delete" data-kind="${kind}" data-id="${row.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`
      )
      .join("");
  }

  function openSummaryItemModal(kind, existing) {
    const cfg = SUMMARY_TABLES[kind];
    openModal({
      title: existing ? `Edit ${cfg.label}` : `Add ${cfg.label}`,
      saveLabel: existing ? "Save Changes" : "Add",
      fields: [
        { name: "type", label: "Type", type: "text", value: existing ? existing.type : "" },
        { name: "count", label: "Count", type: "number", value: existing ? existing.count : 0 },
        { name: "details", label: "Details", type: "textarea", value: existing ? existing.details : "" },
        { name: "status", label: "Status", type: "text", value: existing ? existing.status : "" },
      ],
      onSave: async (values) => {
        if (existing) {
          // id-addressed endpoint -> pid(), NOT nested under /projects/:id/
          await api.request("PATCH", pid(`${cfg.byIdPath}/${existing.id}`), values);
          toast(`${cfg.label} updated.`);
        } else {
          // list/create endpoint -> project-nested -> p()
          await api.request("POST", p(cfg.path), values);
          toast(`${cfg.label} added.`);
        }
        await loadSummaryTable(kind);
      },
      onDelete: existing
        ? async () => {
            await api.request("DELETE", pid(`${cfg.byIdPath}/${existing.id}`));
            toast(`${cfg.label} deleted.`);
            await loadSummaryTable(kind);
          }
        : null,
    });
  }

  // ------------------------------------------------------------------
  // Resource Consumption Detail table
  // ------------------------------------------------------------------
  async function loadResourceConsumption() {
    const res = await api.request("GET", p("/ehs-resource-consumption"));
    state.resourceConsumption = res.data;
    renderResourceConsumption();
    renderResourceChart();
  }

  function renderResourceConsumption() {
    const tbody = document.getElementById("resourceConsumptionBody");
    if (!tbody) return;
    const rows = state.resourceConsumption;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="ehs-empty-row">No records yet. Click "Add" to create the first entry.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((row, idx) => {
        const trend = row.trend_pct;
        const trendClass = trend === null ? "" : trend > 0 ? (row.resource_name.match(/energy|diesel/i) ? "ok" : "warn") : "ok";
        const trendLabel = trend === null ? "—" : `${trend > 0 ? "↑ +" : "↓ "}${trend}%`;
        return `
      <tr data-id="${row.id}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.resource_name)}${row.unit ? ` (${escapeHtml(row.unit)})` : ""}</td>
        <td class="num">${row.previous_value.toLocaleString()}</td>
        <td class="num">${row.current_value.toLocaleString()}</td>
        <td><span class="status-chip ${trendClass || "warn"}">${trendLabel}</span></td>
        <td class="ehs-actions-col">
          <button class="ehs-icon-btn" data-action="edit-resource" data-id="${row.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="ehs-icon-btn ehs-icon-btn--danger" data-action="delete-resource" data-id="${row.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
      })
      .join("");
  }

  function renderResourceChart() {
    const canvas = document.getElementById("ehsResourceConsumptionChart");
    if (!canvas || typeof Chart === "undefined") return;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const rows = state.resourceConsumption;
    if (!rows.length) return;

    const prevLabel = rows[0].previous_period_label;
    const currLabel = rows[0].current_period_label;

    new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.resource_name),
        datasets: [
          { label: prevLabel, backgroundColor: "#16a34a", data: rows.map((r) => r.previous_value) },
          { label: currLabel, backgroundColor: "#1d4ed8", data: rows.map((r) => r.current_value) },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function openResourceModal(existing) {
    openModal({
      title: existing ? "Edit Resource Consumption" : "Add Resource Consumption",
      saveLabel: existing ? "Save Changes" : "Add",
      fields: [
        { name: "resource_name", label: "Resource", type: "text", value: existing ? existing.resource_name : "" },
        { name: "unit", label: "Unit (optional, e.g. m³, kWh, L, kg)", type: "text", value: existing ? existing.unit : "" },
        {
          name: "previous_period_label",
          label: "Previous Period Label (e.g. Apr 2026)",
          type: "text",
          value: existing ? existing.previous_period_label : "",
        },
        { name: "previous_value", label: "Previous Value", type: "number", value: existing ? existing.previous_value : "" },
        {
          name: "current_period_label",
          label: "Current Period Label (e.g. May 2026)",
          type: "text",
          value: existing ? existing.current_period_label : "",
        },
        { name: "current_value", label: "Current Value", type: "number", value: existing ? existing.current_value : "" },
      ],
      onSave: async (values) => {
        if (existing) {
          // id-addressed endpoint -> pid()
          await api.request("PATCH", pid(`/ehs-resource-consumption/${existing.id}`), values);
          toast("Resource consumption row updated.");
        } else {
          // list/create endpoint -> project-nested -> p()
          await api.request("POST", p("/ehs-resource-consumption"), values);
          toast("Resource consumption row added.");
        }
        await loadResourceConsumption();
      },
      onDelete: existing
        ? async () => {
            await api.request("DELETE", pid(`/ehs-resource-consumption/${existing.id}`));
            toast("Row deleted.");
            await loadResourceConsumption();
          }
        : null,
    });
  }

  // ------------------------------------------------------------------
  // Export (client-side PDF via jsPDF + html2canvas)
  // ------------------------------------------------------------------
  async function exportToPdf() {
    if (typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
      toast("Export libraries did not load. Check your internet connection and try again.", true);
      return;
    }
    toast("Preparing export…");

    const target = document.querySelector("main.main-content");
    const canvas = await window.html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    pdf.save(`EHS-Dashboard-${dateStr}.pdf`);
    toast("Export ready — check your downloads.");
  }

  // ------------------------------------------------------------------
  // Import (CSV upload)
  // ------------------------------------------------------------------
  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const row = {};
      headers.forEach((h, i) => (row[h] = cells[i] !== undefined ? cells[i] : ""));
      return row;
    });
  }

  async function loadImportTargets() {
    try {
      const res = await api.request("GET", p("/ehs-import/targets"));
      state.importTargets = res.data;
    } catch (e) {
      state.importTargets = [];
    }
  }

  function openImportModal() {
    const targetOptions = (state.importTargets.length
      ? state.importTargets
      : [
          { table: "incident_summary", expected_headers: ["type", "count", "details", "status"] },
          { table: "nonconformity_summary", expected_headers: ["type", "count", "details", "status"] },
          {
            table: "resource_consumption",
            expected_headers: [
              "resource_name",
              "unit",
              "previous_period_label",
              "previous_value",
              "current_period_label",
              "current_value",
            ],
          },
        ]
    ).map((t) => ({ value: t.table, label: t.table.replace(/_/g, " ") }));

    ensureModalMounted();
    openModal({
      title: "Import CSV",
      saveLabel: "Import",
      fields: [
        { name: "table", label: "Import into", type: "select", options: targetOptions, value: targetOptions[0].value },
        {
          name: "_fileHint",
          label: "CSV file",
          type: "text",
          value: "",
          placeholder: "Choose a file below",
          help: "First row must be a header row matching the expected columns for the selected table.",
        },
      ],
      onSave: async () => {
        const fileInput = document.getElementById("ehsImportFileInput");
        const tableSelect = document.getElementById("ehsField_table");
        if (!fileInput.files.length) {
          throw new Error("Please choose a CSV file to import.");
        }
        const text = await fileInput.files[0].text();
        const rows = parseCsv(text);
        if (!rows.length) throw new Error("The CSV file appears to be empty.");

        const res = await api.request("POST", p("/ehs-import"), { table: tableSelect.value, rows });
        toast(`Import finished: ${res.data.created} added, ${res.data.failed} failed.`, res.data.failed > 0);

        await Promise.all([loadSummaryTable("incident_summary"), loadSummaryTable("nonconformity_summary"), loadResourceConsumption()]);
      },
    });

    // Inject a real file input under the "CSV file" text field (kept as a
    // help/label row above), since the generic modal builder doesn't have
    // a native file type.
    const body = document.getElementById("ehsModalBody");
    const fileWrap = el(`
      <div class="ehs-field">
        <input type="file" id="ehsImportFileInput" accept=".csv" class="ehs-field__input" />
      </div>
    `);
    body.appendChild(fileWrap);
  }

  // ------------------------------------------------------------------
  // Event delegation for row-level edit/delete buttons
  // ------------------------------------------------------------------
  function wireRowActions() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "edit" || action === "delete") {
        const kind = btn.dataset.kind;
        const rows = kind === "incident_summary" ? state.incidentSummary : state.nonConformitySummary;
        const existing = rows.find((r) => r.id === id);
        openSummaryItemModal(kind, existing); // modal includes Delete button when `existing` is passed
      } else if (action === "edit-resource" || action === "delete-resource") {
        const existing = state.resourceConsumption.find((r) => r.id === id);
        openResourceModal(existing);
      }
    });

    document.querySelectorAll("[data-card-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openCardEditModal(btn.dataset.cardEdit));
    });

    document.querySelectorAll("[data-add-summary]").forEach((btn) => {
      btn.addEventListener("click", () => openSummaryItemModal(btn.dataset.addSummary));
    });

    const addResourceBtn = document.getElementById("addResourceConsumptionBtn");
    if (addResourceBtn) addResourceBtn.addEventListener("click", () => openResourceModal());

    const exportBtn = document.getElementById("ehsExportBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportToPdf);

    const importBtn = document.getElementById("ehsImportBtn");
    if (importBtn) importBtn.addEventListener("click", openImportModal);
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  async function init() {
    // Buttons (Add/Export/Import) work independently of data having
    // loaded, so wire them up FIRST — a failed/blocked data load should
    // never leave the whole UI inert.
    wireRowActions();

    if (!PROJECT_ID) {
      console.error("EHS: no project id resolved — check resolveProjectId() at the top of js/ehs.js");
      toast("Could not determine the active project. EHS data will not load.", true);
      return;
    }
    if (!api) {
      console.error("EHS: window.WSDP_API is not available — make sure js/api.js loads before js/ehs.js");
      return;
    }

    try {
      await Promise.all([
        loadCompliance(),
        loadSummaryTable("incident_summary"),
        loadSummaryTable("nonconformity_summary"),
        loadResourceConsumption(),
        loadImportTargets(),
      ]);
    } catch (err) {
      console.error("EHS: failed to load dashboard data", err);
      toast("Some EHS data failed to load. Check the console for details.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  window.EHS = {
    openCardEditModal,
    openSummaryItemModal,
    openResourceModal,
    openImportModal,
    exportToPdf,
    closeModal,
  };
})();
