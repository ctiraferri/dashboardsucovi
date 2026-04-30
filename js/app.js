// app.js - Main application logic for Sucovi Dashboard

(function () {
  'use strict';

  // --- Config ---
  const NEXT_FERIA_DATE = null; // Set to 'YYYY-MM-DD' when known, e.g. '2026-06-15'

  const CONTENT_CALENDAR = [
    { day: -14, type: 'Reel', content: '"¿Qué es Sucovi?" - recap de la última feria (fotos/videos)' },
    { day: -12, type: 'Story', content: 'Encuesta: "¿Qué puesto te gustaría ver?"' },
    { day: -10, type: 'Carousel', content: 'Presentación de 3-4 emprendedores que van a estar' },
    { day: -8, type: 'Reel', content: 'Behind the scenes - armando la feria / preparativos' },
    { day: -7, type: 'Story', content: 'Countdown sticker + ubicación + horario' },
    { day: -5, type: 'Carousel', content: '"5 razones para venir a la feria"' },
    { day: -4, type: 'Reel', content: 'Emprendedor mostrando su producto (collab)' },
    { day: -3, type: 'Story', content: 'Recordatorio + sticker de preguntas' },
    { day: -2, type: 'Reel', content: '"Lo que te vas a encontrar" - preview visual' },
    { day: -1, type: 'Story + Post', content: 'Último aviso: horario, dirección, qué traer' },
    { day: 0, type: 'Stories en vivo', content: 'Cobertura real-time, reposts de asistentes' },
    { day: 1, type: 'Carousel', content: 'Recap: mejores momentos de la feria' },
    { day: 3, type: 'Reel', content: 'Recap video con música + texto overlay' },
  ];

  // --- State ---
  let metricsData = null;
  let postsData = null;
  let historicalData = null;

  // --- Navigation ---
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const viewId = 'view-' + btn.dataset.view;
      document.getElementById(viewId).classList.add('active');
    });
  });

  // --- Data Loading ---
  async function loadJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`Failed to load ${path}:`, e);
      return null;
    }
  }

  async function init() {
    [metricsData, postsData, historicalData] = await Promise.all([
      loadJSON('data/metrics.json'),
      loadJSON('data/posts.json'),
      loadJSON('data/historical.json'),
    ]);

    renderOverview();
    renderComparativa();
    renderPosts();
    renderPreFeria();
    renderLastUpdate();
  }

  // --- Utility ---
  function formatNumber(n) {
    if (n == null) return '--';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('es-AR');
  }

  function formatPercent(n) {
    if (n == null) return '--';
    return n.toFixed(2) + '%';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function setKPI(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setDelta(id, value, suffix = '') {
    const el = document.getElementById(id);
    if (!el || value == null) return;
    const sign = value > 0 ? '+' : '';
    el.textContent = sign + value + suffix;
    el.className = 'kpi-delta ' + (value >= 0 ? 'positive' : 'negative');
  }

  function getDailyData() {
    if (!metricsData || !metricsData.daily) return [];
    return metricsData.daily.sort((a, b) => a.date.localeCompare(b.date));
  }

  function getLast(arr, n) {
    return arr.slice(-n);
  }

  function sumField(arr, field) {
    return arr.reduce((sum, item) => sum + (item[field] || 0), 0);
  }

  // --- Overview ---
  function renderOverview() {
    const daily = getDailyData();
    if (daily.length === 0) {
      renderEmptyOverview();
      return;
    }

    const latest = daily[daily.length - 1];
    const last7 = getLast(daily, 7);
    const prev7 = daily.slice(-14, -7);

    // KPIs
    setKPI('kpi-followers', formatNumber(latest.followers_count));
    setKPI('kpi-reach', formatNumber(sumField(last7, 'reach')));
    setKPI('kpi-impressions', formatNumber(sumField(last7, 'impressions')));
    setKPI('kpi-profile-views', formatNumber(sumField(last7, 'profile_views')));

    // Engagement rate
    if (latest.followers_count && last7.length > 0) {
      const totalEngagement = last7.reduce((sum, d) => {
        return sum + (d.likes || 0) + (d.comments || 0) + (d.saves || 0);
      }, 0);
      const engRate = (totalEngagement / (latest.followers_count * last7.length)) * 100;
      setKPI('kpi-engagement', formatPercent(engRate));
    }

    // New followers (7d)
    if (last7.length >= 2) {
      const newFollowers = (last7[last7.length - 1].followers_count || 0) - (last7[0].followers_count || 0);
      setKPI('kpi-new-followers', formatNumber(newFollowers));

      if (prev7.length >= 2) {
        const prevNew = (prev7[prev7.length - 1].followers_count || 0) - (prev7[0].followers_count || 0);
        if (prevNew > 0) {
          const delta = Math.round(((newFollowers - prevNew) / prevNew) * 100);
          setDelta('kpi-new-followers-delta', delta, '%');
        }
      }
    }

    // Deltas (7d vs prev 7d)
    if (prev7.length > 0) {
      const reachNow = sumField(last7, 'reach');
      const reachPrev = sumField(prev7, 'reach');
      if (reachPrev > 0) {
        setDelta('kpi-reach-delta', Math.round(((reachNow - reachPrev) / reachPrev) * 100), '%');
      }

      const impNow = sumField(last7, 'impressions');
      const impPrev = sumField(prev7, 'impressions');
      if (impPrev > 0) {
        setDelta('kpi-impressions-delta', Math.round(((impNow - impPrev) / impPrev) * 100), '%');
      }

      const pvNow = sumField(last7, 'profile_views');
      const pvPrev = sumField(prev7, 'profile_views');
      if (pvPrev > 0) {
        setDelta('kpi-profile-views-delta', Math.round(((pvNow - pvPrev) / pvPrev) * 100), '%');
      }
    }

    // Charts
    const last30 = getLast(daily, 30);
    const labels = last30.map(d => formatDate(d.date));

    createLineChart('chart-followers', labels, [{
      label: 'Seguidores',
      data: last30.map(d => d.followers_count),
    }], { beginAtZero: false });

    createLineChart('chart-reach', labels, [{
      label: 'Alcance',
      data: last30.map(d => d.reach),
    }]);

    createLineChart('chart-impressions', labels, [{
      label: 'Impresiones',
      data: last30.map(d => d.impressions),
    }]);

    createLineChart('chart-profile-views', labels, [{
      label: 'Visitas al perfil',
      data: last30.map(d => d.profile_views),
    }]);
  }

  function renderEmptyOverview() {
    setKPI('kpi-followers', '~11.300');
    setKPI('kpi-reach', '--');
    setKPI('kpi-impressions', '--');
    setKPI('kpi-engagement', '--');
    setKPI('kpi-profile-views', '--');
    setKPI('kpi-new-followers', '--');

    // Render empty charts with placeholder message
    ['chart-followers', 'chart-reach', 'chart-impressions', 'chart-profile-views'].forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const parent = canvas.parentElement;
        if (!parent.querySelector('.no-data')) {
          const msg = document.createElement('div');
          msg.className = 'no-data';
          msg.textContent = 'Conectá la API de Instagram para ver datos en tiempo real';
          parent.appendChild(msg);
        }
      }
    });
  }

  // --- Comparativa 2025 vs 2026 ---
  function renderComparativa() {
    if (!historicalData) return;

    const months = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const data2025 = historicalData.monthly || [];

    // Extract 2025 data
    const followers2025 = data2025.map(m => m.followers);
    const reach2025 = data2025.map(m => m.reach);
    const engagement2025 = data2025.map(m => m.engagement_rate);

    // Build 2026 data from daily metrics (aggregate by month)
    const daily = getDailyData();
    const monthlyAgg2026 = {};

    daily.forEach(d => {
      const month = d.date.substring(0, 7); // YYYY-MM
      if (!month.startsWith('2026')) return;
      if (!monthlyAgg2026[month]) {
        monthlyAgg2026[month] = { followers: 0, reach: 0, engagement: 0, count: 0 };
      }
      monthlyAgg2026[month].followers = d.followers_count || monthlyAgg2026[month].followers;
      monthlyAgg2026[month].reach += d.reach || 0;
      monthlyAgg2026[month].count++;
    });

    const monthKeys2026 = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
    const followers2026 = monthKeys2026.map(m => monthlyAgg2026[m]?.followers || null);
    const reach2026 = monthKeys2026.map(m => monthlyAgg2026[m]?.reach || null);
    const engagement2026 = monthKeys2026.map(m => {
      const agg = monthlyAgg2026[m];
      return agg && agg.count > 0 ? agg.engagement / agg.count : null;
    });

    createComparisonChart('chart-compare-followers', months, followers2025, followers2026, '2025', '2026', { beginAtZero: false });
    createComparisonChart('chart-compare-reach', months, reach2025, reach2026, '2025', '2026');
    createComparisonChart('chart-compare-engagement', months, engagement2025, engagement2026, '2025', '2026', {
      yFormat: v => v + '%',
    });

    // Ferias comparison table
    renderFeriasTable();
  }

  function renderFeriasTable() {
    const tbody = document.getElementById('compare-table-body');
    if (!tbody || !historicalData) return;

    const ferias = historicalData.ferias || [];
    tbody.innerHTML = ferias.map(f => `
      <tr>
        <td>${f.name || '--'}</td>
        <td>${formatDate(f.date)}</td>
        <td>${formatNumber(f.followers_at_event)}</td>
        <td>${formatNumber(f.reach_week_before)}</td>
        <td>${f.engagement_rate != null ? formatPercent(f.engagement_rate) : '--'}</td>
        <td>${formatNumber(f.new_followers_week)}</td>
      </tr>
    `).join('');

    if (ferias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="no-data">Completá historical.json con datos de ferias 2025</td></tr>';
    }
  }

  // --- Posts ---
  function renderPosts() {
    const tbody = document.getElementById('posts-table-body');
    if (!tbody) return;

    if (!postsData || !postsData.posts || postsData.posts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="no-data">Conectá la API para ver performance de posts</td></tr>';
      setupPostFilters([]);
      return;
    }

    const posts = postsData.posts;
    setupPostFilters(posts);
    renderPostsTable(posts);
  }

  function renderPostsTable(posts) {
    const tbody = document.getElementById('posts-table-body');
    if (!tbody) return;

    const typeFilter = document.getElementById('filter-type').value;
    const sortBy = document.getElementById('filter-sort').value;

    let filtered = posts;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(p => p.media_type === typeFilter);
    }

    const sortFns = {
      date: (a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''),
      reach: (a, b) => (b.reach || 0) - (a.reach || 0),
      engagement: (a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0),
      saves: (a, b) => (b.saved || 0) - (a.saved || 0),
    };
    filtered.sort(sortFns[sortBy] || sortFns.date);

    tbody.innerHTML = filtered.map(p => {
      const badgeClass = p.media_type === 'IMAGE' ? 'badge-image' :
                         p.media_type === 'VIDEO' ? 'badge-video' : 'badge-carousel';
      const typeLabel = p.media_type === 'IMAGE' ? 'Imagen' :
                        p.media_type === 'VIDEO' ? 'Reel' : 'Carousel';
      const caption = (p.caption || '').substring(0, 60);

      return `
        <tr>
          <td>${formatDate(p.timestamp?.substring(0, 10))}</td>
          <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
          <td class="caption-cell" title="${(p.caption || '').replace(/"/g, '&quot;')}">${caption}</td>
          <td>${formatNumber(p.reach)}</td>
          <td>${formatNumber(p.impressions)}</td>
          <td>${formatNumber(p.like_count)}</td>
          <td>${formatNumber(p.comments_count)}</td>
          <td>${formatNumber(p.saved)}</td>
          <td>${p.engagement_rate != null ? formatPercent(p.engagement_rate) : '--'}</td>
        </tr>
      `;
    }).join('');
  }

  function setupPostFilters(posts) {
    const typeFilter = document.getElementById('filter-type');
    const sortFilter = document.getElementById('filter-sort');
    if (!typeFilter || !sortFilter) return;

    const handler = () => renderPostsTable(posts);
    typeFilter.addEventListener('change', handler);
    sortFilter.addEventListener('change', handler);
  }

  // --- Pre-Feria ---
  function renderPreFeria() {
    renderCountdown();
    renderPreFeriaKPIs();
    renderPreFeriaChart();
    renderContentCalendar();
  }

  function renderCountdown() {
    const el = document.getElementById('countdown');
    const container = document.getElementById('countdown-container');
    if (!el || !container) return;

    if (!NEXT_FERIA_DATE) {
      el.textContent = 'Fecha por definir';
      return;
    }

    const now = new Date();
    const feria = new Date(NEXT_FERIA_DATE + 'T00:00:00');
    const diff = feria - now;

    if (diff <= 0) {
      el.textContent = 'Hoy es la feria!';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    el.textContent = `${days} días, ${hours} horas`;
  }

  function renderPreFeriaKPIs() {
    const daily = getDailyData();
    const last14 = getLast(daily, 14);

    if (last14.length === 0) {
      setKPI('preferia-reach', '--');
      setKPI('preferia-new-followers', '--');
      setKPI('preferia-engagement', '--');
      setKPI('preferia-posts', '--');
      return;
    }

    setKPI('preferia-reach', formatNumber(sumField(last14, 'reach')));

    if (last14.length >= 2) {
      const newF = (last14[last14.length - 1].followers_count || 0) - (last14[0].followers_count || 0);
      setKPI('preferia-new-followers', formatNumber(newF));
    }

    // Average engagement
    const engagements = last14.filter(d => d.engagement_rate != null).map(d => d.engagement_rate);
    if (engagements.length > 0) {
      const avg = engagements.reduce((a, b) => a + b, 0) / engagements.length;
      setKPI('preferia-engagement', formatPercent(avg));
    }

    // Posts count from postsData in last 14 days
    if (postsData && postsData.posts) {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const recentPosts = postsData.posts.filter(p => {
        if (!p.timestamp) return false;
        return new Date(p.timestamp) >= twoWeeksAgo;
      });
      setKPI('preferia-posts', recentPosts.length);
    }
  }

  function renderPreFeriaChart() {
    const daily = getDailyData();
    const last14 = getLast(daily, 14);

    if (last14.length === 0) return;

    createLineChart('chart-preferia-reach', last14.map(d => formatDate(d.date)), [{
      label: 'Alcance',
      data: last14.map(d => d.reach),
    }], { aspectRatio: 3 });
  }

  function renderContentCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    grid.innerHTML = CONTENT_CALENDAR.map(item => {
      const dayLabel = item.day === 0 ? 'Día de la feria' :
                       item.day > 0 ? `+${item.day} día${item.day > 1 ? 's' : ''}` :
                       `${item.day} día${item.day < -1 ? 's' : ''}`;
      return `
        <div class="calendar-item">
          <div class="day-label">${dayLabel}</div>
          <div class="type-label">${item.type}</div>
          <div class="content-desc">${item.content}</div>
        </div>
      `;
    }).join('');
  }

  // --- Last Update ---
  function renderLastUpdate() {
    const el = document.getElementById('last-update');
    if (!el) return;

    if (metricsData && metricsData.last_updated) {
      const d = new Date(metricsData.last_updated);
      el.textContent = d.toLocaleString('es-AR');
    } else {
      el.textContent = 'Sin datos aún - conectá la API';
    }
  }

  // --- Init ---
  init();
})();
