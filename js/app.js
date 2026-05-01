// app.js - Main application logic for Sucovi Dashboard

(function () {
  'use strict';

  // --- Config ---
  const NEXT_FERIA_DATE = '2026-05-10';
  const TOKEN_REFRESH_DATE = '2026-05-01'; // Fecha en que se generó/renovó el IG token
  const TOKEN_WARN_DAYS = 50; // Avisar cuando falten 10 días para vencer (60 días de vida)

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

  // --- Motion: Lenis smooth-scroll + GSAP counters + ScrollTrigger progress ---
  // No view-switch / fade-up reveals — those felt frame-y. Each library has
  // exactly one job here, so the motion is intentional and not jank-prone:
  //   • Lenis        → smooth wheel scrolling
  //   • GSAP         → KPI count-up animation on initial render
  //   • ScrollTrigger → top progress bar (scrubbed against scroll position)
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionEnabled = !prefersReducedMotion;

  if (motionEnabled && window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  if (motionEnabled && window.Lenis) {
    const lenis = new Lenis({
      duration: 1.0,
      easing: (t) => 1 - Math.pow(1 - t, 3), // power3.out
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
    });

    if (window.gsap && window.ScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      function rafLoop(time) { lenis.raf(time); requestAnimationFrame(rafLoop); }
      requestAnimationFrame(rafLoop);
    }
  }

  // Top scroll-progress bar driven by ScrollTrigger.scrub
  if (motionEnabled && window.gsap && window.ScrollTrigger) {
    gsap.to('#scroll-progress', {
      width: '100%',
      ease: 'none',
      scrollTrigger: {
        trigger: document.documentElement,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.3,
      },
    });
  }

  // Animate a numeric KPI value from 0 → target, formatting on every tick
  // so K/M/% suffixes appear correctly throughout. Falls back to instant set
  // if GSAP is unavailable or the user prefers reduced motion.
  function animateKPI(id, value, formatter) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value == null || isNaN(value)) {
      el.textContent = '--';
      return;
    }
    const fmt = formatter || formatNumber;
    if (!motionEnabled || !window.gsap) {
      el.textContent = fmt(value);
      return;
    }
    const obj = { v: 0 };
    gsap.to(obj, {
      v: value,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = fmt(obj.v); },
      onComplete: () => { el.textContent = fmt(value); },
    });
  }

  // --- View activation ----------------------------------------------------
  // Charts that live inside non-active views can't be created during init():
  // the canvas's parent is `display:none`, so Chart.js measures it as 0×0
  // and the chart never animates in correctly. We defer rendering each
  // non-overview view's content until the first time it's activated.
  const renderedViews = new Set(['overview', 'posts']);

  function ensureViewRendered(viewKey) {
    if (renderedViews.has(viewKey)) return;
    renderedViews.add(viewKey);
    if (viewKey === 'comparativa') {
      renderComparativa();
    } else if (viewKey === 'preferia') {
      renderCountdown();
      renderPreFeriaKPIs();
      renderPreFeriaChart();
      renderContentCalendar();
    }
  }

  // --- Navigation ---
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const viewId = 'view-' + btn.dataset.view;
      const view = document.getElementById(viewId);
      view.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'auto' });
      // Render the view's contents the first time it becomes visible — this
      // guarantees the canvas has real dimensions before Chart.js measures.
      ensureViewRendered(btn.dataset.view);
      // ScrollTrigger needs to recompute when content visibility changes
      if (window.ScrollTrigger) ScrollTrigger.refresh();
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

  // Tiny CSV parser — handles quoted fields. Enough for the spend list.
  function parseCSVLine(line) {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(line => {
      const fields = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => obj[h] = fields[i]);
      return obj;
    });
  }

  // Pulls the IG shortcode out of any /reel/, /reels/, or /p/ URL form
  function shortcodeFromUrl(url) {
    if (!url) return null;
    const m = url.match(/\/(?:reel|reels|p)\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  async function loadPromotedSpend() {
    try {
      const res = await fetch('data/anuncios_estadisticas.csv');
      if (!res.ok) return null;
      const text = await res.text();
      const rows = parseCSV(text);
      const map = {};
      rows.forEach(r => {
        const code = shortcodeFromUrl(r.url_posteo);
        const spend = parseFloat(r.total_gasto_ars);
        if (code && !isNaN(spend)) map[code] = spend;
      });
      return map;
    } catch (e) {
      console.warn('Failed to load promoted spend CSV:', e);
      return null;
    }
  }

  async function init() {
    let promotedSpend;
    [metricsData, postsData, historicalData, promotedSpend] = await Promise.all([
      loadJSON('data/metrics.json'),
      loadJSON('data/posts.json'),
      loadJSON('data/historical.json'),
      loadPromotedSpend(),
    ]);

    // Annotate posts with their ad spend (matched by shortcode in permalink)
    if (promotedSpend && postsData && postsData.posts) {
      postsData.posts.forEach(p => {
        const code = shortcodeFromUrl(p.permalink);
        if (code && promotedSpend[code] != null) {
          p._spend = promotedSpend[code];
        }
      });
    }

    renderOverview();
    renderPosts();
    renderLastUpdate();
    checkTokenExpiry();
    // Comparativa and Pre-Feria render lazily on first view activation
    // (see ensureViewRendered) so their canvases get real dimensions.

    // Re-measure for the scroll-progress ScrollTrigger now that data fills layout
    if (window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh());
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

  function formatARS(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString('es-AR');
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

  function showNoData(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.style.display = 'none';
    const parent = canvas.parentElement;
    if (!parent.querySelector('.no-data')) {
      const msg = document.createElement('div');
      msg.className = 'no-data';
      msg.textContent = message;
      parent.appendChild(msg);
    }
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

    // KPIs (count up from 0 via GSAP)
    animateKPI('kpi-followers', latest.followers_count, formatNumber);
    animateKPI('kpi-reach', sumField(last7, 'reach'), formatNumber);
    animateKPI('kpi-profile-views', sumField(last7, 'profile_views'), formatNumber);

    // Accounts engaged: use daily data if available, else estimate from posts
    const totalEngaged7 = sumField(last7, 'accounts_engaged');
    if (totalEngaged7 > 0) {
      animateKPI('kpi-engaged', totalEngaged7, formatNumber);
    } else if (postsData && postsData.posts) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentPosts = postsData.posts.filter(p =>
        p.timestamp && new Date(p.timestamp) >= sevenDaysAgo
      );
      const engaged = recentPosts.reduce((sum, p) =>
        sum + (p.like_count || 0) + (p.comments_count || 0) + (p.saved || 0) + (p.shares || 0), 0);
      animateKPI('kpi-engaged', engaged, formatNumber);
    }

    // Engagement rate: just the number — the "%" lives above the value (kpi-unit)
    const fmt2 = (n) => n.toFixed(2);
    if (latest.followers_count && postsData && postsData.posts && postsData.posts.length > 0) {
      const avgEngRate = postsData.posts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / postsData.posts.length;
      animateKPI('kpi-engagement', avgEngRate, fmt2);
    } else if (latest.followers_count && totalEngaged7 > 0) {
      const avgEngaged = totalEngaged7 / last7.length;
      const engRate = (avgEngaged / latest.followers_count) * 100;
      animateKPI('kpi-engagement', engRate, fmt2);
    }

    // New followers (7d)
    if (last7.length >= 2) {
      const newFollowers = (last7[last7.length - 1].followers_count || 0) - (last7[0].followers_count || 0);
      animateKPI('kpi-new-followers', newFollowers, formatNumber);

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

      const engNow = sumField(last7, 'accounts_engaged');
      const engPrev = sumField(prev7, 'accounts_engaged');
      if (engPrev > 0) {
        setDelta('kpi-engaged-delta', Math.round(((engNow - engPrev) / engPrev) * 100), '%');
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

    // Only render engaged/profile-views charts if there's meaningful data
    const hasEngagedData = last30.some(d => d.accounts_engaged > 0);
    if (hasEngagedData) {
      createLineChart('chart-engaged', labels, [{
        label: 'Cuentas activas',
        data: last30.map(d => d.accounts_engaged),
      }]);
    } else {
      showNoData('chart-engaged', 'Datos disponibles solo para el día actual (limitación de la API)');
    }

    const hasProfileData = last30.some(d => d.profile_views > 0);
    if (hasProfileData) {
      createLineChart('chart-profile-views', labels, [{
        label: 'Visitas al perfil',
        data: last30.map(d => d.profile_views),
      }]);
    } else {
      showNoData('chart-profile-views', 'Datos disponibles solo para el día actual (limitación de la API)');
    }
  }

  function renderEmptyOverview() {
    setKPI('kpi-followers', '~11.300');
    setKPI('kpi-reach', '--');
    setKPI('kpi-engaged', '--');
    setKPI('kpi-engagement', '--');
    setKPI('kpi-profile-views', '--');
    setKPI('kpi-new-followers', '--');

    // Render empty charts with placeholder message
    ['chart-followers', 'chart-reach', 'chart-engaged', 'chart-profile-views'].forEach(id => {
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
  function aggregatePostsByMonth(year) {
    if (!postsData || !postsData.posts) return {};
    const agg = {};
    postsData.posts.forEach(p => {
      if (!p.timestamp) return;
      const month = p.timestamp.substring(0, 7); // YYYY-MM
      if (!month.startsWith(String(year))) return;
      if (!agg[month]) {
        agg[month] = { reach: 0, engagement: 0, count: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
      }
      agg[month].reach += p.reach || 0;
      agg[month].engagement += p.engagement_rate || 0;
      agg[month].likes += p.like_count || 0;
      agg[month].comments += p.comments_count || 0;
      agg[month].saves += p.saved || 0;
      agg[month].shares += p.shares || 0;
      agg[month].count++;
    });
    return agg;
  }

  function renderComparativa() {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthKeys = (year) => Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`
    );

    // Build data from posts for both years
    const agg2025 = aggregatePostsByMonth(2025);
    const agg2026 = aggregatePostsByMonth(2026);

    const keys2025 = monthKeys(2025);
    const keys2026 = monthKeys(2026);

    const reach2025 = keys2025.map(m => agg2025[m]?.reach || null);
    const reach2026 = keys2026.map(m => agg2026[m]?.reach || null);

    const engagement2025 = keys2025.map(m =>
      agg2025[m] && agg2025[m].count > 0 ? Math.round((agg2025[m].engagement / agg2025[m].count) * 100) / 100 : null
    );
    const engagement2026 = keys2026.map(m =>
      agg2026[m] && agg2026[m].count > 0 ? Math.round((agg2026[m].engagement / agg2026[m].count) * 100) / 100 : null
    );

    const posts2025 = keys2025.map(m => agg2025[m]?.count || null);
    const posts2026 = keys2026.map(m => agg2026[m]?.count || null);

    // Render comparison charts (aspectRatio: 4 → half the default height)
    createComparisonChart('chart-compare-reach', months, reach2025, reach2026, '2025', '2026', {
      aspectRatio: 4,
    });
    createComparisonChart('chart-compare-engagement', months, engagement2025, engagement2026, '2025', '2026', {
      aspectRatio: 4,
      yFormat: v => v + '%',
    });
    createComparisonChart('chart-compare-posts', months, posts2025, posts2026, '2025', '2026', {
      aspectRatio: 4,
    });

  }

  // --- Posts ---
  let postsSortCol = 'date';
  let postsSortAsc = false; // default descending (newest first)
  let allPosts = [];

  function renderPosts() {
    const tbody = document.getElementById('posts-table-body');
    if (!tbody) return;

    if (!postsData || !postsData.posts || postsData.posts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="no-data">Cargando datos de posts...</td></tr>';
      return;
    }

    allPosts = postsData.posts;
    setupPostFilters();
    renderPostsTable();
  }

  function getFilteredPosts() {
    let filtered = allPosts.slice();

    // Type filter
    const typeFilter = document.getElementById('filter-type');
    if (typeFilter && typeFilter.value !== 'all') {
      filtered = filtered.filter(p => p.media_type === typeFilter.value);
    }

    // Date range filter
    const fromEl = document.getElementById('filter-date-from');
    const toEl = document.getElementById('filter-date-to');
    if (fromEl && fromEl.value) {
      const from = new Date(fromEl.value + 'T00:00:00');
      filtered = filtered.filter(p => p.timestamp && new Date(p.timestamp) >= from);
    }
    if (toEl && toEl.value) {
      const to = new Date(toEl.value + 'T23:59:59');
      filtered = filtered.filter(p => p.timestamp && new Date(p.timestamp) <= to);
    }

    return filtered;
  }

  function sortPosts(posts) {
    const dir = postsSortAsc ? 1 : -1;
    const sortFns = {
      date: (a, b) => dir * (a.timestamp || '').localeCompare(b.timestamp || ''),
      reach: (a, b) => dir * ((a.reach || 0) - (b.reach || 0)),
      likes: (a, b) => dir * ((a.like_count || 0) - (b.like_count || 0)),
      comments: (a, b) => dir * ((a.comments_count || 0) - (b.comments_count || 0)),
      saves: (a, b) => dir * ((a.saved || 0) - (b.saved || 0)),
      shares: (a, b) => dir * ((a.shares || 0) - (b.shares || 0)),
      engagement: (a, b) => dir * ((a.engagement_rate || 0) - (b.engagement_rate || 0)),
      spend: (a, b) => dir * ((a._spend || 0) - (b._spend || 0)),
    };
    posts.sort(sortFns[postsSortCol] || sortFns.date);
    return posts;
  }

  function updateSortArrows() {
    document.querySelectorAll('#posts-table th.sortable').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (!arrow) return;
      if (th.dataset.sort === postsSortCol) {
        arrow.textContent = postsSortAsc ? '\u25B2' : '\u25BC';
      } else {
        arrow.textContent = '';
      }
    });
  }

  function renderPostsTable() {
    const tbody = document.getElementById('posts-table-body');
    if (!tbody) return;

    let filtered = getFilteredPosts();
    filtered = sortPosts(filtered);
    updateSortArrows();

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="no-data">No hay posts en este rango</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const badgeClass = p.media_type === 'IMAGE' ? 'badge-image' :
                         p.media_type === 'VIDEO' ? 'badge-video' : 'badge-carousel';
      const typeLabel = p.media_type === 'IMAGE' ? 'Imagen' :
                        p.media_type === 'VIDEO' ? 'Reel' : 'Carousel';
      const caption = (p.caption || '').substring(0, 60);

      const dateText = formatDate(p.timestamp?.substring(0, 10));
      const dateCell = p.permalink
        ? `<a class="post-link" href="${p.permalink}" target="_blank" rel="noopener noreferrer" title="Ver post en Instagram">${dateText}</a>`
        : dateText;

      const spendCell = p._spend != null
        ? `<span class="spend">${formatARS(p._spend)}</span>`
        : '<span class="spend-empty">—</span>';

      return `
        <tr${p._spend != null ? ' class="row-paid"' : ''}>
          <td>${dateCell}</td>
          <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
          <td class="caption-cell" title="${(p.caption || '').replace(/"/g, '&quot;')}">${caption}</td>
          <td>${formatNumber(p.reach)}</td>
          <td>${formatNumber(p.like_count)}</td>
          <td>${formatNumber(p.comments_count)}</td>
          <td>${formatNumber(p.saved)}</td>
          <td>${formatNumber(p.shares)}</td>
          <td>${p.engagement_rate != null ? formatPercent(p.engagement_rate) : '--'}</td>
          <td>${spendCell}</td>
        </tr>
      `;
    }).join('');
  }

  function setupPostFilters() {
    const typeFilter = document.getElementById('filter-type');
    const fromEl = document.getElementById('filter-date-from');
    const toEl = document.getElementById('filter-date-to');
    const clearBtn = document.getElementById('filter-date-clear');

    if (typeFilter) typeFilter.addEventListener('change', renderPostsTable);
    if (fromEl) fromEl.addEventListener('change', renderPostsTable);
    if (toEl) toEl.addEventListener('change', renderPostsTable);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
        renderPostsTable();
      });
    }

    // Column header sorting
    document.querySelectorAll('#posts-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (postsSortCol === col) {
          postsSortAsc = !postsSortAsc;
        } else {
          postsSortCol = col;
          postsSortAsc = false;
        }
        renderPostsTable();
      });
    });
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

    animateKPI('preferia-reach', sumField(last14, 'reach'), formatNumber);

    if (last14.length >= 2) {
      const newF = (last14[last14.length - 1].followers_count || 0) - (last14[0].followers_count || 0);
      animateKPI('preferia-new-followers', newF, formatNumber);
    }

    // Average engagement from posts in last 14 days (number only — % lives above)
    if (postsData && postsData.posts) {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const recentPosts = postsData.posts.filter(p =>
        p.timestamp && new Date(p.timestamp) >= twoWeeksAgo && p.engagement_rate != null
      );
      if (recentPosts.length > 0) {
        const avg = recentPosts.reduce((sum, p) => sum + p.engagement_rate, 0) / recentPosts.length;
        animateKPI('preferia-engagement', avg, (n) => n.toFixed(2));
      }
    }

    // Posts count in last 14 days
    if (postsData && postsData.posts) {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const recentPosts = postsData.posts.filter(p => {
        if (!p.timestamp) return false;
        return new Date(p.timestamp) >= twoWeeksAgo;
      });
      animateKPI('preferia-posts', recentPosts.length, formatNumber);
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

  // --- Token Expiry Check ---
  function checkTokenExpiry() {
    if (!TOKEN_REFRESH_DATE) return;

    const refreshed = new Date(TOKEN_REFRESH_DATE + 'T00:00:00');
    const now = new Date();
    const daysSinceRefresh = Math.floor((now - refreshed) / (1000 * 60 * 60 * 24));
    const daysLeft = 60 - daysSinceRefresh;

    if (daysSinceRefresh < TOKEN_WARN_DAYS) return;

    const alertEl = document.getElementById('token-alert');
    const textEl = document.getElementById('token-alert-text');
    const closeBtn = document.getElementById('token-alert-close');
    if (!alertEl || !textEl) return;

    if (daysLeft <= 0) {
      textEl.textContent = 'El token de Instagram venció. Renovalo y actualizá TOKEN_REFRESH_DATE en app.js y el secret IG_ACCESS_TOKEN en GitHub.';
      alertEl.classList.add('urgent');
    } else {
      textEl.textContent = `El token de Instagram vence en ${daysLeft} días (renovado el ${formatDate(TOKEN_REFRESH_DATE)}). Renovalo desde Meta y actualizá el secret IG_ACCESS_TOKEN en GitHub.`;
    }

    alertEl.style.display = 'flex';

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        alertEl.style.display = 'none';
      });
    }
  }

  // --- Init ---
  init();
})();
