/* ============================================================
   resource-search.js — Resource Dashboard module search
   Load order required: after js/resource-dashboard.js.

   Responsibility (ONLY): functional module search box, same
   behavior/pattern as Home Dashboard (js/home-dashboard.js),
   Project Overview (js/project-overview.js) and Financial Dashboard
   (js/financial-search.js) -- clicking/focusing the SAME shared
   #globalSearch topbar input (rendered by shell.js on every page)
   shows a dropdown of every sub-section on THIS page and jumps to it
   on click.

   IMPORTANT DIFFERENCE vs. the other 3 module-search files: most of
   this page's interesting sub-sections (HDPE Pipe Stock, Equipment
   Deployment, Workforce, and the 6 Manpower KPI cards) are rendered
   by resource-dashboard.js ASYNCHRONOUSLY, well after page load,
   once its API calls resolve (loadAllData() -> renderAll()). If the
   search index were built once at init time (like the other 3 pages
   do), it would permanently miss those cards. To handle this
   correctly, buildSearchIndex() here is called FRESH every time the
   dropdown is opened (focus/click/input), not cached -- so whatever
   exists in the DOM at that exact moment is always what gets shown,
   regardless of how long the async data load took (or even if it
   never completes / no project is configured, in which case the 3
   section headings still work, just without their report sub-items).

   This file is wired ONLY here and only loads on
   resource-dashboard.html, so resource-dashboard.js, financial-search.js,
   home-dashboard.js, project-overview.js and every other module/page
   are completely untouched.
   ============================================================ */

(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------------------------------------------------------
     Dropdown styles — identical class names/visual language to the
     other module search dropdowns, so every module looks/behaves the
     same way.
     --------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById("resourceSearchDynamicStyles")) return;

    const style = document.createElement("style");
    style.id = "resourceSearchDynamicStyles";
    style.textContent = `
      .home-search-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        width: 100%;
        min-width: 280px;
        max-height: 360px;
        overflow-y: auto;
        background: var(--bg-card, #fff);
        border: 1px solid var(--border-color, #e3e7eb);
        border-radius: 10px;
        box-shadow: 0 16px 40px rgba(16, 35, 61, 0.16);
        z-index: 60;
        padding: 6px;
      }

      .home-search-dropdown__group-label {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--text-muted, #8c9aa8);
        padding: 8px 10px 4px;
      }

      .home-search-dropdown__item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 7px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text-primary, #16232f);
      }

      .home-search-dropdown__item i {
        width: 16px;
        text-align: center;
        color: var(--text-muted, #8c9aa8);
        flex-shrink: 0;
      }

      .home-search-dropdown__item:hover,
      .home-search-dropdown__item.active-hover {
        background: var(--color-primary-light, #e7eef9);
        color: var(--color-primary, #0A4595);
      }

      .home-search-dropdown__item:hover i,
      .home-search-dropdown__item.active-hover i {
        color: var(--color-primary, #0A4595);
      }

      .home-search-dropdown__empty {
        padding: 16px 10px;
        text-align: center;
        font-size: 12.5px;
        color: var(--text-muted, #8c9aa8);
      }

      .home-search-highlight {
        animation: homeSearchPulse 1.6s ease-out;
        border-radius: var(--radius-md, 12px);
      }

      @keyframes homeSearchPulse {
        0% { box-shadow: 0 0 0 0 rgba(10, 69, 149, 0.45); }
        70% { box-shadow: 0 0 0 14px rgba(10, 69, 149, 0); }
        100% { box-shadow: 0 0 0 0 rgba(10, 69, 149, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------
     Search index — rebuilt fresh on every open (see file header).

     1) "Summary Cards" -- every .kpi-card with a .kpi-card__label:
        covers the 4 top KPI cards (Materials Below Reorder, Equipment
        Utilization, Manpower Deployed, Idle / Maintenance) AND, once
        loaded, the 6 Manpower snapshot cards (Planned, Deployed, Gap,
        Female %, Local Nationals, Foreign Workers).
     2) "Sections" -- the 3 main <h2> section headings (Materials
        Availability, Equipment, Manpower). Jump target is the whole
        <section> element so the full section scrolls into view.
     3) "Reports" -- the dynamically-rendered report cards, read live:
        HDPE Pipe Stock, Equipment Deployment (Month 2026), Workforce
        (via their .resource-report-heading h3 text), plus a synthetic
        entry for the Manpower chart card (which has no visible
        heading of its own).
     --------------------------------------------------------------- */
  function buildSearchIndex() {
    const index = [];

    document.querySelectorAll(".kpi-card").forEach(function (card) {
      const labelEl = card.querySelector(".kpi-card__label");
      if (!labelEl) return;
      index.push({
        group: "Summary Cards",
        label: labelEl.textContent.trim(),
        icon: "fa-gauge-high",
        el: card
      });
    });

    document.querySelectorAll(".section-heading").forEach(function (heading) {
      const h2 = heading.querySelector("h2");
      if (!h2) return;
      const sectionEl = heading.closest("section") || heading;
      index.push({
        group: "Sections",
        label: h2.textContent.trim(),
        icon: "fa-layer-group",
        el: sectionEl
      });
    });

    document.querySelectorAll(".resource-report-card").forEach(function (card) {
      const h3 = card.querySelector(".resource-report-heading h3");
      if (!h3) return;
      index.push({
        group: "Reports",
        label: h3.textContent.trim(),
        icon: "fa-table-list",
        el: card
      });
    });

    const manpowerChartCard = document.querySelector(".manpower-chart-card");
    if (manpowerChartCard) {
      index.push({
        group: "Reports",
        label: "Manpower Deployment Chart",
        icon: "fa-chart-column",
        el: manpowerChartCard
      });
    }

    return index;
  }

  function getSearchAnchor(input) {
    return input.closest(".search-box") || input.parentElement;
  }

  function highlightElement(el) {
    el.classList.remove("home-search-highlight");
    void el.offsetWidth; // force reflow so the animation restarts if re-selected
    el.classList.add("home-search-highlight");
    setTimeout(function () {
      el.classList.remove("home-search-highlight");
    }, 1700);
  }

  function initModuleSearch() {
    const input = document.getElementById("globalSearch");
    if (!input) return;

    const anchor = getSearchAnchor(input);
    if (getComputedStyle(anchor).position === "static") {
      anchor.style.position = "relative";
    }

    let dropdown = null;
    let activeIndex = -1;
    let visibleItems = [];

    function closeDropdown() {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
      activeIndex = -1;
      visibleItems = [];
    }

    function selectEntry(entry) {
      closeDropdown();
      input.value = "";
      input.blur();
      entry.el.scrollIntoView({ behavior: "smooth", block: "start" });
      highlightElement(entry.el);
    }

    function renderDropdown(query) {
      const q = (query || "").trim().toLowerCase();

      // Rebuilt fresh every time -- see file header for why this
      // matters on this specific page (async-rendered report cards).
      const searchIndex = buildSearchIndex();

      const filtered = q
        ? searchIndex.filter(function (entry) { return entry.label.toLowerCase().includes(q); })
        : searchIndex;

      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "home-search-dropdown";
        anchor.appendChild(dropdown);
      }

      activeIndex = -1;
      visibleItems = [];

      if (!filtered.length) {
        dropdown.innerHTML = '<div class="home-search-dropdown__empty">No matching section found.</div>';
        return;
      }

      let html = "";
      let lastGroup = null;

      filtered.forEach(function (entry, i) {
        if (entry.group !== lastGroup) {
          html += '<div class="home-search-dropdown__group-label">' + escapeHtml(entry.group) + "</div>";
          lastGroup = entry.group;
        }
        html +=
          '<div class="home-search-dropdown__item" data-index="' + i + '">' +
          '<i class="fa-solid ' + entry.icon + '"></i>' +
          "<span>" + escapeHtml(entry.label) + "</span>" +
          "</div>";
      });

      dropdown.innerHTML = html;
      visibleItems = filtered;

      dropdown.querySelectorAll(".home-search-dropdown__item").forEach(function (item) {
        item.addEventListener("mousedown", function (e) {
          e.preventDefault(); // fire before the input's blur
          const idx = Number(item.getAttribute("data-index"));
          selectEntry(visibleItems[idx]);
        });
      });
    }

    input.addEventListener("focus", function () {
      renderDropdown(input.value);
    });

    input.addEventListener("click", function () {
      if (!dropdown) renderDropdown(input.value);
    });

    input.addEventListener("input", function () {
      renderDropdown(input.value);
    });

    // Capture-phase keydown so main.js's existing "Enter to search"
    // placeholder toast on this same shared input never fires while our
    // dropdown is actively open/being navigated.
    input.addEventListener(
      "keydown",
      function (e) {
        if (!dropdown || !visibleItems.length) return;

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopImmediatePropagation();
          const items = Array.from(dropdown.querySelectorAll(".home-search-dropdown__item"));
          items.forEach(function (it) { it.classList.remove("active-hover"); });
          activeIndex =
            e.key === "ArrowDown"
              ? Math.min(activeIndex + 1, items.length - 1)
              : Math.max(activeIndex - 1, 0);
          const activeEl = items[activeIndex];
          if (activeEl) {
            activeEl.classList.add("active-hover");
            activeEl.scrollIntoView({ block: "nearest" });
          }
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          e.stopImmediatePropagation();
          const chosen = activeIndex >= 0 ? visibleItems[activeIndex] : visibleItems[0];
          if (chosen) selectEntry(chosen);
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeDropdown();
          input.blur();
        }
      },
      true // capture phase: runs before main.js's own keydown listener
    );

    document.addEventListener("click", function (e) {
      if (!dropdown) return;
      if (e.target === input || anchor.contains(e.target)) return;
      closeDropdown();
    });
  }

  function init() {
    injectStyles();
    initModuleSearch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
