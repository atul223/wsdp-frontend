/* ============================================================
   charts.js — Home dashboard charts, EHS charts and mini GIS map
   Existing website theme/colors are reused through CSS variables.

   Updated for Home Dashboard values based on latest available
   Monthly Progress Report data:
   - May 2026 planning table actual: 8,922.5 m
   - June 2026 planned: 9,836 m
   - June 2026 actual: 5,904 m
   - June 2026 cumulative pipe laying: 29,532.50 m
   - June 2026 overall physical execution: 19%
   - Cumulative billing: 263.03 M AOA
   ============================================================ */

(function () {
  "use strict";

  function cssVar(name, fallback) {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  }

  function getCanvas(id) {
    return document.getElementById(id);
  }

  function formatNumber(value) {
    if (value === null || typeof value === "undefined") return "";
    return Number(value).toLocaleString("en-US");
  }

  function getCommonChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: false,
            font: {
              size: 11
            }
          }
        },
        tooltip: {
          enabled: true
        }
      },
      scales: {
        x: {
          grid: {
            color: "rgba(0,0,0,0.06)"
          },
          ticks: {
            font: {
              size: 11
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(0,0,0,0.06)"
          },
          ticks: {
            font: {
              size: 11
            }
          }
        }
      }
    };
  }

  function initMonthlyPipeChart() {
    var canvas = getCanvas("monthlyPipeChart");
    if (!canvas || typeof Chart === "undefined") return;

    var plannedColor = cssVar("--color-success", "#1E8449");
    var actualColor = cssVar("--color-warning", "#B9770E");

    new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Jan-26", "Feb-26", "Mar-26", "Apr-26", "May-26", "Jun-26"],
        datasets: [
          {
            label: "Planned (m)",
            data: [1100, 2050, 2900, 8050, 10280.5, 9836],
            backgroundColor: plannedColor,
            borderColor: plannedColor,
            borderWidth: 1
          },
          {
            label: "Actual (m)",
            data: [520, 1250, 4550, 8900, 8922.5, 5904],
            backgroundColor: actualColor,
            borderColor: actualColor,
            borderWidth: 1
          }
        ]
      },
      options: Object.assign(getCommonChartOptions(), {
        scales: {
          x: {
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              font: {
                size: 11
              }
            }
          },
          y: {
            beginAtZero: true,
            max: 12000,
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              stepSize: 2000,
              callback: function (value) {
                return formatNumber(value);
              },
              font: {
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: {
                size: 11
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return " " + context.dataset.label + ": " + formatNumber(context.parsed.y) + " m";
              }
            }
          }
        }
      })
    });
  }

  function initPhysicalSCurveChart() {
    var canvas = getCanvas("physicalSCurveChart");
    if (!canvas || typeof Chart === "undefined") return;

    var plannedColor = cssVar("--color-success", "#1E8449");
    var actualColor = cssVar("--color-primary", "#0A4595");

    new Chart(canvas, {
      type: "line",
      data: {
        labels: [
          "Jul-25",
          "Aug-25",
          "Sep-25",
          "Oct-25",
          "Nov-25",
          "Dec-25",
          "Jan-26",
          "Feb-26",
          "Mar-26",
          "Apr-26",
          "May-26",
          "Jun-26",
          "Jul-26",
          "Jan-27"
        ],
        datasets: [
          {
            label: "Planned %",
            data: [0, 2, 5, 9, 14, 20, 28, 36, 44, 52, 60, 68, 76, 100],
            borderColor: plannedColor,
            backgroundColor: "transparent",
            borderWidth: 2.5,
            tension: 0.28,
            pointRadius: 3
          },
          {
            label: "Actual %",
            data: [0, 0.5, 1.2, 2.4, 3.8, 5.3, 6.8, 8.6, 11.1, 14.1, 17.0, 19.0, null, null],
            borderColor: actualColor,
            backgroundColor: "rgba(10, 69, 149, 0.14)",
            borderWidth: 3,
            fill: true,
            tension: 0.28,
            pointRadius: 3,
            spanGaps: false
          }
        ]
      },
      options: Object.assign(getCommonChartOptions(), {
        scales: {
          x: {
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              maxRotation: 45,
              minRotation: 35,
              font: {
                size: 11
              }
            }
          },
          y: {
            min: 0,
            max: 100,
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              stepSize: 10,
              callback: function (value) {
                return value + "%";
              },
              font: {
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: {
                size: 11
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                if (context.parsed.y === null) return "";
                return " " + context.dataset.label + ": " + context.parsed.y + "%";
              }
            }
          }
        }
      })
    });
  }

  function initFinancialExecutionChart() {
    var canvas = getCanvas("financialExecutionChart");
    if (!canvas || typeof Chart === "undefined") return;

    var plannedColor = cssVar("--color-success", "#1E8449");
    var actualColor = cssVar("--color-primary", "#0A4595");

    new Chart(canvas, {
      type: "line",
      data: {
        labels: ["Jul-25", "Sep-25", "Nov-25", "Jan-26", "Mar-26", "May-26", "Jun-26"],
        datasets: [
          {
            label: "Planned (M AOA)",
            data: [null, null, null, null, null, null, null],
            borderColor: plannedColor,
            backgroundColor: "transparent",
            borderDash: [6, 5],
            borderWidth: 2.5,
            tension: 0.28,
            pointRadius: 3,
            spanGaps: false
          },
          {
            label: "Invoiced (M AOA)",
            data: [0, 0, 0, 0, 0, 263.03, 263.03],
            borderColor: actualColor,
            backgroundColor: "rgba(10, 69, 149, 0.14)",
            borderWidth: 3,
            fill: true,
            tension: 0.28,
            pointRadius: 3,
            spanGaps: false
          }
        ]
      },
      options: Object.assign(getCommonChartOptions(), {
        scales: {
          x: {
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              maxRotation: 35,
              minRotation: 25,
              font: {
                size: 11
              }
            }
          },
          y: {
            beginAtZero: true,
            max: 400,
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              stepSize: 50,
              callback: function (value) {
                return formatNumber(value);
              },
              font: {
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: {
                size: 11
              },
              filter: function (legendItem, chartData) {
                var dataset = chartData.datasets[legendItem.datasetIndex];
                return dataset.data.some(function (item) {
                  return item !== null && typeof item !== "undefined";
                });
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                if (context.parsed.y === null) return "";
                return " " + context.dataset.label + ": " + formatNumber(context.parsed.y) + " M AOA";
              },
              afterBody: function () {
                return "Planned financial curve pending CTCE recovery/financial plan.";
              }
            }
          }
        }
      })
    });
  }

  function initESHSComplianceChart() {
    var canvas = getCanvas("eshsComplianceChart");
    if (!canvas || typeof Chart === "undefined") return;

    var targetColor = cssVar("--color-success", "#1E8449");
    var actualColor = cssVar("--color-primary", "#0A4595");

    /*
      Latest available ESHS report found for May 2026 describes performance
      as moderate to satisfactory, but it does not provide a formal numeric
      compliance score. Therefore, the earlier scoring framework is retained
      as a dashboard-level indicator and not recalculated from unsupported data.
    */

    new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Overall ESHS", "PGAS / ESMP", "H&S Plan", "Site Mgmt", "Method Statements"],
        datasets: [
          {
            label: "Target %",
            data: [90, 90, 90, 90, 90],
            backgroundColor: targetColor,
            borderColor: targetColor,
            borderWidth: 1
          },
          {
            label: "Dashboard Score %",
            data: [78, 84, 80, 82, 77],
            backgroundColor: actualColor,
            borderColor: actualColor,
            borderWidth: 1
          }
        ]
      },
      options: Object.assign(getCommonChartOptions(), {
        scales: {
          x: {
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              maxRotation: 20,
              minRotation: 10,
              font: {
                size: 11
              }
            }
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              stepSize: 10,
              callback: function (value) {
                return value + "%";
              },
              font: {
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: {
                size: 11
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return " " + context.dataset.label + ": " + context.parsed.y + "%";
              },
              afterBody: function () {
                return "Latest ESHS report gives qualitative status, not a formal numeric score.";
              }
            }
          }
        }
      })
    });
  }

  function initEHSResourceConsumptionChart() {
    var canvas = getCanvas("ehsResourceConsumptionChart");
    if (!canvas || typeof Chart === "undefined") return;

    var aprilColor = cssVar("--color-success", "#1E8449");
    var mayColor = cssVar("--color-primary", "#0A4595");

    new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Water (m³)", "Energy (kWh)", "Diesel (L)", "Petrol (L)", "Solid Waste (kg)"],
        datasets: [
          {
            label: "Apr 2026",
            data: [1472, 2009.13, 1034, 281, 890],
            backgroundColor: aprilColor,
            borderColor: aprilColor,
            borderWidth: 1
          },
          {
            label: "May 2026",
            data: [1611, 1457.52, 906.2, 308, 1560],
            backgroundColor: mayColor,
            borderColor: mayColor,
            borderWidth: 1
          }
        ]
      },
      options: Object.assign(getCommonChartOptions(), {
        scales: {
          x: {
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              maxRotation: 25,
              minRotation: 15,
              font: {
                size: 11
              }
            }
          },
          y: {
            beginAtZero: true,
            max: 2500,
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              stepSize: 500,
              callback: function (value) {
                return formatNumber(value);
              },
              font: {
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: {
                size: 11
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return " " + context.dataset.label + ": " + formatNumber(context.parsed.y);
              }
            }
          }
        }
      })
    });
  }

  function initEHSToolboxThemeChart() {
    var canvas = getCanvas("ehsToolboxThemeChart");
    if (!canvas || typeof Chart === "undefined") return;

    var environmentalColor = cssVar("--color-success", "#1E8449");
    var safetyColor = cssVar("--color-warning", "#B9770E");
    var socialColor = cssVar("--color-primary", "#0A4595");

    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Environmental", "Health & Safety", "Social"],
        datasets: [
          {
            data: [4, 8, 14],
            backgroundColor: [environmentalColor, safetyColor, socialColor],
            borderColor: cssVar("--bg-card", "#FFFFFF"),
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 14,
              boxHeight: 14,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                var value = context.parsed;
                return " " + context.label + ": " + value + " talks";
              }
            }
          }
        }
      }
    });
  }

  function initMiniMap() {

    const mapElement =
      document.getElementById(
        "miniMap"
      );

    if (
      !mapElement ||
      typeof L === "undefined"
    ) return;

    const map =
      L.map(
        mapElement,
        {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false
        }
      );

    const satellite =
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Tiles © Esri"
        }
      );

    satellite.addTo(map);

    async function loadKmz() {

      try {

        const response =
          await fetch(
            "/assets/gis/lubango_Project.kmz"
          );

        if (!response.ok) {
          throw new Error(
            "KMZ not found"
          );
        }

        const buffer =
          await response.arrayBuffer();

        const zip =
          await JSZip.loadAsync(
            buffer
          );

        let kmlText = null;

        const files =
          Object.values(
            zip.files
          );

        for (
          const file
          of files
        ) {

          if (
            file.name
              .toLowerCase()
              .endsWith(".kml")
          ) {

            kmlText =
              await file.async(
                "text"
              );

            break;
          }
        }

        if (!kmlText) {
          throw new Error(
            "No KML found"
          );
        }

        const xml =
          new DOMParser()
            .parseFromString(
              kmlText,
              "text/xml"
            );

        const geojson =
          toGeoJSON.kml(xml);

        const layer =
          L.geoJSON(
            geojson,
            {
              style: function() {
                return {
                  opacity: 0,
                  weight: 0,
                  color: "transparent",
                  fillOpacity: 0
                };
              }
            }
          );

        layer.addTo(map);
        /* ---------------------------------------------
        Home Dashboard DMA Overlay
        --------------------------------------------- */

        const dashboardRegions = [
          {
            name: "Casa Verde",
            center: [-14.962, 13.468],
            color: "#FFF59D",
            radius: 450
          },
          {
            name: "Escola Portuguesa",
            center: [-14.948, 13.505],
            color: "#81D4FA",
            radius: 500
          },
          {
            name: "Cowboy I",
            center: [-14.954, 13.485],
            color: "#CE93D8",
            radius: 420
          },
          {
            name: "Sofrio",
            center: [-14.925, 13.512],
            color: "#FFCC80",
            radius: 500
          },
          {
            name: "João de Almeida",
            center: [-14.904, 13.520],
            color: "#A5D6A7",
            radius: 500
          },
          {
            name: "Caixote ou Socombar",
            center: [-14.940, 13.450],
            color: "#F8BBD0",
            radius: 550
          },
          {
            name: "Arimba",
            center: [-14.885, 13.552],
            color: "#EF9A9A",
            radius: 600
          }
        ];

        dashboardRegions.forEach(function(region){

          L.circle(
            region.center,
            {
              radius: region.radius,
              color: region.color,
              weight: 2,
              fillColor: region.color,
              fillOpacity: 0.28
            }
          ).addTo(map);

          L.marker(
            region.center,
            {
              interactive:false,
              icon:L.divIcon({
                className:"dma-home-label",
                html:
                  '<div class="dma-home-tag">' +
                  region.name +
                  '</div>',
                iconSize:[140,24],
                iconAnchor:[70,12]
              })
            }
          ).addTo(map);

        });

        if (
          layer.getBounds().isValid()
        ) {
          map.fitBounds(
            layer.getBounds(),
            {
              padding: [25, 25]
            }
          );
        }

      }
      catch (error) {

        console.error(
          "Home KMZ error",
          error
        );

      }
    }

    loadKmz();

    setTimeout(
      () => map.invalidateSize(),
      300
    );
}

  document.addEventListener("DOMContentLoaded", function () {
    initMonthlyPipeChart();
    initPhysicalSCurveChart();
    initFinancialExecutionChart();
    initESHSComplianceChart();

    initEHSResourceConsumptionChart();
    initEHSToolboxThemeChart();

    initMiniMap();
  });
})();