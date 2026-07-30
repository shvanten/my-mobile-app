/**
 * 核心框架：左侧功能导航 + 右侧内容区。
 * 你以后基本不用改这个文件，只需要在 js/features/ 里加功能文件即可。
 * 布局：电脑上左侧固定一列导航、右侧内容；手机上左侧收窄成图标栏。
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

  // ===== DOM 引用 =====
  const view = document.getElementById('view');
  const nav = document.getElementById('side-nav');

  // ===== 左侧导航 =====
  function buildSidebar() {
    nav.innerHTML = '';
    features.forEach((f) => {
      const item = document.createElement('button');
      item.className = 'nav-item';
      item.type = 'button';
      item.dataset.id = f.id;
      item.innerHTML =
        '<span class="nav-icon">' + (f.icon || '📱') + '</span>' +
        '<span class="nav-label">' + escapeHtml(f.title || f.id) + '</span>';
      item.addEventListener('click', () => navigate(f.id));
      nav.appendChild(item);
    });
  }
  function setActiveNav(id) {
    nav.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  // ===== 渲染 =====
  function renderHome() {
    setActiveNav(null);
    view.className = 'home-view';
    view.style.removeProperty('--accent');
    view.innerHTML =
      '<div class="welcome">' +
      '  <div class="welcome-emoji">🌿</div>' +
      '  <h2>我的应用</h2>' +
      '  <p class="muted">从左侧选择功能开始</p>' +
      '</div>';
  }

  function renderFeature(id) {
    const f = getFeature(id);
    if (!f) { navigate(); return; }
    setActiveNav(f.id);
    // 进入功能：把该功能的主色注入内容区，全页同色系（同一区块只有这一个主色）
    view.className = 'feature-view';
    view.style.setProperty('--accent', f.color || '#6fa860');
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

  // ===== 添加功能提示 =====
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
  buildSidebar();
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('nav-add').addEventListener('click', showAddHint);
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
