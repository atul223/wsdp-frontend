/* ============================================================
   charts.js — Home dashboard charts, EHS charts and mini GIS map
   Existing website theme/colors are reused through CSS variables.
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
            data: [1100, 2050, 2900, 8050, 10250, 9800],
            backgroundColor: plannedColor,
            borderColor: plannedColor,
            borderWidth: 1
          },
          {
            label: "Actual (m)",
            data: [520, 1250, 4550, 8900, 8200, 0],
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
            borderDash: [6, 5],
            borderWidth: 2.5,
            tension: 0.28,
            pointRadius: 3
          },
          {
            label: "Actual %",
            data: [0, 0.5, 1.2, 2.4, 3.8, 5.3, 6.8, 8.6, 11.1, 14.1, 17.0, null, null, null],
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
        labels: ["Jul-25", "Sep-25", "Nov-25", "Jan-26", "Feb-26", "Apr-26", "Jun-26 (Plan)"],
        datasets: [
          {
            label: "Planned (M AOA)",
            data: [0, 180, 540, 900, 1100, 1450, 1750],
            borderColor: plannedColor,
            backgroundColor: "transparent",
            borderDash: [6, 5],
            borderWidth: 2.5,
            tension: 0.28,
            pointRadius: 3
          },
          {
            label: "Invoiced (M AOA)",
            data: [0, 0, 0, 0, 410, 650.99, null],
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
            max: 1800,
            grid: {
              color: "rgba(0,0,0,0.06)"
            },
            ticks: {
              stepSize: 200,
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
                return " " + context.dataset.label + ": " + formatNumber(context.parsed.y) + " M AOA";
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
            label: "Actual %",
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
    var mapElement = document.getElementById("miniMap");

    if (!mapElement || typeof L === "undefined") return;

    var map = L.map(mapElement, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false
    }).setView([-14.9177, 13.4925], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    var successColor = cssVar("--color-success", "#1E8449");
    var warningColor = cssVar("--color-warning", "#B9770E");
    var criticalColor = cssVar("--color-critical", "#C0392B");
    var mobilisingColor = "#F58232";

    var areas = [
      {
        name: "Mapunda",
        status: "Not Started",
        color: criticalColor,
        coords: [-14.8968, 13.4558]
      },
      {
        name: "Nambambe",
        status: "Not Started",
        color: criticalColor,
        coords: [-14.8725, 13.5356]
      },
      {
        name: "Bula Matadi",
        status: "Not Started",
        color: criticalColor,
        coords: [-14.9055, 13.5127]
      },
      {
        name: "Lubango Central",
        status: "In Progress",
        color: warningColor,
        coords: [-14.9177, 13.4925]
      },
      {
        name: "Comandante",
        status: "In Progress",
        color: warningColor,
        coords: [-14.9349, 13.4789]
      },
      {
        name: "Ferrovia",
        status: "Mobilising",
        color: mobilisingColor,
        coords: [-14.9484, 13.5098]
      },
      {
        name: "Casa Verde / Escola Portuguesa",
        status: "Complete",
        color: successColor,
        coords: [-14.9621, 13.4585]
      }
    ];

    var route = [
      [-14.8968, 13.4558],
      [-14.9177, 13.4925],
      [-14.9055, 13.5127],
      [-14.8725, 13.5356]
    ];

    L.polyline(route, {
      color: cssVar("--color-primary", "#0A4595"),
      weight: 4,
      opacity: 0.7,
      dashArray: "7 7"
    }).addTo(map);

    areas.forEach(function (area) {
      L.circleMarker(area.coords, {
        radius: 12,
        color: "#ffffff",
        weight: 2,
        fillColor: area.color,
        fillOpacity: 0.85
      })
        .addTo(map)
        .bindPopup(
          "<strong>" + area.name + "</strong><br>" +
          "Status: " + area.status
        );
    });

    var bounds = L.latLngBounds(
      areas.map(function (area) {
        return area.coords;
      })
    );

    map.fitBounds(bounds.pad(0.25));

    setTimeout(function () {
      map.invalidateSize();
    }, 300);
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