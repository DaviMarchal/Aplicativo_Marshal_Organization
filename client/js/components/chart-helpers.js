// Wrappers finos sobre Chart.js (global `Chart`, vem de /vendor/chart.js) já
// no tema do app: grid discreto, tooltip flutuante, glow na linha/barra ativa.

const GRID_COLOR = "rgba(255,255,255,0.06)";
const TEXT_COLOR = "#A1A1AA";

Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.color = TEXT_COLOR;

// plugin simples que aplica glow (shadow) na linha desenhada
const glowLinePlugin = {
  id: "glowLine",
  beforeDatasetsDraw(chart, args, opts) {
    chart.ctx.save();
    chart.ctx.shadowColor = opts.color || "rgba(255,122,0,.55)";
    chart.ctx.shadowBlur = opts.blur ?? 14;
  },
  afterDatasetsDraw(chart) {
    chart.ctx.restore();
  },
};

export function lineChartGlow(canvas, { labels, data, color = "#FF7A00", label = "" }) {
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
  gradient.addColorStop(0, hexToRgba(color, 0.35));
  gradient.addColorStop(1, hexToRgba(color, 0));

  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: "#fff",
        },
      ],
    },
    plugins: [glowLinePlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900, easing: "easeOutCubic" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        glowLine: { color: hexToRgba(color, 0.55), blur: 14 },
        tooltip: {
          backgroundColor: "#16161A",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          padding: 10,
          titleColor: "#F5F5F7",
          bodyColor: "#F5F5F7",
          cornerRadius: 10,
          displayColors: false,
        },
      },
      scales: {
        x: { grid: { color: "transparent" }, ticks: { color: TEXT_COLOR } },
        y: { grid: { color: GRID_COLOR }, ticks: { color: TEXT_COLOR } },
      },
    },
  });
}

export function barChartWeek(canvas, { labels, data, activeIndex }) {
  const ctx = canvas.getContext("2d");
  const colors = data.map((_, i) => (i === activeIndex ? "#FF7A00" : "rgba(255,255,255,0.14)"));
  return new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutCubic" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#16161A",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: (item) => `R$ ${Number(item.raw).toFixed(2)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: TEXT_COLOR } },
        y: { display: false },
      },
    },
  });
}

export function donutChart(canvas, { labels, data, colors }) {
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      animation: { duration: 800, easing: "easeOutCubic" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#16161A",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: (item) => `${item.label}: R$ ${Number(item.raw).toFixed(2)}`,
          },
        },
      },
    },
  });
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export { hexToRgba };
