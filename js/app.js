/**
 * 核心框架：负责主题、路由、首页渲染、轻提示、PWA。
 * 你以后基本不用改这个文件，只需要在 js/features/ 里加功能文件即可。
 */
(function () {
  'use strict';

  const THEME_KEY = 'myapp.theme';
  const features = [];

  // ===== 注册功能（功能模块里调用它） =====
  function registerFeature(feature) {
    if (!feature || !feature.id) {
      console.warn('[App] 功能缺少 id，已忽略', feature);
      return;
    }
    features.push(feature);
  }
  function getFeature(id) {
    return features.find((f) => f.id === id) || null;
  }

  // ===== 主题（亮/暗，记忆选择） =====
  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // ===== 路由（用地址栏 # 切换页面，无需后端） =====
  function navigate(id) {
    location.hash = id ? '#/f/' + encodeURIComponent(id) : '#/';
  }
  function parseRoute() {
    const h = location.hash || '#/';
    if (h.indexOf('#/f/') === 0) return { name: 'feature', id: decodeURIComponent(h.slice(4)) };
    return { name: 'home' };
  }

  // ===== 渲染 =====
  const view = document.getElementById('view');
  const titleEl = document.getElementById('app-title');
  const backBtn = document.getElementById('back-btn');

  function renderHome() {
    titleEl.textContent = '我的应用';
    backBtn.hidden = true;

    const grid = document.createElement('div');
    grid.className = 'grid';

    features.forEach((f) => {
      const card = document.createElement('button');
      card.className = 'card';
      card.style.setProperty('--accent', f.color || '#4f46e5');
      card.innerHTML =
        '<span class="card-icon">' + (f.icon || '📱') + '</span>' +
        '<span class="card-title">' + escapeHtml(f.title || f.id) + '</span>' +
        '<span class="card-desc">' + escapeHtml(f.desc || '') + '</span>';
      card.addEventListener('click', () => navigate(f.id));
      grid.appendChild(card);
    });

    // 「添加功能」说明卡
    const add = document.createElement('button');
    add.className = 'card card-add';
    add.innerHTML =
      '<span class="card-icon">➕</span>' +
      '<span class="card-title">添加功能</span>' +
      '<span class="card-desc">在 js/features 里新建文件</span>';
    add.addEventListener('click', showAddHint);
    grid.appendChild(add);

    view.innerHTML = '';
    view.appendChild(grid);
  }

  function renderFeature(id) {
    const f = getFeature(id);
    if (!f) { navigate(); return; }
    titleEl.textContent = f.title || f.id;
    backBtn.hidden = false;
    view.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'feature';
    view.appendChild(content);
    try {
      if (typeof f.render === 'function') f.render(content, { navigate: navigate, App: api });
    } catch (e) {
      content.innerHTML = '<p class="error">功能渲染出错：' + escapeHtml(String(e)) + '</p>';
      console.error(e);
    }
  }

  function render() {
    const route = parseRoute();
    if (route.name === 'feature') renderFeature(route.id);
    else renderHome();
  }

  function showAddHint() {
    toast('在 js/features 新建一个 .js 文件，调用 App.registerFeature({...})，再到 index.html 加一行 <script> 引入即可。');
  }

  // ===== 工具 =====
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }

  // ===== 启动 =====
  backBtn.addEventListener('click', () => navigate());
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  window.addEventListener('hashchange', render);

  applyTheme(getPreferredTheme());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();

  // PWA：支持「添加到主屏幕」后离线使用
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败', e));
    });
  }

  // 暴露给功能模块使用的 API
  const api = { registerFeature, navigate, getFeatures: () => features, toast, escapeHtml };
  window.App = api;
})();
