// charts.js - Chart.js configuration and chart creation for Sucovi Dashboard

const CHART_COLORS = {
  accent: '#94A3B8',
  accentLight: 'rgba(148, 163, 184, 0.14)',
  green: '#94A3B8',
  greenLight: 'rgba(148, 163, 184, 0.10)',
  blue: '#E2E5EC',
  blueLight: 'rgba(226, 229, 236, 0.06)',
  yellow: '#F87171',
  yellowLight: 'rgba(248, 113, 113, 0.10)',
  purple: 'rgba(226, 229, 236, 0.4)',
  purpleLight: 'rgba(226, 229, 236, 0.04)',
  text: 'rgba(226, 229, 236, 0.62)',
  grid: 'rgba(226, 229, 236, 0.08)',
};

// Global Chart.js defaults
Chart.defaults.color = CHART_COLORS.text;
Chart.defaults.borderColor = CHART_COLORS.grid;
Chart.defaults.font.family = "'Instrument Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;

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
          backgroundColor: 'rgba(22, 26, 34, 0.96)',
          titleColor: '#E2E5EC',
          titleFont: { family: "'JetBrains Mono', ui-monospace, monospace", size: 10, weight: '500' },
          bodyColor: 'rgba(226, 229, 236, 0.85)',
          bodyFont: { family: "'JetBrains Mono', ui-monospace, monospace", size: 11 },
          borderColor: 'rgba(226, 229, 236, 0.24)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 2,
          displayColors: false,
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
          backgroundColor: 'rgba(22, 26, 34, 0.96)',
          titleColor: '#E2E5EC',
          titleFont: { family: "'JetBrains Mono', ui-monospace, monospace", size: 10, weight: '500' },
          bodyColor: 'rgba(226, 229, 236, 0.85)',
          bodyFont: { family: "'JetBrains Mono', ui-monospace, monospace", size: 11 },
          borderColor: 'rgba(226, 229, 236, 0.24)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 2,
          displayColors: false,
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
      borderColor: '#94A3B8',
      backgroundColor: 'rgba(148, 163, 184, 0.16)',
      borderWidth: 2,
    },
    {
      label: label2025 || '2025',
      data: data2025,
      borderColor: 'rgba(226, 229, 236, 0.5)',
      backgroundColor: 'rgba(226, 229, 236, 0.04)',
      borderDash: [4, 4],
      borderWidth: 1.25,
      pointRadius: 2,
    },
  ], options);
}
