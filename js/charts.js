/* ============================================================
   charts.js — Executive Summary visualizations
   NOTE: All figures are SAMPLE DATA for layout/demo purposes.
   Replace the arrays below with values from the monthly
   progress import once the data pipeline (see /docs) is wired.
   ============================================================ */

(function () {
  "use strict";

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------- Chart.js plugin: direct center label on donuts ----------
     Per the improvement notes ("add direct data labels instead of
     relying only on a legend"), this draws the lead figure straight
     into the hole of the doughnut rather than only in a legend/tooltip. */
  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart) {
      const opts = chart.config.options?.plugins?.centerText;
      if (!opts || !opts.enabled) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = chartArea.left + chartArea.width / 2;
      const cy = chartArea.top + chartArea.height / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 22px Inter, -apple-system, sans-serif";
      ctx.fillStyle = getCSSVar("--text-primary") || "#16232F";
      ctx.fillText(opts.text || "", cx, cy - 9);
      ctx.font = "600 10.5px Inter, -apple-system, sans-serif";
      ctx.fillStyle = getCSSVar("--text-muted") || "#8C9AA8";
      ctx.fillText(opts.subtext || "", cx, cy + 12);
      ctx.restore();
    },
  };
  if (typeof Chart !== "undefined") Chart.register(centerTextPlugin);

  /* ---------- Donut: Physical Progress Split ---------- */
  function initProgressDonut() {
    const ctx = document.getElementById("progressDonut");
    if (!ctx || typeof Chart === "undefined") return;

    // Order matches the legend rendered underneath the chart in the markup
    // (Completed / In Progress / Not Started) so click-to-highlight below
    // can map index -> legend item directly.
    const data = {
      labels: ["Completed", "In Progress", "Not Started"],
      datasets: [
        {
          data: [61.4, 18.2, 20.4],
          backgroundColor: [getCSSVar("--color-primary"), getCSSVar("--color-warning"), getCSSVar("--color-neutral-light")],
          borderWidth: 0,
          borderRadius: 6,
          spacing: 3,
        },
      ],
    };

    new Chart(ctx, {
      type: "doughnut",
      data,
      options: {
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (c) => ` ${c.label}: ${c.parsed}%` },
          },
          centerText: { enabled: true, text: "61.4%", subtext: "PHYSICAL PROGRESS" },
        },
        animation: { animateRotate: true, duration: 900 },
        maintainAspectRatio: false,
        // Clicking a slice draws attention to the matching row in the
        // legend directly beneath the chart — a lightweight version of
        // "clicking a status filters the view below it".
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const legendItems = document.querySelectorAll(".corridor-legend .item");
          const target = legendItems[elements[0].index];
          if (!target) return;
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.style.transition = "background 300ms ease, border-radius 300ms ease";
          target.style.background = getCSSVar("--color-primary-light") || "rgba(10,69,149,0.12)";
          target.style.borderRadius = "6px";
          setTimeout(() => {
            target.style.background = "";
          }, 1400);
        },
        onHover: (evt, elements) => {
          evt.native.target.style.cursor = elements.length ? "pointer" : "default";
        },
      },
    });
  }

  /* ---------- Line: Planned vs Actual (Physical %) ---------- */
  function initPlannedVsActual() {
    const ctx = document.getElementById("plannedActualChart");
    if (!ctx || typeof Chart === "undefined") return;

    const months = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
    const planned = [38, 45, 52, 60, 68, 76];
    const actual = [35, 40, 45, 51, 57, 61.4];

    new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Planned",
            data: planned,
            borderColor: getCSSVar("--color-neutral"),
            borderDash: [5, 5],
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2,
          },
          {
            label: "Actual",
            data: actual,
            borderColor: getCSSVar("--color-primary"),
            backgroundColor: (context) => {
              const chart = context.chart;
              const { ctx, chartArea } = chart;
              if (!chartArea) return null;
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, "rgba(10, 69, 149, 0.25)");
              gradient.addColorStop(1, "rgba(10, 69, 149, 0.0)");
              return gradient;
            },
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 3,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { size: 11.5 } },
          },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%` } },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { callback: (v) => v + "%", font: { size: 11 } },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  /* ---------- Sparkline generator for KPI cards ---------- */
  function initSparklines() {
    document.querySelectorAll("[data-sparkline]").forEach((canvas) => {
      if (typeof Chart === "undefined") return;
      const raw = canvas.getAttribute("data-sparkline").split(",").map(Number);
      const color = canvas.getAttribute("data-color") || getCSSVar("--color-primary");
      new Chart(canvas, {
        type: "line",
        data: {
          labels: raw.map((_, i) => i),
          datasets: [
            {
              data: raw,
              borderColor: color,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              fill: false,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
          elements: { line: { borderJoinStyle: "round" } },
        },
      });
    });
  }

  /* ---------- Mini GIS map (Leaflet) ---------- */
  function initMiniMap() {
    const el = document.getElementById("miniMap");
    if (!el || typeof L === "undefined") return;

    // Approximate project corridor coordinates (sample placeholder area).
    const center = [23.259933, 77.412615];
    const map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView(center, 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const statusStyles = {
      completed: { color: "#0A4595", fillColor: "#0A4595" },
      progress: { color: "#B9770E", fillColor: "#B9770E" },
      pending: { color: "#8C9AA8", fillColor: "#8C9AA8" },
    };

    // Sample corridor polyline segments (placeholder geometry).
    const segments = [
      { status: "completed", coords: [[23.30, 77.36], [23.28, 77.39], [23.26, 77.41]] },
      { status: "progress", coords: [[23.26, 77.41], [23.24, 77.43], [23.22, 77.45]] },
      { status: "pending", coords: [[23.22, 77.45], [23.20, 77.47], [23.18, 77.49]] },
    ];

    segments.forEach((seg) => {
      L.polyline(seg.coords, {
        color: statusStyles[seg.status].color,
        weight: 5,
        opacity: 0.85,
        dashArray: seg.status === "progress" ? "2 8" : null,
      }).addTo(map);
    });

    const sites = [
      { name: "Intake Pump Station", status: "completed", coords: [23.30, 77.36] },
      { name: "Zone A Valve Chamber", status: "completed", coords: [23.27, 77.40] },
      { name: "Zone B Pipeline Works", status: "progress", coords: [23.24, 77.43] },
      { name: "Village Cluster 12 — House Connections", status: "pending", coords: [23.19, 77.48] },
    ];

    sites.forEach((s) => {
      L.circleMarker(s.coords, {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: statusStyles[s.status].fillColor,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(`<strong>${s.name}</strong><br><span style="text-transform:capitalize">${s.status}</span>`);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initProgressDonut();
    initPlannedVsActual();
    initSparklines();
    initMiniMap();
  });
})();