/**
 * 每日心情打卡：
 * - 每天可以记录心情，可同时选多种心情，也可写一句缘由。
 * - 按日期存储，下方展示历史心情（最近在前）。
 */
App.registerFeature({
  id: 'mood',
  title: '心情',
  desc: '每日心情记录',
  icon: '🌈',
  color: '#7aa6c2',
  render(container) {
    const KEY = 'mood.v1';

    // ---------- 存储 ----------
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(data)); }

    let data = load();   // { 'YYYY-MM-DD': { list:['😊',...], note:'...' } }

    // ---------- 工具 ----------
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function todayStr() { return fmt(new Date()); }

    // 可选心情（emoji + 名称）
    const MOODS = [
      { e: '😊', n: '开心' }, { e: '😢', n: '难过' }, { e: '😠', n: '生气' },
      { e: '😴', n: '疲惫' }, { e: '😌', n: '平静' }, { e: '😰', n: '焦虑' },
      { e: '🥰', n: '喜爱' }, { e: '🤩', n: '兴奋' }, { e: '🤔', n: '思考' },
      { e: '😐', n: '平淡' }, { e: '🤒', n: '生病' }, { e: '🥳', n: '庆祝' },
    ];

    // 今天已选中的心情（emoji 集合）
    let sel = new Set();

    // ---------- 渲染骨架 ----------
    container.innerHTML =
      '<div class="mo">' +
      '  <div class="mo-head"><h2>心情</h2><span class="muted">每天记录此刻的感受</span></div>' +
      '  <div class="mo-today">' +
      '    <div class="mo-today-title">今天 · ' + todayStr() + '</div>' +
      '    <div class="mo-moods" id="mo-moods"></div>' +
      '    <textarea id="mo-note" class="mo-note" maxlength="200" rows="3" placeholder="记录一下今天的缘由（可选）"></textarea>' +
      '    <button class="btn mo-save" id="mo-save" type="button">保存今日心情</button>' +
      '  </div>' +
      '  <div class="mo-hist-wrap">' +
      '    <div class="mo-hist-title">历史心情</div>' +
      '    <div class="mo-hist" id="mo-hist"></div>' +
      '  </div>' +
      '</div>';

    const moodsEl = container.querySelector('#mo-moods');
    const noteEl = container.querySelector('#mo-note');
    const histEl = container.querySelector('#mo-hist');

    // ---------- 今天编辑器 ----------
    function renderMoodButtons() {
      moodsEl.innerHTML = MOODS.map((m) => {
        const on = sel.has(m.e) ? ' on' : '';
        return '<button class="mo-mood' + on + '" type="button" data-e="' + m.e + '" ' +
          'aria-pressed="' + (sel.has(m.e) ? 'true' : 'false') + '" title="' + m.n + '">' +
          '<span class="mo-mood-e">' + m.e + '</span><span class="mo-mood-n">' + m.n + '</span>' +
          '</button>';
      }).join('');
    }
    // 载入今天的已有记录（若有）
    function loadToday() {
      const t = todayStr();
      const rec = data[t];
      sel = new Set(rec && rec.list ? rec.list : []);
      noteEl.value = (rec && rec.note) ? rec.note : '';
      renderMoodButtons();
    }

    moodsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-e]');
      if (!b) return;
      const e2 = b.dataset.e;
      if (sel.has(e2)) sel.delete(e2); else sel.add(e2);
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
    });

    container.querySelector('#mo-save').addEventListener('click', () => {
      const t = todayStr();
      const list = Array.from(sel);
      const note = noteEl.value.trim();
      if (!list.length && !note) { App.toast('选一个心情，或写点什么吧'); return; }
      data[t] = { list: list, note: note };
      save();
      App.toast('已保存今日心情 🌈');
      renderHistory();
    });

    // ---------- 历史列表 ----------
    function renderHistory() {
      const dates = Object.keys(data).sort().reverse();   // 最近在前
      if (!dates.length) {
        histEl.innerHTML = '<p class="muted ci-empty">还没有历史记录。</p>';
        return;
      }
      histEl.innerHTML = dates.map((d) => {
        const rec = data[d];
        const emojis = (rec.list || []).map((e) => '<span class="mo-hist-e">' + e + '</span>').join('');
        const note = rec.note
          ? '<p class="mo-hist-note">' + App.escapeHtml(rec.note) + '</p>'
          : '';
        return '<div class="mo-hist-item">' +
          '  <div class="mo-hist-top">' +
          '    <span class="mo-hist-date">' + d + '</span>' +
          '    <button class="mo-hist-del" type="button" data-del="' + d + '" aria-label="删除">✕</button>' +
          '  </div>' +
          '  <div class="mo-hist-emojis">' + emojis + '</div>' +
          note +
          '</div>';
      }).join('');
    }

    histEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const d = b.dataset.del;
      if (confirm('删除 ' + d + ' 的心情记录？')) {
        delete data[d];
        save();
        if (d === todayStr()) loadToday();
        renderHistory();
      }
    });

    // ---------- 首次渲染 ----------
    loadToday();
    renderHistory();
  }
});
