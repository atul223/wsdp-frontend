/* ============================================================
   risk-delay-search.js — Delay Analysis & Risk Register module search
   Load order required: after js/risk-delay.js.

   Responsibility (ONLY): functional module search box, same
   behavior/pattern as the other module-search files already built
   (js/home-dashboard.js, js/project-overview.js, js/financial-search.js,
   js/resource-search.js) -- clicking/focusing the SAME shared
   #globalSearch topbar input (rendered by shell.js on every page)
   shows a dropdown of every sub-section on THIS page and jumps to it
   on click.

   NOTE ON THIS PAGE'S STRUCTURE: this page already has native anchor
   links in its .subnav (#delay-analysis / #risk-register) that jump
   instantly via the browser's default hash-scroll behavior, and an
   inline script that flips `data-page` on <body> based on
   location.hash for sidebar highlighting. This search feature does
   NOT touch location.hash or that inline script at all -- it uses
   scrollIntoView() for a smoother scroll + a brief highlight pulse,
   fully independent of (and non-conflicting with) the existing
   subnav links.

   Like resource-search.js, the KPI card VALUES here are populated
   asynchronously by risk-delay.js once its API calls resolve, but
   the KPI card LABELS ("Projected Slippage", "Open Delay Items",
   etc.), all 4 section headings, and the "Top Risks" table heading
   are all present in the static HTML from first paint -- so a single
   index build at init time is sufficient here (unlike Resource
   Dashboard, which had entire cards injected after load). The index
   is still rebuilt fresh on every open anyway, as a zero-cost safety
   margin in case that ever changes.

   This file is wired ONLY here and only loads on risk-delay.html, so
   risk-delay.js and every other module/page are completely untouched.
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
    if (document.getElementById("riskDelaySearchDynamicStyles")) return;

    const style = document.createElement("style");
    style.id = "riskDelaySearchDynamicStyles";
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
     Search index — rebuilt fresh on every open.

     1) "Summary Cards" -- the 4 KPI cards inside #delayKpiGrid
        (Projected Slippage, Open Delay Items, Mitigated This
        Quarter, On Critical Path). These use ".kpi-card__label" divs
        even though the outer card itself only has class "card
        card-accent ..." (no "kpi-card" class on this page), so we
        query by the label class directly and jump to the closest
        ".card".
     2) "Sections" -- all 4 <h2> section headings: Delay Analysis,
        Risk Register, Non-Conformity Register (Open), Corrective
        Actions Tracker. Jump target is the whole <section> element.
     3) "Tables" -- any .card-header h3 inside these sections (e.g.
        "Top Risks" inside Risk Register). Jump target is that card.
     --------------------------------------------------------------- */
  function buildSearchIndex() {
    const index = [];

    document.querySelectorAll(".kpi-card__label").forEach(function (label) {
      const card = label.closest(".card");
      if (!card) return;
      index.push({
        group: "Summary Cards",
        label: label.textContent.trim(),
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

    document.querySelectorAll(".card-header h3").forEach(function (h3) {
      const card = h3.closest(".card");
      if (!card) return;
      index.push({
        group: "Tables",
        label: h3.textContent.trim(),
        icon: "fa-table-list",
        el: card
      });
    });

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

      // Rebuilt fresh every time -- cheap, and safe against any future
      // dynamic sections being added to this page.
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
