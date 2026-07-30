/**
 * 每日心情打卡：
 * - 每天可以记录心情，可同时选多种心情，也可写一句缘由。
 * - 历史区：心情日历（表情显示在日期下方）+ 每周小结 + 近期心情可视化。
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
    function moodName(e) { const m = MOODS.find((m) => m.e === e); return m ? m.n : e; }

    // 今天已选中的心情（emoji 集合）
    let sel = new Set();
    // 日历当前显示的年月
    const now = new Date();
    let calY = now.getFullYear();
    let calM = now.getMonth();   // 0-based

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
      '    <div class="mo-hist-title">心情日历</div>' +
      '    <div class="mo-cal" id="mo-cal"></div>' +
      '    <div class="mo-hist-title">每周小结</div>' +
      '    <div class="mo-weeks" id="mo-weeks"></div>' +
      '    <div class="mo-hist-title">近期心情 · 最近30天</div>' +
      '    <div class="mo-viz" id="mo-viz"></div>' +
      '  </div>' +
      '</div>';

    const moodsEl = container.querySelector('#mo-moods');
    const noteEl = container.querySelector('#mo-note');
    const calEl = container.querySelector('#mo-cal');
    const weeksEl = container.querySelector('#mo-weeks');
    const vizEl = container.querySelector('#mo-viz');

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
    function loadToday() {
      const rec = data[todayStr()];
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

    // ---------- 心情日历 ----------
    function renderCalendar() {
      const first = new Date(calY, calM, 1);
      const daysInMonth = new Date(calY, calM + 1, 0).getDate();
      const lead = (first.getDay() + 6) % 7;   // 周一开头
      const tStr = todayStr();

      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<div class="mo-cal-day empty"></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = calY + '-' + pad(calM + 1) + '-' + pad(d);
        const rec = data[ds];
        const isToday = ds === tStr;
        const isFuture = ds > tStr;
        let emojis = '';
        if (rec && rec.list && rec.list.length) {
          const show = rec.list.slice(0, 2).join('');
          const more = rec.list.length > 2 ? '<span class="mo-cal-more">+' + (rec.list.length - 2) + '</span>' : '';
          emojis = '<span class="mo-cal-emojis">' + show + more + '</span>';
        }
        cells +=
          '<div class="mo-cal-day' + (isToday ? ' today' : '') + (isFuture ? ' future' : '') +
          (rec ? ' has' : '') + '"' + (rec ? ' data-day="' + ds + '"' : '') + '>' +
          '<span class="mo-cal-num">' + d + '</span>' + emojis +
          '</div>';
      }

      calEl.innerHTML =
        '<div class="mo-cal-head">' +
        '  <button class="mo-cal-nav" type="button" data-nav="-1" aria-label="上个月">‹</button>' +
        '  <span class="mo-cal-ym">' + calY + '年' + (calM + 1) + '月</span>' +
        '  <button class="mo-cal-nav" type="button" data-nav="1" aria-label="下个月">›</button>' +
        '</div>' +
        '<div class="mo-cal-week">' + ['一', '二', '三', '四', '五', '六', '日'].map((w) =>
          '<span>' + w + '</span>').join('') + '</div>' +
        '<div class="mo-cal-grid">' + cells + '</div>';
    }

    calEl.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        calM += parseInt(nav.dataset.nav, 10);
        if (calM < 0) { calM = 11; calY--; }
        if (calM > 11) { calM = 0; calY++; }
        renderCalendar();
        renderWeeks();
        return;
      }
      const day = e.target.closest('[data-day]');
      if (day) openDayDetail(day.dataset.day);
    });

    // 某天详情弹层（查看 / 删除）
    function openDayDetail(ds) {
      const rec = data[ds];
      if (!rec) return;
      const wrap = document.createElement('div');
      wrap.className = 'mo-mask';
      const emojis = (rec.list || []).map((e) =>
        '<span class="mo-day-e" title="' + moodName(e) + '">' + e + '</span>').join('');
      wrap.innerHTML =
        '<div class="mo-day-sheet">' +
        '  <div class="mo-day-date">' + ds + '</div>' +
        '  <div class="mo-day-emojis">' + (emojis || '<span class="muted">（无表情）</span>') + '</div>' +
        (rec.note ? '<p class="mo-day-note">' + App.escapeHtml(rec.note) + '</p>' : '') +
        '  <div class="mo-day-btns">' +
        '    <button class="btn ghost" data-close="1" type="button">关闭</button>' +
        '    <button class="btn danger" data-del="1" type="button">删除记录</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
        if (e.target.closest('[data-del]')) {
          if (confirm('删除 ' + ds + ' 的心情记录？')) {
            delete data[ds];
            save();
            wrap.remove();
            if (ds === todayStr()) loadToday();
            renderHistory();
          }
        }
      });
    }

    // ---------- 每周小结（当前显示月份） ----------
    function renderWeeks() {
      const daysInMonth = new Date(calY, calM + 1, 0).getDate();
      // 按「周一开头的自然周」把这个月的日期分组
      const weeks = [];   // [{start,end,counts:{emoji:n},days:n}]
      let cur = null;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(calY, calM, d);
        const dow = (dt.getDay() + 6) % 7;   // 0=周一
        if (!cur || dow === 0) { cur = { start: d, end: d, counts: {}, days: 0 }; weeks.push(cur); }
        cur.end = d;
        const ds = calY + '-' + pad(calM + 1) + '-' + pad(d);
        const rec = data[ds];
        if (rec && rec.list && rec.list.length) {
          cur.days++;
          rec.list.forEach((e) => { cur.counts[e] = (cur.counts[e] || 0) + 1; });
        }
      }
      const rows = weeks.map((w, i) => {
        const top = Object.keys(w.counts)
          .sort((a, b) => w.counts[b] - w.counts[a])
          .slice(0, 4)
          .map((e) => e + '×' + w.counts[e]).join(' ');
        const range = (calM + 1) + '.' + w.start + '–' + (calM + 1) + '.' + w.end;
        const body = w.days
          ? '<span class="mo-week-moods">' + top + '</span><span class="mo-week-days">记录' + w.days + '天</span>'
          : '<span class="muted">无记录</span>';
        return '<div class="mo-week-row">' +
          '<span class="mo-week-name">第' + (i + 1) + '周 <i>' + range + '</i></span>' + body +
          '</div>';
      }).join('');
      weeksEl.innerHTML = rows;
    }

    // ---------- 近期心情可视化（最近30天） ----------
    function renderViz() {
      const counts = {};
      let total = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const rec = data[fmt(d)];
        if (rec && rec.list) rec.list.forEach((e) => { counts[e] = (counts[e] || 0) + 1; total++; });
      }
      const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      if (!keys.length) {
        vizEl.innerHTML = '<p class="muted ci-empty">最近30天还没有记录。</p>';
        return;
      }
      const max = counts[keys[0]];
      vizEl.innerHTML = keys.map((e) => {
        const pct = Math.round(counts[e] / max * 100);
        return '<div class="mo-viz-row">' +
          '  <span class="mo-viz-e">' + e + '</span>' +
          '  <span class="mo-viz-n">' + moodName(e) + '</span>' +
          '  <span class="mo-viz-bar"><i style="width:' + pct + '%"></i></span>' +
          '  <span class="mo-viz-c">' + counts[e] + '次</span>' +
          '</div>';
      }).join('') +
      '<p class="mo-viz-total muted">30天内共 ' + total + ' 次心情记录</p>';
    }

    function renderHistory() {
      renderCalendar();
      renderWeeks();
      renderViz();
    }

    // ---------- 首次渲染 ----------
    loadToday();
    renderHistory();
  }
});
