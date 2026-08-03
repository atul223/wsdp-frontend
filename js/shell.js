/* ============================================================
   shell.js — shared application shell (sidebar + topbar)
   Single source of truth for navigation. Each page only needs:
     <aside id="sidebarMount"></aside>
     <header id="topbarMount"></header>
     <body data-page="KEY">
     <script> window.WSDP_PAGE = { title, breadcrumb, status }; </script>
   ...loaded BEFORE this file, with js/api.js loaded before THIS file.

   Added:
   - Global English / Portuguese language selector
   - Auto-loads js/i18n.js on every dashboard page
   ============================================================ */

(function () {
  "use strict";

  // ---- Navigation model -------------------------------------------------
  const NAV = [
    {
      section: "Overview",
      items: [
        { key: "home", label: "Home Dashboard", icon: "fa-gauge-high", href: "index.html" },
        { key: "overview", label: "Project Overview", icon: "fa-clipboard-list", href: "project-overview.html" },
      ],
    },
    {
      section: "Progress Tracking",
      items: [
        {
          key: "construction",
          label: "Construction Progress",
          icon: "fa-diagram-project",
          href: "construction-progress.html",
          children: [
            { label: "Pipeline Progress", href: "construction-progress.html#pipeline" },
            { label: "House Connections", href: "construction-progress.html#house-connections" },
            { label: "Testing & Commissioning", href: "construction-progress.html#testing" },
            { label: "Valve Chambers", href: "construction-progress.html#valve-chambers" },
            { label: "Bridge Crossings", href: "construction-progress.html#bridge-crossings" },
          ],
        },
        { key: "gis", label: "GIS Map", icon: "fa-map-location-dot", href: "gis-map.html" },
      ],
    },
    {
      section: "Resources & Finance",
      items: [
        { key: "financial", label: "Financial Dashboard", icon: "fa-sack-dollar", href: "financial-dashboard.html" },
        {
          key: "resources",
          label: "Resource Dashboard",
          icon: "fa-boxes-stacked",
          href: "resource-dashboard.html",
          children: [
            { label: "Materials", href: "resource-dashboard.html#materials" },
            { label: "Equipment", href: "resource-dashboard.html#equipment" },
            { label: "Manpower", href: "resource-dashboard.html#manpower" },
          ],
        },
      ],
    },
    {
      section: "Risk & Safety",
      items: [
        { key: "delay", label: "Delay Analysis", icon: "fa-triangle-exclamation", href: "risk-delay.html#delay-analysis" },
        { key: "risk", label: "Risk Register", icon: "fa-shield-halved", href: "risk-delay.html#risk-register" },
        { key: "ehs", label: "EHS Dashboard", icon: "fa-helmet-safety", href: "ehs-dashboard.html#ehs" },
        { key: "social", label: "Social & Environmental", icon: "fa-leaf", href: "ehs-dashboard.html#social-environmental" },
      ],
    },
    {
      section: "Tools",
      items: [
        { key: "reports", label: "Reports", icon: "fa-file-export", href: "reports.html" },
        { key: "settings", label: "Settings", icon: "fa-gear", href: "settings.html" },
      ],
    },
  ];

  function navLinkHTML(item, activeKey) {
    const isActive = item.key === activeKey;

    if (item.children) {
      const childLinks = item.children
        .map(
          (c) => `
            ${c.href}
              <span class="nav-link__label">${c.label}</span>
            </a>
          `
        )
        .join("");

      return `
        <div class="nav-group${isActive ? " open" : ""}">
          ${item.href}
            <span class="nav-link__icon"><i class="fa-solid ${item.icon}"></i></span>
            <span class="nav-link__label">${item.label}</span>
            <span class="nav-link__chevron"><i class="fa-solid fa-chevron-right"></i></span>
          </a>
          <div class="nav-submenu">${childLinks}</div>
        </div>
      `;
    }

    return `
      ${item.href}
        <span class="nav-link__icon"><i class="fa-solid ${item.icon}"></i></span>
        <span class="nav-link__label">${item.label}</span>
      </a>
    `;
  }

  function buildSidebar(activeKey) {
    const sections = NAV.map(
      (sec) => `
        <div class="nav-section">
          <div class="nav-section-label">${sec.section}</div>
          ${sec.items.map((i) => navLinkHTML(i, activeKey)).join("")}
        </div>
      `
    ).join("");

    return `
      <div class="sidebar-brand">
        <div class="sidebar-brand__mark"><i class="fa-solid fa-droplet"></i></div>
        <div class="sidebar-brand__text">
          <div class="name">PDISA WSDP</div>
          <div class="sub">Water Supply Distribution</div>
        </div>
      </div>

      <nav class="sidebar-nav">${sections}</nav>

      <div class="sidebar-foot">
        <button class="sidebar-toggle-btn" id="sidebarToggleBtn" aria-label="Collapse sidebar">
          <i class="fa-solid fa-angles-left"></i>
          <span class="sidebar-foot__text">Collapse</span>
        </button>
      </div>
    `;
  }

  function buildTopbar(cfg) {
    cfg = cfg || {};

    const title = cfg.title || "Dashboard";
    const breadcrumb = cfg.breadcrumb || "Water Supply Distribution Project";
    const statusClass = cfg.statusClass || "status-pill--warning";
    const statusText = cfg.statusText || "At Risk — Schedule";

    const selectedLanguage = localStorage.getItem("wsdp_language") || "en";

    return `
      <div class="topbar-left">
        <button class="icon-btn mobile-menu-btn" id="mobileMenuBtn" aria-label="Open menu">
          <i class="fa-solid fa-bars"></i>
        </button>

        <div class="topbar-title">
          <h1>${title}</h1>
          <p class="breadcrumb">${breadcrumb}</p>
        </div>
      </div>

      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
          type="text"
          id="globalSearch"
          placeholder="Search villages, IPCs, reports…"
          aria-label="Global search"
        />
        <kbd>⌘K</kbd>
      </div>

      <div class="topbar-right">
        <div class="language-switcher" data-tooltip="Language">
          <i class="fa-solid fa-globe"></i>
          <select id="languageSelector" aria-label="Language selector">
            <option value="en"${selectedLanguage === "en" ? " selected" : ""}>English</option>
            <option value="pt"${selectedLanguage === "pt" ? " selected" : ""}>Português</option>
          </select>
        </div>

        <span class="status-pill ${statusClass}" data-tooltip="Overall project RAG status">
          <span class="dot"></span> ${statusText}
        </span>

        <span class="header-date" id="headerDate"></span>

        <button class="icon-btn" id="themeToggleBtn" aria-label="Toggle dark mode">
          <i class="fa-solid fa-moon" id="themeToggleIcon"></i>
        </button>

        <button class="icon-btn" aria-label="Notifications" data-tooltip="3 unread alerts">
          <i class="fa-regular fa-bell"></i>
          <span class="notif-dot"></span>
        </button>

        <div class="user-menu" id="userMenuWrap">
          <button
            class="avatar"
            id="userMenuBtn"
            data-tooltip="Account menu"
            aria-haspopup="true"
            aria-expanded="false"
          >…</button>

          <div class="user-menu__dropdown" id="userMenuDropdown" hidden>
            <div class="user-menu__info">
              <div class="user-menu__name" id="userMenuName">—</div>
              <div class="user-menu__role" id="userMenuRole">—</div>
            </div>

            <button class="user-menu__logout" id="logoutBtn" type="button">
              <i class="fa-solid fa-right-from-bracket"></i> Log out
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Styles for user menu and language selector ------------------------

  function injectShellStyles() {
    if (document.getElementById("wsdpShellEnhancedStyles")) return;

    const style = document.createElement("style");
    style.id = "wsdpShellEnhancedStyles";

    style.textContent = `
      .user-menu {
        position: relative;
      }

      .user-menu__dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 50;
        min-width: 200px;
        background: var(--card-bg, #fff);
        border: 1px solid var(--border-color, #E3E7EB);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(16,30,54,0.12);
        padding: 10px;
      }

      .user-menu__dropdown[hidden] {
        display: none;
      }

      .user-menu__info {
        padding: 4px 8px 10px;
        border-bottom: 1px solid var(--border-color, #E3E7EB);
        margin-bottom: 8px;
      }

      .user-menu__name {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary, #16232F);
      }

      .user-menu__role {
        font-size: 11.5px;
        color: var(--text-muted, #8C9AA8);
        text-transform: capitalize;
        margin-top: 2px;
      }

      .user-menu__logout {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 8px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--color-critical, #C0392B);
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
      }

      .user-menu__logout:hover {
        background: var(--color-critical-light, #FBE7E5);
      }

      .language-switcher {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 36px;
        padding: 0 9px;
        border: 1px solid var(--border-color, #E3E7EB);
        border-radius: 999px;
        background: var(--card-bg, #fff);
        color: var(--text-secondary, #445568);
        font-size: 12px;
        white-space: nowrap;
      }

      .language-switcher i {
        font-size: 13px;
        color: var(--text-muted, #8C9AA8);
      }

      .language-switcher select {
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
        max-width: 105px;
      }

      @media (max-width: 1100px) {
        .language-switcher {
          padding: 0 7px;
        }

        .language-switcher select {
          max-width: 88px;
        }
      }

      @media (max-width: 768px) {
        .language-switcher {
          height: 34px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ---- Auth-related additions -------------------------------------------

  function initials(name) {
    if (!name) return "?";

    const parts = name.trim().split(/\s+/);

    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }

  function populateUserMenu(user) {
    injectShellStyles();

    const btn = document.getElementById("userMenuBtn");
    const dropdown = document.getElementById("userMenuDropdown");
    const nameEl = document.getElementById("userMenuName");
    const roleEl = document.getElementById("userMenuRole");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!btn || !dropdown) return;

    btn.textContent = initials(user.name);
    btn.setAttribute("data-tooltip", `${user.name} — ${user.role}`);

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = (user.role || "").replace(/_/g, " ");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const isOpen = !dropdown.hidden;

      dropdown.hidden = isOpen;
      btn.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.hidden && !e.target.closest("#userMenuWrap")) {
        dropdown.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });

    logoutBtn?.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "Logging out…";

      await window.WSDP_API.logout();

      window.location.href = "login.html";
    });

    if (window.WSDP_I18N && typeof window.WSDP_I18N.apply === "function") {
      window.WSDP_I18N.apply();
    }
  }

  async function initAuth() {
    if (document.body.getAttribute("data-page") === "login") return;
    if (!window.WSDP_API) return;

    const user = await window.WSDP_API.restoreSession();

    if (!user) {
      window.location.href = "login.html";
      return;
    }

    populateUserMenu(user);

    document.dispatchEvent(
      new CustomEvent("wsdp:authready", {
        detail: user,
      })
    );
  }

  // ---- Language script loader -------------------------------------------

  function loadI18n() {
    if (window.WSDP_I18N && typeof window.WSDP_I18N.init === "function") {
      window.WSDP_I18N.init();
      return;
    }

    if (document.getElementById("wsdpI18nScript")) return;

    const script = document.createElement("script");
    script.id = "wsdpI18nScript";
    script.src = "js/i18n.js";
    script.defer = true;

    script.onload = function () {
      if (window.WSDP_I18N && typeof window.WSDP_I18N.init === "function") {
        window.WSDP_I18N.init();
      }
    };

    document.head.appendChild(script);
  }

  function mount() {
    const sidebarMount = document.getElementById("sidebarMount");
    const topbarMount = document.getElementById("topbarMount");
    const activeKey = document.body.getAttribute("data-page");
    const cfg = window.WSDP_PAGE || {};

    injectShellStyles();

    if (sidebarMount) sidebarMount.innerHTML = buildSidebar(activeKey);
    if (topbarMount) topbarMount.innerHTML = buildTopbar(cfg);

    if (!document.querySelector(".sidebar-backdrop")) {
      const backdrop = document.createElement("div");
      backdrop.className = "sidebar-backdrop";
      document.body.appendChild(backdrop);
    }

    const shell = document.querySelector(".app-shell");

    if (shell && localStorage.getItem("wsdp_sidebar_collapsed") === "true") {
      shell.classList.add("sidebar-collapsed");
    }

    document.dispatchEvent(new CustomEvent("wsdp:shellready"));

    loadI18n();

    initAuth();
  }

  mount();
})();