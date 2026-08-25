/* ============================================================
   project-overview.js — Project Overview page script
   Load order required (after existing includes):
   api.js, i18n.js, shell.js, main.js, then this file.

   Responsibility (ONLY): functional module search box, identical
   behavior to the one added on the Home Dashboard (js/home-dashboard.js)
   -- clicking/focusing the SAME shared #globalSearch topbar input
   (rendered by shell.js on every page) shows a dropdown of every
   sub-section heading found on THIS page (Project Overview) and
   jumps to it on click.

   This file is wired ONLY here and only loads on project-overview.html,
   so js/home-dashboard.js, js/main.js and every other module/page are
   completely untouched.
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
     Dropdown styles — same visual language/class names as the Home
     Dashboard's module search, so both modules look identical.
     --------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById("projectOverviewDynamicStyles")) return;

    const style = document.createElement("style");
    style.id = "projectOverviewDynamicStyles";
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
     Detects a human-readable label for a "card" element, in priority
     order. Generic/DOM-driven (not hardcoded text), so it stays
     correct even if wording on the page changes later:
       1) .card-header h3 (e.g. "Project Information", "Contract Information")
       2) .kpi-card__label (e.g. "Client / Owner", "Contractor")
       3) first bold (font-weight >= 700) text node, skipping icon-only
          elements (covers the "Explore the Dashboard" quick-link cards,
          which use an inline-styled bold div with no dedicated class)
       4) title attribute, or first non-empty line of text, as last resort
     --------------------------------------------------------------- */
  function extractCardLabel(cardEl) {
    const h3 = cardEl.querySelector(".card-header h3");
    if (h3 && h3.textContent.trim()) return h3.textContent.trim();

    const labelEl = cardEl.querySelector(".kpi-card__label");
    if (labelEl && labelEl.textContent.trim()) return labelEl.textContent.trim();

    const candidates = cardEl.querySelectorAll("div, span");
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = el.textContent.trim();
      if (!text || text.length < 2 || el.querySelector("i")) continue;
      const weight = parseInt(getComputedStyle(el).fontWeight, 10) || 400;
      if (weight >= 700) return text;
    }

    const title = cardEl.getAttribute("title");
    if (title && title.trim()) return title.trim();

    const firstLine = cardEl.textContent.trim().split("\n").map(function (s) { return s.trim(); }).filter(Boolean)[0];
    return firstLine || "Untitled section";
  }

  /** Returns the direct-child-level "cards" belonging to a section's
   *  content block, WITHOUT descending into nested sub-fields (e.g.
   *  the Contract Information card's own inner detail grid isn't
   *  each listed separately — its single .card-header h3 already
   *  represents that whole section). */
  function getDirectCards(contentBlock) {
    if (!contentBlock) return [];

    const wrapper = contentBlock.classList.contains("grid")
      ? contentBlock
      : contentBlock.querySelector(":scope > .grid") || contentBlock;

    return Array.from(wrapper.children).filter(function (child) {
      return child.classList.contains("card") || child.classList.contains("kpi-card");
    });
  }

  function buildSearchIndex() {
    const index = [];

    document.querySelectorAll(".section-heading").forEach(function (heading) {
      const h2 = heading.querySelector("h2");
      if (!h2) return;

      const sectionLabel = h2.textContent.trim();
      index.push({ group: "Sections", label: sectionLabel, icon: "fa-layer-group", el: heading });

      const contentBlock = heading.nextElementSibling;
      if (!contentBlock) return;

      // Prefer explicit card-header h3 titles when present (e.g. "Project
      // Information", "Contract Information") -- one item per card.
      const h3Cards = Array.from(contentBlock.querySelectorAll(".card-header h3"))
        .map(function (h3) { return h3.closest(".card"); })
        .filter(Boolean);

      if (h3Cards.length) {
        h3Cards.forEach(function (cardEl) {
          index.push({
            group: sectionLabel,
            label: extractCardLabel(cardEl),
            icon: "fa-file-lines",
            el: cardEl
          });
        });
        return;
      }

      // Otherwise index each direct-child card/kpi-card in the section's
      // grid (covers "Key Stakeholders" info cards and the "Explore the
      // Dashboard" quick-link cards).
      getDirectCards(contentBlock).forEach(function (cardEl) {
        index.push({
          group: sectionLabel,
          label: extractCardLabel(cardEl),
          icon: cardEl.tagName === "A" ? "fa-arrow-up-right-from-square" : "fa-circle-info",
          el: cardEl
        });
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

    const searchIndex = buildSearchIndex();
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
