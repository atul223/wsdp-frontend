/* ============================================================
   main.js — shell interactions (sidebar, theme, header, filters)
   Vanilla JS, modular functions -> easy to port to React hooks.
   ============================================================ */

(function () {
  "use strict";

  const shell = document.querySelector(".app-shell");
  const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const themeToggleIcon = document.getElementById("themeToggleIcon");

  /* ---------- Sidebar collapse (desktop) ---------- */
  function initSidebarCollapse() {
    const saved = localStorage.getItem("wsdp_sidebar_collapsed") === "true";
    if (saved) shell.classList.add("sidebar-collapsed");

    sidebarToggleBtn?.addEventListener("click", () => {
      shell.classList.toggle("sidebar-collapsed");
      localStorage.setItem(
        "wsdp_sidebar_collapsed",
        shell.classList.contains("sidebar-collapsed")
      );
    });
  }

  /* ---------- Sidebar mobile drawer ---------- */
  function initMobileDrawer() {
    mobileMenuBtn?.addEventListener("click", () => {
      shell.classList.toggle("sidebar-mobile-open");
    });
    document.addEventListener("click", (e) => {
      if (
        shell.classList.contains("sidebar-mobile-open") &&
        !e.target.closest(".sidebar") &&
        !e.target.closest("#mobileMenuBtn")
      ) {
        shell.classList.remove("sidebar-mobile-open");
      }
    });
  }

  /* ---------- Collapsible nav groups ---------- */
  function initNavGroups() {
    document.querySelectorAll(".nav-group > .nav-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        const group = link.parentElement;
        if (group.querySelector(".nav-submenu")) {
          e.preventDefault();
          const wasOpen = group.classList.contains("open");
          document
            .querySelectorAll(".nav-group.open")
            .forEach((g) => g !== group && g.classList.remove("open"));
          group.classList.toggle("open", !wasOpen);
        }
      });
    });
  }

  /* ---------- Theme (dark / light) ---------- */
  function initTheme() {
    const saved = localStorage.getItem("wsdp_theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon(saved);

    themeToggleBtn?.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("wsdp_theme", next);
      updateThemeIcon(next);
      document.dispatchEvent(new CustomEvent("wsdp:themechange", { detail: next }));
    });
  }
  function updateThemeIcon(theme) {
    if (!themeToggleIcon) return;
    themeToggleIcon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }

  /* ---------- Live date in header ---------- */
  function initHeaderDate() {
    const el = document.getElementById("headerDate");
    if (!el) return;
    const now = new Date();
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    el.textContent = now.toLocaleDateString("en-US", options);
  }

  /* ---------- Animate KPI progress bars & count-up on load ---------- */
  function initEntranceAnimations() {
    document.querySelectorAll(".progress-fill[data-target]").forEach((bar) => {
      const target = bar.getAttribute("data-target");
      requestAnimationFrame(() => {
        setTimeout(() => (bar.style.width = target + "%"), 120);
      });
    });

    document.querySelectorAll(".count-up").forEach((el) => {
      const target = parseFloat(el.getAttribute("data-count"));
      const decimals = el.getAttribute("data-decimals") ? parseInt(el.getAttribute("data-decimals")) : 0;
      const duration = 900;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;
        el.textContent = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = decimals > 0 ? target.toFixed(decimals) : target.toLocaleString();
      }
      requestAnimationFrame(tick);
    });
  }

  /* ---------- Toast notifications ----------
     Lightweight replacement for alert()/full reloads, per the
     "micro-interactions" recommendation (save/filter confirmations). */
  function showToast(message, opts) {
    opts = opts || {};
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      container.setAttribute("role", "status");
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="fa-solid ${opts.icon || "fa-circle-check"}"></i><span>${message}</span>`;
    container.appendChild(toast);
    const life = opts.duration || 2600;
    setTimeout(() => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 220);
    }, life);
  }
  // Expose so other page-specific scripts (charts.js, inline page scripts) can reuse it.
  window.WSDP_TOAST = showToast;

  /* ---------- Global search: Enter-to-search placeholder + Ctrl/Cmd+K ---------- */
  function initSearch() {
    const input = document.getElementById("globalSearch");
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        showToast(`Search is a placeholder in this demo — you searched "${input.value.trim()}"`, {
          icon: "fa-magnifying-glass",
        });
      }
    });

    // Command-palette style shortcut: Ctrl+K (Windows/Linux) or Cmd+K (Mac) jumps
    // straight to the header search box, from anywhere on the page.
    document.addEventListener("keydown", (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isCmdK) return;
      const box = document.getElementById("globalSearch");
      if (!box) return;
      e.preventDefault();
      box.focus();
      box.select();
    });
  }

  /* ---------- Active nav link highlighting based on data-page ---------- */
  function initActiveNav() {
    const page = document.body.getAttribute("data-page");
    if (!page) return;
    document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
      if (link.getAttribute("data-page") === page) {
        link.classList.add("active");
        const group = link.closest(".nav-group");
        if (group) group.classList.add("open");
      }
    });
  }

  /* ---------- Filter bar: makes the zone/date-range controls in the
     dashboards actually scope the page, per the "pinned filter bar that
     all widgets respect" recommendation. Anything marked data-zone is
     shown/hidden to match the selected zone; tables get a designed
     empty state instead of going blank. ---------- */
  function initFilterBars() {
    document.querySelectorAll(".filter-bar").forEach((bar) => {
      const selects = bar.querySelectorAll(".filter-select");
      if (!selects.length) return;
      selects.forEach((select) => select.addEventListener("change", () => applyFilters(bar)));
    });
  }

  function findZoneSelect(bar) {
    return Array.from(bar.querySelectorAll(".filter-select")).find((select) =>
      Array.from(select.options).some((opt) => /zone/i.test(opt.textContent))
    );
  }

  function applyFilters(bar) {
    const zoneSelect = findZoneSelect(bar);
    const zone = zoneSelect ? zoneSelect.value : "All Zones";
    const scope = bar.closest("main") || document;

    scope.querySelectorAll("[data-zone]").forEach((el) => {
      el.hidden = zone !== "All Zones" && el.getAttribute("data-zone") !== zone;
    });

    // Give any table whose rows just emptied out a designed empty state,
    // with a one-click way back to "All Zones" (see Improvement Tips §8).
    scope.querySelectorAll(".data-table").forEach((table) => {
      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr[data-zone]"));
      if (!rows.length) return;
      const visibleCount = rows.filter((r) => !r.hidden).length;
      let emptyRow = tbody.querySelector(".table-empty-row");

      if (visibleCount === 0) {
        if (!emptyRow) {
          const colCount = table.querySelectorAll("thead th").length || 1;
          emptyRow = document.createElement("tr");
          emptyRow.className = "table-empty-row";
          emptyRow.innerHTML = `<td colspan="${colCount}">
            <div class="empty-state">
              <i class="fa-solid fa-filter-circle-xmark"></i>
              <p>No records match these filters.</p>
              <button class="btn-ghost" type="button">Clear filters</button>
            </div>
          </td>`;
          tbody.appendChild(emptyRow);
          emptyRow.querySelector("button").addEventListener("click", () => {
            selectsToDefault(bar);
            applyFilters(bar);
          });
        }
        emptyRow.hidden = false;
      } else if (emptyRow) {
        emptyRow.hidden = true;
      }
    });

    if (window.WSDP_TOAST) {
      showToast(zone === "All Zones" ? "Showing all zones" : `Filtered to ${zone}`, { icon: "fa-filter" });
    }
  }

  function selectsToDefault(bar) {
    bar.querySelectorAll(".filter-select").forEach((select) => (select.selectedIndex = 0));
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSidebarCollapse();
    initMobileDrawer();
    initNavGroups();
    initTheme();
    initHeaderDate();
    initEntranceAnimations();
    initSearch();
    initActiveNav();
    initFilterBars();
  });
})();