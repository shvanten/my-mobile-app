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
  const sidebarEl = document.getElementById('sidebar');
  const backdropEl = document.getElementById('side-backdrop');
  const menuBtn = document.getElementById('menu-btn');

  // ===== 左侧导航抽屉（默认隐藏，菜单按钮抽出 / 切界面后收起） =====
  function openDrawer() { sidebarEl.classList.add('open'); backdropEl.classList.add('show'); menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { sidebarEl.classList.remove('open'); backdropEl.classList.remove('show'); menuBtn.setAttribute('aria-expanded', 'false'); }
  function toggleDrawer() { sidebarEl.classList.toggle('open'); backdropEl.classList.toggle('show'); menuBtn.setAttribute('aria-expanded', sidebarEl.classList.contains('open') ? 'true' : 'false'); }

  // ===== 左侧导航 =====
  function buildSidebar() {
    nav.innerHTML = '';
    features.forEach((f) => {
      const item = document.createElement('button');
      item.className = 'nav-item';
      item.type = 'button';
      item.dataset.id = f.id;
      item.innerHTML =
        '<span class="nav-icon">' + App.icon(f.icon || 'pin') + '</span>' +
        '<span class="nav-label">' + escapeHtml(f.title || f.id) + '</span>';
      item.addEventListener('click', () => { navigate(f.id); closeDrawer(); });
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
      '  <div class="welcome-emoji">' + App.icon('leaf') + '</div>' +
      '  <h2>我的应用</h2>' +
      '  <p class="muted">点左上角菜单按钮，选择功能开始</p>' +
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
    buildSidebar();
    closeDrawer();
    const route = parseRoute();
    if (route.name === 'feature') renderFeature(route.id);
    else renderHome();
  }

  // ===== 添加功能提示 =====
  function showAddHint() {
    toast('在 js/features 新建一个 .js 文件，调用 App.registerFeature({...})，再到 index.html 加一行 <script> 引入即可。');
  }

  // ===== 自定义弹层（iOS/安卓 PWA 都不支持原生 confirm/prompt） =====
  function ensureModal() {
    let mask = document.getElementById('app-modal');
    if (mask) return mask;
    mask = document.createElement('div');
    mask.id = 'app-modal';
    mask.className = 'app-modal-mask';
    mask.hidden = true;
    mask.innerHTML =
      '<div class="app-modal" role="dialog" aria-modal="true">' +
      '  <div class="app-modal-title" id="app-modal-title"></div>' +
      '  <div class="app-modal-body" id="app-modal-body"></div>' +
      '  <div class="app-modal-actions" id="app-modal-actions"></div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });
    return mask;
  }
  function openModal(opts) {
    const mask = ensureModal();
    mask.querySelector('#app-modal-title').textContent = opts.title || '';
    const bodyEl = mask.querySelector('#app-modal-body');
    bodyEl.innerHTML = '';
    if (opts.body) {
      if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
      else bodyEl.appendChild(opts.body);
    }
    const actionsEl = mask.querySelector('#app-modal-actions');
    actionsEl.innerHTML = '';
    (opts.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || '');
      b.type = 'button';
      b.textContent = a.text;
      b.addEventListener('click', () => {
        // 先关弹层（即使后续用户回调抛错，弹层也不卡住）
        if (a.close !== false) closeModal();
        // 再执行用户回调，加 try/catch 防御
        if (a.onClick) {
          try { a.onClick(); }
          catch (e) { console.error('[App.modal]', e); toast('操作失败，请重试'); }
        }
      });
      actionsEl.appendChild(b);
    });
    mask.hidden = false;
  }
  function closeModal() {
    const mask = document.getElementById('app-modal');
    if (mask) mask.hidden = true;
  }
  // 确认弹层：title + msg + 确定(默认 danger 红) / 取消
  function confirmDialog(title, msg, onYes, opts) {
    const danger = !opts || opts.danger !== false;
    openModal({
      title: title,
      body: '<p style="margin:0;font-size:14px;line-height:1.6">' + escapeHtml(msg) + '</p>',
      actions: [
        { text: (opts && opts.cancelText) || '取消', kind: 'ghost' },
        { text: (opts && opts.okText) || '确定', kind: danger ? 'danger' : '', onClick: onYes },
      ],
    });
  }
  // 输入弹层：title + hint + defaultVal + type(text/number) + onValue(value)
  function promptDialog(title, defaultVal, onValue, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'app-modal-form';
    const type = (opts && opts.type) || 'text';
    const hint = opts && opts.hint;
    wrap.innerHTML =
      (hint ? '<p class="app-modal-hint">' + escapeHtml(hint) + '</p>' : '') +
      '<input id="app-modal-input" type="' + type + '"' +
      (type === 'number' ? ' inputmode="decimal" step="0.01" min="0"' : '') +
      ' value="' + escapeHtml(defaultVal == null ? '' : String(defaultVal)) + '" />';
    openModal({
      title: title,
      body: wrap,
      actions: [
        { text: '取消', kind: 'ghost' },
        { text: '确定', kind: '', onClick: () => {
          const raw = wrap.querySelector('#app-modal-input').value;
          const v = (type === 'number') ? parseFloat(raw) : raw;
          if (onValue) onValue(v);
        } },
      ],
    });
    setTimeout(() => {
      const inp = wrap.querySelector('#app-modal-input');
      if (inp) { inp.focus(); if (type !== 'number') inp.select(); }
    }, 80);
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
  // 注意：buildSidebar 必须等所有功能模块执行完 registerFeature 后才能正确读取 features 数组，
  // 因此放进 render()（在 DOMContentLoaded / hashchange 时统一调用），不要在这里直接调。
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('nav-add').addEventListener('click', showAddHint);
  menuBtn.addEventListener('click', toggleDrawer);
  backdropEl.addEventListener('click', closeDrawer);
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
  const api = { registerFeature, navigate, getFeatures: () => features, toast, escapeHtml, confirm: confirmDialog, prompt: promptDialog, closeModal,
    icon: function (name, cls) {
      return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="#ic-' + name + '"/></svg>';
    },
  };
  window.App = api;
})();
