// charts.js - Chart.js configuration and chart creation for Sucovi Dashboard

const CHART_COLORS = {
  accent: '#222222',
  accentLight: 'rgba(0, 0, 0, 0.08)',
  green: '#2d8a56',
  greenLight: 'rgba(45, 138, 86, 0.15)',
  blue: '#555555',
  blueLight: 'rgba(0, 0, 0, 0.06)',
  yellow: '#b8860b',
  yellowLight: 'rgba(184, 134, 11, 0.15)',
  purple: '#666666',
  purpleLight: 'rgba(0, 0, 0, 0.05)',
  text: '#888888',
  grid: 'rgba(0, 0, 0, 0.08)',
};

// Global Chart.js defaults
Chart.defaults.color = CHART_COLORS.text;
Chart.defaults.borderColor = CHART_COLORS.grid;
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function createLineChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const defaultDatasetOptions = {
    tension: 0.3,
    pointRadius: 3,
    pointHoverRadius: 6,
    borderWidth: 2,
    fill: true,
  };

  const processedDatasets = datasets.map((ds, i) => {
    const colors = [
      { border: CHART_COLORS.accent, bg: CHART_COLORS.accentLight },
      { border: CHART_COLORS.green, bg: CHART_COLORS.greenLight },
      { border: CHART_COLORS.blue, bg: CHART_COLORS.blueLight },
      { border: CHART_COLORS.yellow, bg: CHART_COLORS.yellowLight },
    ];
    const color = colors[i % colors.length];
    return {
      ...defaultDatasetOptions,
      borderColor: ds.borderColor || color.border,
      backgroundColor: ds.backgroundColor || color.bg,
      ...ds,
    };
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: processedDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: options.aspectRatio || 2,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: { usePointStyle: true, padding: 15 },
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1a1a1a',
          bodyColor: '#666666',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 45 },
          ...options.xScale,
        },
        y: {
          beginAtZero: options.beginAtZero !== false,
          grid: { color: CHART_COLORS.grid },
          ticks: {
            callback: options.yFormat || null,
          },
          ...options.yScale,
        },
      },
      ...options.chartOptions,
    },
  });

  return chartInstances[canvasId];
}

function createBarChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  const processedDatasets = datasets.map((ds, i) => {
    const colors = [
      { border: CHART_COLORS.accent, bg: CHART_COLORS.accentLight },
      { border: CHART_COLORS.green, bg: CHART_COLORS.greenLight },
    ];
    const color = colors[i % colors.length];
    return {
      borderColor: ds.borderColor || color.border,
      backgroundColor: ds.backgroundColor || color.bg,
      borderWidth: 1,
      borderRadius: 4,
      ...ds,
    };
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: processedDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: options.aspectRatio || 2,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: { usePointStyle: true, padding: 15 },
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1a1a1a',
          bodyColor: '#666666',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ...options.xScale,
        },
        y: {
          beginAtZero: true,
          grid: { color: CHART_COLORS.grid },
          ...options.yScale,
        },
      },
    },
  });

  return chartInstances[canvasId];
}

function createComparisonChart(canvasId, labels, data2025, data2026, label2025, label2026, options = {}) {
  return createLineChart(canvasId, labels, [
    {
      label: label2026 || '2026',
      data: data2026,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37, 99, 235, 0.12)',
      borderWidth: 3,
    },
    {
      label: label2025 || '2025',
      data: data2025,
      borderColor: '#dc2626',
      backgroundColor: 'rgba(220, 38, 38, 0.08)',
      borderDash: [6, 4],
      borderWidth: 2,
    },
  ], options);
}
