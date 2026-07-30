/**
 * 每日心情打卡：
 * - 今天的心情卡片：可记录 / 编辑 / 删除今日心情
 * - 横滑双页：
 *     第 1 页：今日心情 + 心情日历（每日表情在日期下方，可点开查看）
 *     第 2 页：总结（最近30天心情扇形图 + 每周小结 + 近期可视化）
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
    function save() { localStorage.setItem(KEY, JSON.stringify(data)); if (window.Sync) Sync.markDirty(); }

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
    const PIE_COLORS = ['#7aa6c2', '#e09b6c', '#a3c46a', '#c46a8d', '#9b6ac4', '#c4b86a', '#6ac4a3', '#c46a6a', '#6a6fc4', '#c4a36a', '#7a7a7a', '#aaaaaa'];
    function moodName(e) { const m = MOODS.find((m) => m.e === e); return m ? m.n : e; }

    // 今天已选中的心情（emoji 集合）
    let sel = new Set();
    // 日历当前显示的年月
    const now = new Date();
    let calY = now.getFullYear();
    let calM = now.getMonth();   // 0-based

    // ---------- 渲染骨架（横滑双页） ----------
    container.innerHTML =
      '<div class="mo">' +
      '  <div class="mo-head"><h2>心情</h2><span class="muted">每天记录此刻的感受</span></div>' +
      '  <div class="mo-pages" id="mo-pages">' +
      '    <div class="mo-page mo-page-tall" data-page="today">' +
      '      <div class="mo-cal" id="mo-cal"></div>' +
      '      <div class="mo-today-card" id="mo-today-card"></div>' +
      '    </div>' +
      '    <div class="mo-page mo-page-tall" data-page="summary">' +
      '      <div class="mo-hist-title">心情分布 · 最近30天</div>' +
      '      <div class="mo-pie" id="mo-pie"></div>' +
      '      <div class="mo-hist-title">每周小结</div>' +
      '      <div class="mo-weeks" id="mo-weeks"></div>' +
      '      <div class="mo-hist-title">近期心情条形图</div>' +
      '      <div class="mo-viz" id="mo-viz"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="mo-pager" id="mo-pager">' +
      '    <span class="mo-pager-dot on" data-go="today"></span>' +
      '    <span class="mo-pager-dot" data-go="summary"></span>' +
      '  </div>' +
      '</div>';

    const pagesEl = container.querySelector('#mo-pages');
    const pagerEl = container.querySelector('#mo-pager');
    const todayCardEl = container.querySelector('#mo-today-card');
    const calEl = container.querySelector('#mo-cal');
    const weeksEl = container.querySelector('#mo-weeks');
    const vizEl = container.querySelector('#mo-viz');
    const pieEl = container.querySelector('#mo-pie');

    // 横滑：滚动同步 dot
    pagesEl.addEventListener('scroll', () => {
      const i = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
      pagerEl.querySelectorAll('.mo-pager-dot').forEach((d, idx) => d.classList.toggle('on', idx === i));
    });
    pagerEl.querySelectorAll('.mo-pager-dot').forEach((d) => d.addEventListener('click', () => {
      const i = d.dataset.go === 'summary' ? 1 : 0;
      pagesEl.scrollTo({ left: i * pagesEl.clientWidth, behavior: 'smooth' });
    }));

    // ---------- 今日心情卡片 ----------
    function renderTodayCard() {
      const t = todayStr();
      const rec = data[t];
      const has = rec && ((rec.list && rec.list.length) || rec.note);
      const emojis = (rec && rec.list) ? rec.list : [];
      const note = (rec && rec.note) || '';
      todayCardEl.innerHTML =
        '<div class="mo-today-head">' +
        '  <span class="mo-today-date">今天 · ' + t + '</span>' +
        '  <div class="mo-today-ops">' +
        (has ? '<button class="btn ghost sm" id="mo-del-today" type="button">删除</button>' : '') +
        '    <button class="btn sm" id="mo-edit-today" type="button">' + (has ? '编辑' : '记录') + '</button>' +
        '  </div>' +
        '</div>' +
        (has
          ? '<div class="mo-today-preview">' +
            '  <div class="mo-today-emojis">' + (emojis.length ? emojis.join(' ') : '<span class="muted">（无）</span>') + '</div>' +
            (note ? '<div class="mo-today-note">' + App.escapeHtml(note) + '</div>' : '') +
            '</div>'
          : '<div class="mo-today-empty muted">今天还没记录心情</div>'
        ) +
        '<div class="mo-today-editor" id="mo-today-editor" hidden>' +
        '  <div class="mo-moods" id="mo-moods"></div>' +
        '  <textarea id="mo-note" class="mo-note" maxlength="200" rows="3" placeholder="记录一下今天的缘由（可选）"></textarea>' +
        '  <div class="mo-today-actions">' +
        '    <button class="btn ghost" id="mo-cancel-today" type="button">取消</button>' +
        '    <button class="btn" id="mo-save-today" type="button">保存</button>' +
        '  </div>' +
        '</div>';
      renderMoodButtons();
      const liveNoteEl = container.querySelector('#mo-note');
      if (liveNoteEl) liveNoteEl.value = note;
      const editor = container.querySelector('#mo-today-editor');
      const editBtn = container.querySelector('#mo-edit-today');
      const delBtn = container.querySelector('#mo-del-today');
      const cancelBtn = container.querySelector('#mo-cancel-today');
      const saveBtn = container.querySelector('#mo-save-today');

      function showEditor() {
        editor.hidden = false;
        editBtn && (editBtn.hidden = true);
      }
      function hideEditor() {
        editor.hidden = true;
        editBtn && (editBtn.hidden = false);
        // 把 sel/note 重置到当前已保存状态
        sel = new Set(emojis);
        renderMoodButtons();
        const ne = container.querySelector('#mo-note');
        if (ne) ne.value = note;
      }

      if (editBtn) editBtn.addEventListener('click', showEditor);
      if (cancelBtn) cancelBtn.addEventListener('click', hideEditor);
      if (saveBtn) saveBtn.addEventListener('click', () => {
        const ne2 = container.querySelector('#mo-note');
        const list = Array.from(sel);
        const nn = ne2 ? ne2.value.trim() : '';
        if (!list.length && !nn) { App.toast('选一个心情，或写点什么吧'); return; }
        data[t] = { list: list, note: nn };
        save();
        App.toast('已保存今日心情 🌈');
        renderTodayCard();
        renderCalendar();
        renderSummary();
      });
      if (delBtn) delBtn.addEventListener('click', () => {
        App.confirm('删除今日心情', '确认删除「' + t + '」的心情记录？', () => {
          delete data[t];
          save();
          App.toast('已删除');
          renderTodayCard();
          renderCalendar();
          renderSummary();
        });
      });
    }

    // moodsEl 改为函数内查询（renderTodayCard 首次执行时才会创建 #mo-moods）
    function renderMoodButtons() {
      const moodsEl = container.querySelector('#mo-moods');
      if (!moodsEl) return;
      moodsEl.innerHTML = MOODS.map((m) => {
        const on = sel.has(m.e) ? ' on' : '';
        return '<button class="mo-mood' + on + '" type="button" data-e="' + m.e + '" ' +
          'aria-pressed="' + (sel.has(m.e) ? 'true' : 'false') + '" title="' + m.n + '">' +
          '<span class="mo-mood-e">' + m.e + '</span><span class="mo-mood-n">' + m.n + '</span>' +
          '</button>';
      }).join('');
      // 每次重新渲染后重新绑定 click 监听（之前的 innerHTML 替换会丢弃旧监听）
      moodsEl.onclick = (e) => {
        const b = e.target.closest('[data-e]');
        if (!b) return;
        const e2 = b.dataset.e;
        if (sel.has(e2)) sel.delete(e2); else sel.add(e2);
        b.classList.toggle('on');
        b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
      };
    }

    // ---------- 心情日历 ----------
    function renderCalendar() {
      const first = new Date(calY, calM, 1);
      const daysInMonth = new Date(calY, calM + 1, 0).getDate();
      const lead = (first.getDay() + 6) % 7;
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
          App.confirm('删除心情', '确认删除 ' + ds + ' 的心情记录？', () => {
            delete data[ds];
            save();
            wrap.remove();
            renderTodayCard();
            renderCalendar();
            renderSummary();
            App.toast('已删除');
          });
        }
      });
    }

    // ---------- 每周小结 ----------
    function renderWeeks() {
      const daysInMonth = new Date(calY, calM + 1, 0).getDate();
      const weeks = [];
      let cur = null;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(calY, calM, d);
        const dow = (dt.getDay() + 6) % 7;
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

    // ---------- 近期心情可视化（条形图，最近30天） ----------
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
      vizEl.innerHTML = keys.map((e, i) => {
        const pct = Math.round(counts[e] / max * 100);
        return '<div class="mo-viz-row">' +
          '  <span class="mo-viz-e">' + e + '</span>' +
          '  <span class="mo-viz-n">' + moodName(e) + '</span>' +
          '  <span class="mo-viz-bar"><i style="width:' + pct + '%;background:' + PIE_COLORS[i % PIE_COLORS.length] + '"></i></span>' +
          '  <span class="mo-viz-c">' + counts[e] + '次</span>' +
          '</div>';
      }).join('') +
      '<p class="mo-viz-total muted">30天内共 ' + total + ' 次心情记录</p>';
    }

    // ---------- 扇形图（最近30天心情分布） ----------
    function renderPie() {
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
        pieEl.innerHTML = '<p class="muted ci-empty">最近30天还没有记录。</p>';
        return;
      }
      // SVG 扇形
      let angle = -90;  // 从 12 点开始
      let paths = '';
      keys.forEach((k, i) => {
        const portion = counts[k] / total;
        const span = portion * 360;
        const next = angle + span;
        const large = span > 180 ? 1 : 0;
        const rad = (deg) => deg * Math.PI / 180;
        const x1 = 100 + 80 * Math.cos(rad(angle));
        const y1 = 100 + 80 * Math.sin(rad(angle));
        const x2 = 100 + 80 * Math.cos(rad(next));
        const y2 = 100 + 80 * Math.sin(rad(next));
        const d = 'M100,100 L' + x1.toFixed(2) + ',' + y1.toFixed(2) +
          ' A80,80 0 ' + large + ' 1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z';
        const color = PIE_COLORS[i % PIE_COLORS.length];
        paths += '<path d="' + d + '" fill="' + color + '" stroke="var(--surface)" stroke-width="2"></path>';
        angle = next;
      });
      const legend = keys.map((k, i) =>
        '<div class="mo-pie-row">' +
        '  <span class="mo-pie-dot" style="background:' + PIE_COLORS[i % PIE_COLORS.length] + '"></span>' +
        '  <span class="mo-pie-e">' + k + '</span>' +
        '  <span class="mo-pie-n">' + moodName(k) + '</span>' +
        '  <span class="mo-pie-c">' + counts[k] + '次</span>' +
        '  <span class="mo-pie-p">' + Math.round(counts[k] / total * 100) + '%</span>' +
        '</div>'
      ).join('');
      pieEl.innerHTML =
        '<div class="mo-pie-svg-wrap"><svg class="mo-pie-svg" viewBox="0 0 200 200">' + paths +
          '<circle cx="100" cy="100" r="36" fill="var(--surface)"></circle>' +
          '<text x="100" y="96" text-anchor="middle" fill="var(--muted)" font-size="11">' + total + '次</text>' +
          '<text x="100" y="112" text-anchor="middle" fill="var(--text-strong)" font-size="13" font-weight="700">30天</text>' +
        '</svg></div>' +
        '<div class="mo-pie-legend">' + legend + '</div>';
    }

    function renderSummary() {
      renderPie();
      renderWeeks();
      renderViz();
    }

    // ---------- 首次渲染 ----------
    renderTodayCard();
    renderCalendar();
    renderSummary();
  }
});