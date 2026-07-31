/**
 * 每日心情打卡：
 * - 第 1 页：今日记录（每天可记多条心情，每条心情各自带一段「情况说明」）
 * - 第 2 页：心情日历（每天的表情显示在日期下方，点击查看当天每条心情）
 * - 第 3 页：总结（最近30天扇形图 + 每周小结 + 近期可视化）
 *
 * 数据模型：data['YYYY-MM-DD'] = { items: [ { e:'😊', note:'...' }, ... ] }
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
      let obj;
      try { obj = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { obj = {}; }
      // 迁移：旧结构 { list:[emoji...], note:'...' } -> { items:[{e,note}] }
      Object.keys(obj).forEach((ds) => {
        const rec = obj[ds];
        if (!rec || typeof rec !== 'object') return;
        if (rec.list && !rec.items) {
          rec.items = (rec.list || []).map((e, i) => ({ e: e, note: i === 0 ? (rec.note || '') : '' }));
          delete rec.list; delete rec.note;
        }
        if (!rec.items) rec.items = [];
      });
      return obj;
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(data)) }

    let data = load();

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

    // 编辑器状态（模块级，跨重渲染保留）
    let editorMode = 'add';   // 'add' | 'edit'
    let editIdx = -1;
    let selMood = null;        // 单选用：当前选中的 emoji

    // 今天已记的心情条目
    function todayItems() { const r = data[todayStr()]; return r && r.items ? r.items : []; }

    // 日历当前显示的年月
    const now = new Date();
    let calY = now.getFullYear();
    let calM = now.getMonth();   // 0-based

    // ---------- 渲染骨架（横滑 3 页：记录 / 日历 / 总结） ----------
    container.innerHTML =
      '<div class="mo">' +
      '  <div class="mo-head"><h2>心情</h2><span class="muted">每天记录此刻的感受</span></div>' +
      '  <div class="mo-tabs" id="mo-tabs">' +
      '    <button class="mo-tab on" data-go="0" type="button">记录</button>' +
      '    <button class="mo-tab" data-go="1" type="button">日历</button>' +
      '    <button class="mo-tab" data-go="2" type="button">总结</button>' +
      '  </div>' +
      '  <div class="mo-pages" id="mo-pages">' +
      '    <div class="mo-page mo-page-tall" data-page="0">' +
      '      <div class="mo-today-card" id="mo-today-card"></div>' +
      '    </div>' +
      '    <div class="mo-page mo-page-tall" data-page="1">' +
      '      <div class="mo-cal" id="mo-cal"></div>' +
      '    </div>' +
      '    <div class="mo-page mo-page-tall" data-page="2">' +
      '      <div class="mo-hist-title">心情分布 · 最近30天</div>' +
      '      <div class="mo-pie" id="mo-pie"></div>' +
      '      <div class="mo-hist-title">每周小结</div>' +
      '      <div class="mo-weeks" id="mo-weeks"></div>' +
      '      <div class="mo-hist-title">近期心情条形图</div>' +
      '      <div class="mo-viz" id="mo-viz"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="mo-pager" id="mo-pager">' +
      '    <span class="mo-pager-dot on" data-go="0"></span>' +
      '    <span class="mo-pager-dot" data-go="1"></span>' +
      '    <span class="mo-pager-dot" data-go="2"></span>' +
      '  </div>' +
      '</div>';

    const pagesEl = container.querySelector('#mo-pages');
    const tabsBtns = container.querySelectorAll('.mo-tab');
    const pagerDots = container.querySelectorAll('.mo-pager-dot');
    const todayCardEl = container.querySelector('#mo-today-card');
    const calEl = container.querySelector('#mo-cal');
    const weeksEl = container.querySelector('#mo-weeks');
    const vizEl = container.querySelector('#mo-viz');
    const pieEl = container.querySelector('#mo-pie');

    function go(i) {
      pagesEl.scrollTo({ left: i * pagesEl.clientWidth, behavior: 'smooth' });
    }
    // 横滑：滚动同步 tab+dot
    pagesEl.addEventListener('scroll', () => {
      const i = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
      tabsBtns.forEach((b, idx) => b.classList.toggle('on', idx === i));
      pagerDots.forEach((d, idx) => d.classList.toggle('on', idx === i));
    });
    tabsBtns.forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
    pagerDots.forEach((d) => d.addEventListener('click', () => go(+d.dataset.go)));

    // ---------- 今日心情卡片 ----------
    function renderTodayCard() {
      const t = todayStr();
      const items = todayItems();
      const has = items.length > 0;
      const itemCards = items.map((it, idx) =>
        '<div class="mo-item" data-idx="' + idx + '">' +
        '  <span class="mo-item-e">' + it.e + '</span>' +
        '  <div class="mo-item-body">' +
        '    <span class="mo-item-name">' + moodName(it.e) + '</span>' +
        (it.note ? '<p class="mo-item-note">' + App.escapeHtml(it.note) + '</p>' : '') +
        '  </div>' +
        '  <div class="mo-item-ops">' +
        '    <button class="btn ghost sm" data-edit="' + idx + '" type="button">编辑</button>' +
        '    <button class="btn ghost sm" data-del="' + idx + '" type="button">删除</button>' +
        '  </div>' +
        '</div>'
      ).join('');

      todayCardEl.innerHTML =
        '<div class="mo-today-head">' +
        '  <span class="mo-today-date">今天 · ' + t + '</span>' +
        (has ? '<button class="btn ghost sm" id="mo-del-today" type="button">删除今日</button>' : '') +
        '</div>' +
        (has
          ? '<div class="mo-items">' + itemCards + '</div>'
          : '<div class="mo-today-empty muted">今天还没记录心情</div>') +
        '<div class="mo-today-editor" id="mo-today-editor">' +
        '  <div class="mo-edit-title" id="mo-edit-title">添加心情</div>' +
        '  <div class="mo-moods" id="mo-moods"></div>' +
        '  <textarea id="mo-note" class="mo-note" maxlength="200" rows="2" placeholder="这个情况是怎么回事？（每条心情各自的情况说明，可选）"></textarea>' +
        '  <div class="mo-today-actions">' +
        '    <button class="btn" id="mo-save-today" type="button">保存这条</button>' +
        '  </div>' +
        '</div>';

      renderMoodButtons();
    }

    // 单选用心情选择网格
    function renderMoodButtons() {
      const moodsEl = container.querySelector('#mo-moods');
      if (!moodsEl) return;
      moodsEl.innerHTML = MOODS.map((m) => {
        const on = selMood === m.e ? ' on' : '';
        return '<button class="mo-mood' + on + '" type="button" data-e="' + m.e + '" ' +
          'aria-pressed="' + (selMood === m.e ? 'true' : 'false') + '" title="' + m.n + '">' +
          '<span class="mo-mood-e">' + m.e + '</span><span class="mo-mood-n">' + m.n + '</span>' +
          '</button>';
      }).join('');
      moodsEl.onclick = (e) => {
        const b = e.target.closest('[data-e]');
        if (!b) return;
        selMood = b.dataset.e;
        moodsEl.querySelectorAll('.mo-mood').forEach((x) =>
          x.classList.toggle('on', x.dataset.e === selMood));
      };
    }

    // 打开编辑器（add 或 edit）
    function openEditor(mode, idx) {
      editorMode = mode; editIdx = idx;
      const titleEl = container.querySelector('#mo-edit-title');
      const ne = container.querySelector('#mo-note');
      if (mode === 'add') {
        selMood = null;
        titleEl.textContent = '添加心情';
        if (ne) ne.value = '';
      } else {
        const it = todayItems()[idx];
        if (!it) return;
        selMood = it.e;
        titleEl.textContent = '编辑 · ' + moodName(it.e);
        if (ne) ne.value = it.note || '';
      }
      renderMoodButtons();
      // 编辑器始终展开，编辑时滚到它
      const editor = container.querySelector('#mo-today-editor');
      if (editor && editor.scrollIntoView) editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function closeEditor() {
      // 编辑器始终展开，关闭时仅清空状态、不再隐藏
      editorMode = 'add'; editIdx = -1; selMood = null;
    }

    function saveItem() {
      const ne = container.querySelector('#mo-note');
      const note = ne ? ne.value.trim() : '';
      const t = todayStr();
      if (!selMood) { App.toast('先选一个心情表情'); return; }
      if (!data[t]) data[t] = { items: [] };
      if (editorMode === 'add') {
        data[t].items.push({ e: selMood, note: note });
      } else {
        const it = data[t].items[editIdx];
        if (!it) { closeEditor(); renderTodayCard(); return; }
        it.e = selMood; it.note = note;
      }
      save();
      App.toast(editorMode === 'add' ? '已添加这条心情 🌈' : '已更新');
      closeEditor();
      // 清空表单（编辑器始终展开）
      const noteEl = container.querySelector('#mo-note');
      if (noteEl) noteEl.value = '';
      selMood = null;
      renderTodayCard();
      renderCalendar();
      renderSummary();
    }

    // 今天卡片内的事件（委托在 todayCardEl 上，仅绑定一次）
    todayCardEl.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const delBtn = e.target.closest('[data-del]');
      const saveBtn = e.target.closest('#mo-save-today');
      const delDayBtn = e.target.closest('#mo-del-today');
      if (editBtn) { openEditor('edit', parseInt(editBtn.dataset.edit, 10)); return; }
      if (delBtn) {
        const idx = parseInt(delBtn.dataset.del, 10);
        App.confirm('删除这条心情', '确认删除「' + moodName(todayItems()[idx].e) + '」这一条记录？', () => {
          const t = todayStr();
          data[t].items.splice(idx, 1);
          if (!data[t].items.length) delete data[t];
          save();
          App.toast('已删除');
          renderTodayCard(); renderCalendar(); renderSummary();
        });
        return;
      }
      if (delDayBtn) {
        App.confirm('删除今日心情', '确认删除「' + todayStr() + '」的全部心情记录？', () => {
          delete data[todayStr()];
          save();
          App.toast('已删除');
          renderTodayCard(); renderCalendar(); renderSummary();
        });
        return;
      }
      if (saveBtn) { saveItem(); return; }
    });

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
        if (rec && rec.items && rec.items.length) {
          const show = rec.items.slice(0, 2).map((i) => i.e).join('');
          const more = rec.items.length > 2 ? '<span class="mo-cal-more">+' + (rec.items.length - 2) + '</span>' : '';
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

    // 某天详情弹层（查看每条心情 + 其说明 / 删除当天）
    function openDayDetail(ds) {
      const rec = data[ds];
      if (!rec) return;
      const wrap = document.createElement('div');
      wrap.className = 'mo-mask';
      const emojis = (rec.items || []).map((it) =>
        '<div class="mo-day-item">' +
        '  <span class="mo-day-e" title="' + moodName(it.e) + '">' + it.e + '</span>' +
        (it.note ? '<p class="mo-day-note">' + App.escapeHtml(it.note) + '</p>' : '<p class="mo-day-note muted">（无说明）</p>') +
        '</div>').join('');
      wrap.innerHTML =
        '<div class="mo-day-sheet">' +
        '  <div class="mo-day-date">' + ds + '</div>' +
        '  <div class="mo-day-items">' + emojis + '</div>' +
        '  <div class="mo-day-btns">' +
        '    <button class="btn ghost" data-close="1" type="button">关闭</button>' +
        '    <button class="btn danger" data-del="1" type="button">删除当天</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
        if (e.target.closest('[data-del]')) {
          App.confirm('删除心情', '确认删除 ' + ds + ' 的全部心情记录？', () => {
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
        if (rec && rec.items && rec.items.length) {
          cur.days++;
          rec.items.forEach((it) => { cur.counts[it.e] = (cur.counts[it.e] || 0) + 1; });
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
        if (rec && rec.items) rec.items.forEach((it) => { counts[it.e] = (counts[it.e] || 0) + 1; total++; });
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
      '<p class="mo-viz-total muted">30天内共 ' + total + ' 条心情记录</p>';
    }

    // ---------- 扇形图（最近30天心情分布） ----------
    function renderPie() {
      const counts = {};
      let total = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const rec = data[fmt(d)];
        if (rec && rec.items) rec.items.forEach((it) => { counts[it.e] = (counts[it.e] || 0) + 1; total++; });
      }
      const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      if (!keys.length) {
        pieEl.innerHTML = '<p class="muted ci-empty">最近30天还没有记录。</p>';
        return;
      }
      let angle = -90;
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
