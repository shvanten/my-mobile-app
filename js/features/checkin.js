/**
 * 打卡功能：日历 + 可视化打卡。
 * - 日历上每天一个格子，按「完成度」深浅着色（同一绿色系）。
 * - 可多次完成的习惯（如喝水）：下方每次完成点亮一个图标，全部点亮才会点亮当天。
 * - 当天 24 点前：当天格子只有「全部完成」才变深；过了 0 点，过去的那天按已完成份数比例加深。
 * - 可手动新建打卡，并自行选择把任务分成多少份。
 */
App.registerFeature({
  id: 'checkin',
  title: '打卡',
  desc: '日历与可视化打卡',
  icon: '📅',
  color: '#6fa860',
  render(container) {
    const HABITS_KEY = 'checkin.habits.v1';
    const REC_KEY = 'checkin.records.v1';

    // ---------- 存储 ----------
    function loadHabits() {
      try { return JSON.parse(localStorage.getItem(HABITS_KEY)) || []; } catch (e) { return []; }
    }
    function saveHabits() { localStorage.setItem(HABITS_KEY, JSON.stringify(habits)); }
    function loadRecords() {
      try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveRecords() { localStorage.setItem(REC_KEY, JSON.stringify(records)); }
    const ARCHIVE_KEY = 'checkin.archived.v1';
    function loadArchived() {
      try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY)) || []; } catch (e) { return []; }
    }
    function saveArchived() { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archived)); }

    let habits = loadHabits();
    let records = loadRecords();
    let archived = loadArchived();

    // ---------- 工具 ----------
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function todayStr() { return fmt(new Date()); }
    function isPast(dateStr) { return dateStr < todayStr(); }      // 早于今天 → 已锁定（过了 0 点）
    function isFuture(dateStr) { return dateStr > todayStr(); }

    // 清理未来日期的记录（之前可点未来造成的脏数据）
    (function cleanFutureRecords() {
      const t = todayStr();
      let changed = false;
      Object.keys(records).forEach((hid) => {
        const r = records[hid];
        Object.keys(r).forEach((ds) => {
          if (ds > t) { delete r[ds]; changed = true; }
        });
        if (Object.keys(r).length === 0) delete records[hid];
      });
      if (changed) saveRecords();
    })();

    // 取某天的记录对象：{ parts:[bool...], done:bool }（done=是否按下确认按钮）
    // 兼容旧格式（仅数组）自动迁移为对象；不存在返回 null
    function getEntry(habit, dateStr) {
      const rec = records[habit.id];
      if (!rec) return null;
      const e = rec[dateStr];
      if (e == null) return null;
      if (Array.isArray(e)) {
        const fixed = new Array(habit.parts).fill(false);
        for (let i = 0; i < Math.min(habit.parts, e.length); i++) fixed[i] = e[i];
        const entry = { parts: fixed, done: false };
        rec[dateStr] = entry;
        return entry;
      }
      if (!Array.isArray(e.parts)) e.parts = new Array(habit.parts).fill(false);
      if (e.parts.length !== habit.parts) {
        const fixed = new Array(habit.parts).fill(false);
        for (let i = 0; i < Math.min(habit.parts, e.parts.length); i++) fixed[i] = e.parts[i];
        e.parts = fixed;
      }
      if (typeof e.done !== 'boolean') e.done = false;
      return e;
    }
    // 某天完成度：0~1
    // 今天/未来：只有「按下确认按钮」后才 =1，否则 0（点亮子任务不会自动驱动日历）
    // 过去：已确认则全深；未确认（旧数据/无法操作）按已完成份数比例
    function dayDepth(habit, dateStr) {
      const e = getEntry(habit, dateStr);
      if (!e) return 0;
      const done = e.parts.filter(Boolean).length;
      if (isPast(dateStr)) return e.done ? 1 : (habit.parts ? done / habit.parts : 0);
      return e.done ? 1 : 0;
    }
    function getDayArr(habit, dateStr) {
      const rec = records[habit.id] || (records[habit.id] = {});
      if (!rec[dateStr]) rec[dateStr] = { parts: new Array(habit.parts).fill(false), done: false };
      return getEntry(habit, dateStr).parts;
    }
    function isDayDone(habit, dateStr) {
      const e = getEntry(habit, dateStr);
      return !!(e && e.done);
    }
    function todayDoneCount(habit) {
      const e = getEntry(habit, todayStr());
      return e ? e.parts.filter(Boolean).length : 0;
    }
    function monthFullDays(habit, year, month) {
      let n = 0;
      const dim = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        if (dayDepth(habit, fmt(new Date(year, month, d))) >= 1) n++;
      }
      return n;
    }
    function streak(habit) {
      let s = 0;
      const cur = new Date();
      // 今天若未完成，从昨天算起
      if (dayDepth(habit, fmt(cur)) < 1) cur.setDate(cur.getDate() - 1);
      while (dayDepth(habit, fmt(cur)) >= 1) {
        s++;
        cur.setDate(cur.getDate() - 1);
        if (s > 3660) break;
      }
      return s;
    }

    // ---------- 状态 ----------
    let selHabitId = habits.length ? habits[0].id : null;
    const now = new Date();
    // 连续多月视图：起点 = 当前月往前推 VIEW_BACK；共 VIEW_MONTHS 个月
    const VIEW_BACK = 18;       // 往前 18 个月
    const VIEW_MONTHS = 36;     // 总共渲染 36 个月（前后各 18）
    let viewStartY = now.getFullYear();
    let viewStartM = now.getMonth() - VIEW_BACK;
    let selDate = todayStr();
    // 视图模式：'main' 主界面（活动习惯）/ 'archive-list' 已收官列表 / 'archive-detail' 已收官详情
    let viewMode = 'main';
    let archiveDetailId = null;
    // 编辑菜单里当前操作的目标习惯 id
    let sheetTargetId = null;

    function selHabit() { return habits.find((h) => h.id === selHabitId) || null; }

    // ---------- 渲染骨架 ----------
    container.innerHTML =
      '<div class="ci">' +
      '  <div class="ci-head" id="ci-head"></div>' +
      '  <div class="ci-body" id="ci-body">' +
      '    <section class="ci-view ci-main" id="ci-main">' +
      '      <div class="ci-habits" id="ci-habits"></div>' +
      '      <div class="ci-cal" id="ci-cal"></div>' +
      '      <div class="ci-detail" id="ci-detail"></div>' +
      '    </section>' +
      '    <section class="ci-view" id="ci-archive-list" hidden></section>' +
      '    <section class="ci-view" id="ci-archive-detail" hidden></section>' +
      '  </div>' +
      '  <div class="ci-modal" id="ci-modal" hidden>' +
      '    <div class="ci-modal-box">' +
      '      <h3>新建打卡</h3>' +
      '      <label class="ci-field"><span>名称</span>' +
      '        <input id="ci-name" type="text" maxlength="12" placeholder="如：喝水" autocomplete="off" /></label>' +
      '      <div class="ci-field"><span>图标</span>' +
      '        <div class="ci-icons" id="ci-icons"></div>' +
      '        <input id="ci-custom" type="text" maxlength="2" placeholder="或自填" /></div>' +
      '      <div class="ci-field"><span>每天分几份</span>' +
      '        <input id="ci-parts" type="number" min="1" max="20" value="4" /></div>' +
      '      <div class="ci-field"><span>各份任务内容（可留空，默认「第 N 份」）</span>' +
      '        <div id="ci-labels" class="ci-labels"></div></div>' +
      '      <div class="ci-modal-actions">' +
      '        <button class="btn ghost" id="ci-cancel" type="button">取消</button>' +
      '        <button class="btn" id="ci-save" type="button">创建</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ci-sheet" id="ci-sheet" hidden>' +
      '    <div class="ci-sheet-backdrop"></div>' +
      '    <div class="ci-sheet-box">' +
      '      <div class="ci-sheet-title" id="ci-sheet-title"></div>' +
      '      <button class="ci-sheet-act" data-act="edit-labels" type="button">✏️ 编辑每份名称</button>' +
      '      <button class="ci-sheet-act" data-act="makeup" type="button">🩹 补签</button>' +
      '      <button class="ci-sheet-act" data-act="archive" type="button">📦 收官</button>' +
      '      <button class="ci-sheet-act danger" data-act="delete" type="button">🗑 删除</button>' +
      '      <button class="ci-sheet-act cancel" data-act="cancel" type="button">取消</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ci-modal" id="ci-edit-modal" hidden>' +
      '    <div class="ci-modal-box">' +
      '      <h3 id="ci-edit-title">编辑每份名称</h3>' +
      '      <p class="muted ci-edit-sub" id="ci-edit-sub"></p>' +
      '      <div class="ci-field">' +
      '        <span>名称</span>' +
      '        <input id="ci-edit-name" type="text" maxlength="12" placeholder="习惯名" autocomplete="off" />' +
      '      </div>' +
      '      <div class="ci-field"><span>每天分几份</span>' +
      '        <input id="ci-edit-parts" type="number" min="1" max="20" />' +
      '      </div>' +
      '      <div class="ci-field"><span>各份任务内容（可留空，默认「第 N 份」）</span>' +
      '        <div id="ci-edit-labels" class="ci-labels"></div>' +
      '      </div>' +
      '      <div class="ci-modal-actions">' +
      '        <button class="btn ghost" id="ci-edit-cancel" type="button">取消</button>' +
      '        <button class="btn" id="ci-edit-save" type="button">保存</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ci-modal" id="ci-makeup-modal" hidden>' +
      '    <div class="ci-modal-box">' +
      '      <h3>补签</h3>' +
      '      <p class="muted ci-edit-sub">为过去的某一天补打卡（按当时份数全部完成）。</p>' +
      '      <div class="ci-field"><span>选择日期</span>' +
      '        <input id="ci-makeup-date" type="date" />' +
      '      </div>' +
      '      <p class="muted ci-makeup-hint" id="ci-makeup-hint"></p>' +
      '      <div class="ci-modal-actions">' +
      '        <button class="btn ghost" id="ci-makeup-cancel" type="button">取消</button>' +
      '        <button class="btn" id="ci-makeup-save" type="button">确认补签</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    const habitsEl = container.querySelector('#ci-habits');
    const calEl = container.querySelector('#ci-cal');
    const detailEl = container.querySelector('#ci-detail');
    const modal = container.querySelector('#ci-modal');
    const sheet = container.querySelector('#ci-sheet');
    const headEl = container.querySelector('#ci-head');
    const mainView = container.querySelector('#ci-main');
    const archiveListView = container.querySelector('#ci-archive-list');
    const archiveDetailView = container.querySelector('#ci-archive-detail');
    const editModal = container.querySelector('#ci-edit-modal');
    const makeupModal = container.querySelector('#ci-makeup-modal');

    // ---------- 顶部头栏（按 viewMode 不同显示不同按钮） ----------
    function renderHead() {
      if (viewMode === 'main') {
        headEl.innerHTML =
          '<h2>打卡</h2>' +
          '<div class="ci-head-actions">' +
          '  <button class="btn ghost ci-archive-btn" type="button" data-act="archive-list">📦 已收官</button>' +
          '  <button class="btn ci-add" type="button">＋ 新建打卡</button>' +
          '</div>';
        headEl.querySelector('.ci-add').addEventListener('click', openModal);
        headEl.querySelector('[data-act="archive-list"]').addEventListener('click', () => {
          viewMode = 'archive-list';
          refresh();
        });
      } else if (viewMode === 'archive-list') {
        headEl.innerHTML =
          '<button class="icon-btn ci-back" type="button" data-act="back" title="返回">←</button>' +
          '<h2>已收官</h2>' +
          '<span class="ci-head-spacer"></span>';
        headEl.querySelector('[data-act="back"]').addEventListener('click', () => {
          viewMode = 'main';
          refresh();
        });
      } else if (viewMode === 'archive-detail') {
        const h = archived.find((x) => x.id === archiveDetailId);
        headEl.innerHTML =
          '<button class="icon-btn ci-back" type="button" data-act="back" title="返回">←</button>' +
          '<h2>' + App.escapeHtml(h ? h.icon + ' ' + h.name : '已收官') + '</h2>' +
          '<span class="ci-head-spacer"></span>';
        headEl.querySelector('[data-act="back"]').addEventListener('click', () => {
          viewMode = 'archive-list';
          archiveDetailId = null;
          refresh();
        });
      }
    }

    // ---------- 习惯列表 ----------
    function paintHabits() {
      if (!habits.length) {
        habitsEl.innerHTML = '<p class="muted ci-empty">还没有打卡，点右上角「＋ 新建打卡」。</p>';
        return;
      }
      habitsEl.innerHTML = habits.map((h) => {
        const done = todayDoneCount(h);
        const active = h.id === selHabitId ? ' active' : '';
        return '<div class="ci-habit' + active + '" data-id="' + h.id + '">' +
          '<button class="ci-habit-main" type="button" data-id="' + h.id + '">' +
          '  <span class="ci-habit-ic">' + App.escapeHtml(h.icon) + '</span>' +
          '  <span class="ci-habit-name">' + App.escapeHtml(h.name) + '</span>' +
          '  <span class="ci-habit-prog">' + done + '/' + h.parts + '</span>' +
          '</button>' +
          '<button class="ci-habit-menu" type="button" data-menu="' + h.id + '" title="编辑" aria-label="编辑 ' + App.escapeHtml(h.name) + '">⋯</button>' +
          '</div>';
      }).join('');
    }

    // ---------- 已收官列表 ----------
    function paintArchiveList() {
      if (!archived.length) {
        archiveListView.innerHTML = '<p class="muted ci-empty">还没有已收官的习惯。</p>';
        return;
      }
      // 按收官时间倒序
      const sorted = archived.slice().sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
      archiveListView.innerHTML = sorted.map((h) => {
        const days = (h.successDates || []).length;
        return '<button class="ci-archive-item" type="button" data-id="' + h.id + '">' +
          '<span class="ci-archive-ic">' + App.escapeHtml(h.icon) + '</span>' +
          '<span class="ci-archive-meta">' +
          '  <span class="ci-archive-name">' + App.escapeHtml(h.name) + '</span>' +
          '  <span class="ci-archive-sub">收官于 ' + App.escapeHtml(h.archivedAt || '—') + ' · 打卡 ' + days + ' 天</span>' +
          '</span>' +
          '<span class="ci-archive-arrow">›</span>' +
          '</button>';
      }).join('');
    }

    // ---------- 已收官详情 ----------
    function paintArchiveDetail(id) {
      const h = archived.find((x) => x.id === id);
      if (!h) { archiveDetailView.innerHTML = '<p class="muted">未找到此习惯。</p>'; return; }
      const successList = (h.successDates || []).slice().sort();
      const successCount = successList.length;
      // 顶部信息卡
      let html = '<div class="ci-archive-info">' +
        '<div class="ci-archive-info-row"><span class="muted">创建时间</span><span>' + App.escapeHtml(h.createdAt || '—') + '</span></div>' +
        '<div class="ci-archive-info-row"><span class="muted">收官时间</span><span>' + App.escapeHtml(h.archivedAt || '—') + '</span></div>' +
        '<div class="ci-archive-info-row"><span class="muted">成功打卡</span><span>' + successCount + ' 天</span></div>' +
        '<div class="ci-archive-info-row"><span class="muted">每天份数</span><span>' + (h.parts || 1) + ' 份</span></div>' +
        '</div>';
      // 成功日期列表
      html += '<div class="ci-archive-section-title">成功打卡日期</div>';
      if (successList.length) {
        html += '<div class="ci-archive-dates">' + successList.map((d) =>
          '<span class="ci-archive-date">' + App.escapeHtml(d) + '</span>'
        ).join('') + '</div>';
      } else {
        html += '<p class="muted ci-empty">无成功打卡记录。</p>';
      }
      // 完整日历（只读）：用 habit 视图的 paintCalendar 同款布局，传入 archived 的 records
      html += '<div class="ci-archive-section-title">打卡日历</div>' +
              '<div class="ci-cal ci-archive-cal" id="ci-archive-cal-inner"></div>';
      archiveDetailView.innerHTML = html;
      // 用同一渲染函数画日历
      paintArchiveCalendar(h);
    }
    // 把已收官习惯的 records 临时挂到 records[h.id]，复用 paintCalendar / updateDayCell（只画、不动其它习惯）
    function paintArchiveCalendar(h) {
      const cal = container.querySelector('#ci-archive-cal-inner');
      if (!cal) return;
      // 临时把 selHabit 切到这个 archived 习惯以便 paintCalendar 找到 records
      // 注意：paintCalendar 用 selHabit()，所以我们临时把数据塞进去
      const origSel = selHabitId;
      const origRecords = records[h.id];
      // 把 archived 的 records 合并到 records（不污染其它习惯）
      records[h.id] = h.records || {};
      // 临时把 habits 数组里也加一个虚拟条目
      const tmpIdx = habits.findIndex((x) => x.id === h.id);
      const origHabitsEntry = tmpIdx >= 0 ? habits[tmpIdx] : null;
      if (tmpIdx < 0) habits.push(h); else habits[tmpIdx] = h;
      selHabitId = h.id;
      // 复用 paintCalendar / drawMonthLabels（它直接用 selHabit()）
      // 临时改 calEl 指向 archive-cal-inner
      const origCalEl = calEl;
      const realCal = container.querySelector('#ci-cal');
      // 不能简单替换 calEl：paintCalendar 用的是 calEl（const）
      // 改方案：直接画到 archive-cal 里
      const headHtml = '<div class="ci-cal-head">' +
        '<span class="ci-month-tag"></span>' +
        WD.map((w) => '<span class="ci-weekday">' + w + '</span>').join('') +
        '</div>';
      const firstD = new Date(viewStartY, viewStartM, 1);
      const lead = firstD.getDay();
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(null);
      for (let i = 0; i < VIEW_MONTHS; i++) {
        const { y, m } = normYearMonth(i);
        const dim = new Date(y, m + 1, 0).getDate();
        for (let d = 1; d <= dim; d++) cells.push({ y, m, d });
      }
      while (cells.length % 7 !== 0) cells.push(null);
      const rows = cells.length / 7;
      let body = '<div class="ci-grid-wrap"><div class="ci-grid">';
      const t = todayStr();
      for (let r = 0; r < rows; r++) {
        const row = cells.slice(r * 7, (r + 1) * 7);
        body += '<span class="ci-month-tag"></span>';
        for (let c = 0; c < 7; c++) {
          const cell = row[c];
          if (!cell) { body += '<span class="ci-day empty"></span>'; continue; }
          const ds = cell.y + '-' + pad(cell.m + 1) + '-' + pad(cell.d);
          const depth = dayDepth(h, ds);
          const cls = ['ci-day'];
          if (cell.d === 1) cls.push('month-start');
          if ((cell.m + 1) % 2 === 1) cls.push('m-odd'); else cls.push('m-even');
          if (ds === t) cls.push('today');
          if (depth >= 1) cls.push('full');
          body += '<span class="' + cls.join(' ') + '" data-date="' + ds +
            '" data-y="' + cell.y + '" data-m="' + cell.m + '" style="--depth:' + depth + '">' +
            '<span class="ci-day-num">' + cell.d + '</span>' +
            '<span class="ci-day-fill"></span>' +
            '</span>';
        }
      }
      body += '</div></div>';
      cal.innerHTML = headHtml + body;
      // 计算月份标签（复用 drawMonthLabels 但作用到 archive-cal 的 wrap）
      drawMonthLabelsIn(cal);
      // 滚到今天那行
      requestAnimationFrame(() => {
        const todayBtn = cal.querySelector('.ci-day[data-date="' + t + '"]');
        if (todayBtn) {
          const headH = (cal.querySelector('.ci-cal-head') || {}).offsetHeight || 0;
          const cs = getComputedStyle(cal);
          const borderT = cal.clientTop || 0;
          const padT = parseFloat(cs.paddingTop) || 0;
          const calRect = cal.getBoundingClientRect();
          const aRect = todayBtn.getBoundingClientRect();
          const rowCenterInCal = (aRect.top + aRect.height / 2) - (calRect.top + borderT + padT) + cal.scrollTop;
          const target = Math.max(0, rowCenterInCal - (cal.clientHeight + headH) / 2);
          cal.scrollTo({ top: target, behavior: 'auto' });
        }
      });
      // 还原状态
      if (origHabitsEntry) habits[tmpIdx] = origHabitsEntry; else habits.splice(habits.indexOf(h), 1);
      if (origRecords) records[h.id] = origRecords; else delete records[h.id];
      selHabitId = origSel;
    }
    // drawMonthLabels 的复用版：接受任意容器
    function drawMonthLabelsIn(cal) {
      const wrap = cal.querySelector('.ci-grid-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.ci-mlabel').forEach((e) => e.remove());
      const days = Array.from(wrap.querySelectorAll('.ci-grid .ci-day:not(.empty)'));
      if (!days.length) return;
      const months = [];
      days.forEach((btn) => {
        const key = btn.dataset.y + '-' + btn.dataset.m;
        let g = months[months.length - 1];
        if (!g || g.key !== key) { g = { key: key, y: +btn.dataset.y, m: +btn.dataset.m, first: btn, last: btn }; months.push(g); }
        else { g.last = btn; }
      });
      const wrapRect = wrap.getBoundingClientRect();
      months.forEach((mo) => {
        const a = mo.first.getBoundingClientRect();
        const b = mo.last.getBoundingClientRect();
        const cy = (a.top + b.bottom) / 2 - wrapRect.top;
        const div = document.createElement('div');
        div.className = 'ci-mlabel';
        div.textContent = (mo.m + 1) + '月';
        div.style.top = cy + 'px';
        div.style.left = '0px';
        wrap.appendChild(div);
      });
    }

    // ---------- 日历 ----------
    const WD = ['日', '一', '二', '三', '四', '五', '六'];
    // 把 (viewStartY, viewStartM + offset) 标准化为实际年月
    function normYearMonth(offset) {
      const totalM = viewStartM + offset;
      const y = viewStartY + Math.floor(totalM / 12);
      const m = ((totalM % 12) + 12) % 12;
      return { y, m };
    }
    function monthTagText(y, m) { return (m + 1) + '月'; }
    // 渲染连续日历：把可见范围内的所有月份拼成一个 7 列连续网格（不再分块）。
    // 仅在视区最前面按"首月 1 号是星期几"留空，之后所有日期自然顺排，
    // 因此每个月的 1 号必然落在它真实的星期列上（新年第一天也不会错位）。
    function paintCalendar() {
      const h = selHabit();
      if (!h) { calEl.innerHTML = ''; return; }
      // 顶部统一的星期表头（吸顶）：月份标签列 + 日一二三四五六
      const headHtml = '<div class="ci-cal-head">' +
        '<span class="ci-month-tag"></span>' +
        WD.map((w) => '<span class="ci-weekday">' + w + '</span>').join('') +
        '</div>';
      // 连续铺排：首月 1 号前按星期几留空，之后逐月逐日顺排
      const firstD = new Date(viewStartY, viewStartM, 1);
      const lead = firstD.getDay();          // 0=日 … 6=六：视区首月 1 号前面要留几个空
      const cells = [];
      for (let i = 0; i < lead; i++) cells.push(null);
      for (let i = 0; i < VIEW_MONTHS; i++) {
        const { y, m } = normYearMonth(i);
        const dim = new Date(y, m + 1, 0).getDate();
        for (let d = 1; d <= dim; d++) cells.push({ y, m, d });
      }
      while (cells.length % 7 !== 0) cells.push(null);   // 末尾补满成整行
      const rows = cells.length / 7;
      const t = todayStr();
      let body = '<div class="ci-grid-wrap"><div class="ci-grid">';
      for (let r = 0; r < rows; r++) {
        const row = cells.slice(r * 7, (r + 1) * 7);
        // 左侧 32px 月份标签列：仅作占位（保持网格列宽）；月份文字由 drawMonthLabels 以竖向居中方式绘制
        body += '<span class="ci-month-tag"></span>';
        for (let c = 0; c < 7; c++) {
          const cell = row[c];
          if (!cell) { body += '<span class="ci-day empty"></span>'; continue; }
          const ds = cell.y + '-' + pad(cell.m + 1) + '-' + pad(cell.d);
          const depth = dayDepth(h, ds);
          const cls = ['ci-day'];
          if (cell.d === 1) cls.push('month-start');
          // 月份奇偶着色：奇数月深一点、偶数月浅一点
          if ((cell.m + 1) % 2 === 1) cls.push('m-odd'); else cls.push('m-even');
          if (ds === t) cls.push('today');
          if (ds === selDate) cls.push('selected');
          if (depth >= 1) cls.push('full');
          body += '<button class="' + cls.join(' ') + '" type="button" data-date="' + ds +
            '" data-y="' + cell.y + '" data-m="' + cell.m + '" style="--depth:' + depth + '">' +
            '<span class="ci-day-num">' + cell.d + '</span>' +
            '<span class="ci-day-fill"></span>' +
            '</button>';
        }
      }
      body += '</div></div>';
      calEl.innerHTML = headHtml + body;
      drawMonthLabels();
    }
    // 只更新某一天格子的完成度（不重渲整片日历，避免确认打卡时日历跳动）
    function updateDayCell(ds) {
      const h = selHabit();
      if (!h) return;
      const btn = calEl.querySelector('.ci-day[data-date="' + ds + '"]');
      if (!btn) return;
      const depth = dayDepth(h, ds);
      btn.style.setProperty('--depth', depth);
      btn.classList.toggle('full', depth >= 1);
    }
    // 在每个月区块的垂直中心、左列绘制竖向居中的月份标签（放进 .ci-grid-wrap 内，
    // 让标签跟随日期网格一起滚动 —— 之前直接挂在日历小窗上，absolute 不随内容滚，导致标签错位）
    function drawMonthLabels() {
      const wrap = calEl.querySelector('.ci-grid-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.ci-mlabel').forEach((e) => e.remove());
      if (!calEl.isConnected) return;
      const days = Array.from(wrap.querySelectorAll('.ci-grid .ci-day:not(.empty)'));
      if (!days.length) return;
      // 按 年-月 分组，取每个月首/末按钮
      const months = [];
      days.forEach((btn) => {
        const key = btn.dataset.y + '-' + btn.dataset.m;
        let g = months[months.length - 1];
        if (!g || g.key !== key) { g = { key: key, y: +btn.dataset.y, m: +btn.dataset.m, first: btn, last: btn }; months.push(g); }
        else { g.last = btn; }
      });
      // 用 wrap 的视口坐标作参考 —— wrap 跟随 calEl 滚动，因此 (btn.top - wrapRect.top)
      // 即"在 wrap 内的内容偏移"，是稳定的；绝对定位 left:0 + top:cy 就让标签跟着内容一起滚
      const wrapRect = wrap.getBoundingClientRect();
      months.forEach((mo) => {
        const a = mo.first.getBoundingClientRect();
        const b = mo.last.getBoundingClientRect();
        const cy = (a.top + b.bottom) / 2 - wrapRect.top;   // 每月区块在 wrap 内的垂直中心
        const div = document.createElement('div');
        div.className = 'ci-mlabel';
        div.textContent = (mo.m + 1) + '月';
        div.style.top = cy + 'px';
        div.style.left = '0px';
        wrap.appendChild(div);
      });
    }
    // 窗口尺寸变化时重算月份标签位置
    let monthLabelRaf = 0;
    window.addEventListener('resize', () => {
      if (monthLabelRaf) cancelAnimationFrame(monthLabelRaf);
      monthLabelRaf = requestAnimationFrame(() => {
        if (calEl.isConnected) drawMonthLabels();
      });
    });
    // 把日历滚动到"今天所在行"并居中（首次打开/新项目时使用，避开吸顶星期表头）
    function scrollToToday() {
      const cur = todayStr();
      const anchor = calEl.querySelector('.ci-day[data-date="' + cur + '"]');
      if (!anchor) return;
      const headH = (calEl.querySelector('.ci-cal-head') || {}).offsetHeight || 0;
      const cs = getComputedStyle(calEl);
      const borderT = calEl.clientTop || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      const calRect = calEl.getBoundingClientRect();
      const aRect = anchor.getBoundingClientRect();
      // 今天那行在 calEl 内容中的垂直中心
      const rowCenterInCal = (aRect.top + aRect.height / 2) - (calRect.top + borderT + padT) + calEl.scrollTop;
      // 视口中心放在吸顶表头之下：让今天那行居中于"表头底 ~ 小窗底"这段可视区
      const target = Math.max(0, rowCenterInCal - (calEl.clientHeight + headH) / 2);
      calEl.scrollTo({ top: target, behavior: 'auto' });
    }

    // ---------- 选中某天的明细（下方点亮份数） ----------
    function paintDetail() {
      const h = selHabit();
      if (!h) { detailEl.innerHTML = ''; return; }
      const ds = selDate;
      const arr = getDayArr(h, ds);
      const isToday = ds === todayStr();
      const locked = !isToday;
      const done = arr.filter(Boolean).length;
      const allDone = !locked && done === h.parts;
      const confirmed = isDayDone(h, ds);

      // 优化：若现有 DOM 已是 .all-done 圆按钮、且新状态仍为 allDone，
      // 仅在 pending ↔ confirmed 之间切 `.confirmed`（不再触发 morph 动画重跑）
      const existingAllDoneEl = detailEl.querySelector('.ci-parts.all-done');
      if (existingAllDoneEl && allDone) {
        const wasConfirmed = existingAllDoneEl.classList.contains('confirmed');
        if (wasConfirmed !== confirmed) {
          existingAllDoneEl.classList.toggle('confirmed', confirmed);
          existingAllDoneEl.setAttribute('aria-label',
            confirmed ? '今日已完成，点击取消' : '小任务已全部完成，点击确认打卡');
        }
        return;
      }

      let html = '';
      if (locked) {
        html += '<p class="ci-locked">' +
          (isPast(ds) ? '悟已往之不谏，知来者之可追。' : '尚未到来。') +
          '</p>';
      } else if (allDone) {
        // 全部点亮 → 触发 ci-morph 动画：
        //   - 同时渲染小任务方框（顶层 ci-fade-out 把它淡出）
        //   - 同时渲染 ✓ 标记（顶层 ci-check-pop 延迟弹出）
        const labels = (h.labels && h.labels.length === h.parts)
          ? h.labels
          : arr.map((_, i) => '第' + (i + 1) + '份');
        html += '<div class="ci-parts all-done' + (confirmed ? ' confirmed' : '') + '" ' +
          'role="button" tabindex="0" ' +
          'aria-label="' + (confirmed ? '今日已完成，点击取消' : '小任务已全部完成，点击确认打卡') + '">';
        arr.forEach((on, i) => {
          html += '<div class="ci-part-wrap">' +
            '<button class="ci-part on" type="button" disabled tabindex="-1">' +
            '<span class="ci-part-text">' + App.escapeHtml(labels[i] || '') + '</span>' +
            '</button>' +
            '</div>';
        });
        html += '<span class="ci-done-mark">✓</span>';
        html += '</div>';
      } else {
        html += '<div class="ci-parts">';
        const labels = (h.labels && h.labels.length === h.parts)
          ? h.labels
          : arr.map((_, i) => '第' + (i + 1) + '份');
        arr.forEach((on, i) => {
          html += '<div class="ci-part-wrap">' +
            '<button class="ci-part' + (on ? ' on' : '') + '" type="button" data-i="' + i + '">' +
            '<span class="ci-part-text">' + App.escapeHtml(labels[i] || '') + '</span>' +
            '</button>' +
            '</div>';
        });
        html += '</div>';
      }
      detailEl.innerHTML = html;
    }

    function refresh() {
      renderHead();
      mainView.hidden = viewMode !== 'main';
      archiveListView.hidden = viewMode !== 'archive-list';
      archiveDetailView.hidden = viewMode !== 'archive-detail';
      if (viewMode === 'main') {
        paintHabits(); paintCalendar(); paintDetail();
        // 每次进入主视图都把日历滚回今天（即使之前手动挪动过）
        requestAnimationFrame(() => { if (calEl.isConnected) scrollToToday(); });
      } else if (viewMode === 'archive-list') {
        paintArchiveList();
      } else if (viewMode === 'archive-detail') {
        paintArchiveDetail(archiveDetailId);
      }
    }

    // ---------- 交互 ----------
    habitsEl.addEventListener('click', (e) => {
      // 点 ⋯ 编辑按钮 → 打开操作菜单
      const menuBtn = e.target.closest('[data-menu]');
      if (menuBtn) {
        e.stopPropagation();
        openEditSheet(menuBtn.dataset.menu);
        return;
      }
      // 否则点习惯主体 → 切换到该习惯
      const b = e.target.closest('.ci-habit-main[data-id]');
      if (!b) return;
      const newId = b.dataset.id;
      selDate = todayStr();
      selHabitId = newId;
      paintHabits(); paintCalendar(); paintDetail();
      // 切到任一习惯都把日历滚回今天（用户要求：哪怕之前挪动过也要刷新）
      requestAnimationFrame(() => { if (calEl.isConnected) scrollToToday(); });
    });

    // 点击已收官列表项 → 进入详情
    archiveListView.addEventListener('click', (e) => {
      const b = e.target.closest('.ci-archive-item[data-id]');
      if (!b) return;
      archiveDetailId = b.dataset.id;
      viewMode = 'archive-detail';
      refresh();
    });

    calEl.addEventListener('click', (e) => {
      const day = e.target.closest('[data-date]');
      if (!day) return;
      const ds = day.dataset.date;
      selDate = ds;
      const h = selHabit();
      // 单份任务：点日历今天即直接切换完成（过去/未来不可点）
      if (h && h.parts === 1 && ds === todayStr()) {
        const arr = getDayArr(h, ds);
        arr[0] = !arr[0];
        saveRecords();
        updateDayCell(ds);
        if (arr[0]) App.toast('已打卡 ✓');
      }
      // 只更新选中态（不重渲整片日历）
      calEl.querySelectorAll('.ci-day.selected').forEach((el) => el.classList.remove('selected'));
      day.classList.add('selected');
      paintDetail();
    });

    detailEl.addEventListener('click', (e) => {
      // 圆形「确认按钮」：pending 时按下=确认（变深 + 日历加深）；confirmed 时按下=取消
      const allDoneEl = e.target.closest('.ci-parts.all-done');
      if (allDoneEl) {
        const h = selHabit();
        if (!h || selDate !== todayStr()) return;
        const entry = getEntry(h, selDate);
        if (!entry) return;
        if (entry.done) {
          // 取消：清空所有小任务回到"未点亮"状态（测试便利、可一键重做）
          entry.done = false;
          entry.parts.fill(false);
          saveRecords();
          updateDayCell(selDate);
          paintDetail();   // 回到带方框（未点亮）的初始态
          App.toast('已重置今日打卡');
        } else {
          // 确认：仅切 .confirmed class + 日历变深，不重跑 morph 动画
          entry.done = true;
          saveRecords();
          updateDayCell(selDate);
          allDoneEl.classList.add('confirmed');
          allDoneEl.setAttribute('aria-label', '今日已完成，点击取消');
          App.toast('已完成打卡 ✓');
        }
        return;
      }
      const p = e.target.closest('[data-i]');
      if (!p || p.disabled) return;
      const h = selHabit();
      if (!h || selDate !== todayStr()) return;
      const arr = getDayArr(h, selDate);
      const i = +p.dataset.i;
      arr[i] = !arr[i];
      saveRecords();
      const done = arr.filter(Boolean).length;
      // 小任务进度不自动驱动日历颜色（要等按下确认按钮）；只重渲详情
      paintDetail();
      if (done === h.parts) App.toast('小任务已全部完成，点下方按钮确认打卡');
    });

    // 圆形按钮的键盘支持（tabindex=0 + Enter/Space）
    detailEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('.ci-parts.all-done');
      if (!el) return;
      e.preventDefault();
      el.click();
    });

    // ---------- 新建打卡 ----------
    const ICONS = ['💧', '🏃', '📚', '🧘', '💊', '🌿', '⏰', '🍎', '😴', '✍️'];
    let pickIcon = ICONS[0];
    function renderLabelInputs() {
      let n = parseInt(modal.querySelector('#ci-parts').value, 10);
      if (!n || n < 1) n = 1; if (n > 20) n = 20;
      const wrap = modal.querySelector('#ci-labels');
      wrap.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.maxLength = 12;
        inp.placeholder = '第' + (i + 1) + '份';
        inp.className = 'ci-label-input';
        inp.dataset.i = i;
        wrap.appendChild(inp);
      }
    }
    function openModal() {
      modal.hidden = false;
      const icWrap = modal.querySelector('#ci-icons');
      icWrap.innerHTML = ICONS.map((ic) =>
        '<button type="button" class="ci-ic' + (ic === pickIcon ? ' on' : '') + '" data-ic="' + ic + '">' + ic + '</button>'
      ).join('');
      modal.querySelector('#ci-name').value = '';
      modal.querySelector('#ci-custom').value = '';
      modal.querySelector('#ci-parts').value = 4;
      renderLabelInputs();
    }
    function closeModal() { modal.hidden = true; }
    modal.querySelector('#ci-icons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ic]'); if (!b) return;
      pickIcon = b.dataset.ic;
      modal.querySelector('#ci-custom').value = '';
      modal.querySelectorAll('.ci-ic').forEach((x) => x.classList.toggle('on', x.dataset.ic === pickIcon));
    });
    modal.querySelector('#ci-custom').addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (v) { pickIcon = v; modal.querySelectorAll('.ci-ic').forEach((x) => x.classList.remove('on')); }
    });
    // 份数变化时重渲输入框（输入变化时立刻同步，不丢已写内容）
    modal.querySelector('#ci-parts').addEventListener('input', renderLabelInputs);
    modal.querySelector('#ci-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector('#ci-save').addEventListener('click', () => {
      const name = modal.querySelector('#ci-name').value.trim();
      let parts = parseInt(modal.querySelector('#ci-parts').value, 10);
      if (!name) { App.toast('请填写名称'); return; }
      if (!parts || parts < 1) parts = 1; if (parts > 20) parts = 20;
      // 读取每份的文字描述；空字符串留空（前端显示时回退到「第 N 份」）
      const labelInputs = modal.querySelectorAll('#ci-labels .ci-label-input');
      const labels = [];
      for (let i = 0; i < parts; i++) {
        const v = labelInputs[i] && labelInputs[i].value.trim();
        labels.push(v || '');
      }
      const habit = { id: 'h' + Date.now(), name: name, icon: pickIcon, parts: parts, labels: labels, createdAt: todayStr() };
      habits.push(habit); saveHabits();
      selHabitId = habit.id;
      closeModal();
      App.toast('已新建打卡：' + name);
      refresh();
    });

    // ---------- 编辑菜单（收官 / 删除） ----------
    function openEditSheet(id) {
      const h = habits.find((x) => x.id === id) || archived.find((x) => x.id === id);
      if (!h) return;
      sheetTargetId = id;
      sheet.querySelector('#ci-sheet-title').textContent = (h.icon || '') + ' ' + (h.name || '');
      sheet.hidden = false;
    }
    function closeEditSheet() {
      sheet.hidden = true;
      sheetTargetId = null;
    }
    sheet.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'cancel') { closeEditSheet(); return; }
      if (!sheetTargetId) { closeEditSheet(); return; }
      if (a === 'edit-labels') {
        openEditLabelsModal(sheetTargetId);
        closeEditSheet();
      } else if (a === 'makeup') {
        openMakeupModal(sheetTargetId);
        closeEditSheet();
      } else if (a === 'archive') {
        if (confirm('确定收官「' + (habits.find((x) => x.id === sheetTargetId) || {}).name + '」？\n收官后可在「已收官」中查看历史记录。')) {
          archiveHabit(sheetTargetId);
        }
        closeEditSheet();
      } else if (a === 'delete') {
        const h = habits.find((x) => x.id === sheetTargetId);
        if (!h) { closeEditSheet(); return; }
        if (confirm('确定删除「' + h.name + '」？\n此操作不可恢复，所有打卡记录将一并删除。')) {
          deleteHabit(sheetTargetId);
        }
        closeEditSheet();
      }
    });
    // 收官：习惯移到 archived，records 一起搬过去
    function archiveHabit(id) {
      const idx = habits.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const h = habits[idx];
      const rec = records[id] || {};
      const successDates = Object.keys(rec).filter((d) => rec[d] && rec[d].done).sort();
      const archivedHabit = Object.assign({}, h, {
        archivedAt: todayStr(),
        records: rec,
        successDates: successDates,
      });
      archived.push(archivedHabit);
      saveArchived();
      // 从活动列表移除
      habits.splice(idx, 1);
      saveHabits();
      delete records[id];
      saveRecords();
      // 切换到下一个活动习惯
      selHabitId = habits.length ? habits[0].id : null;
      selDate = todayStr();
      App.toast('已收官：' + h.name);
      refresh();
    }
    // 删除：习惯 + records 全部清掉
    function deleteHabit(id) {
      const idx = habits.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const h = habits[idx];
      habits.splice(idx, 1);
      saveHabits();
      delete records[id];
      saveRecords();
      selHabitId = habits.length ? habits[0].id : null;
      selDate = todayStr();
      App.toast('已删除：' + h.name);
      refresh();
    }

    // ---------- 编辑每份名称 ----------
    let editTargetId = null;
    function renderEditLabels(parts, labels) {
      const wrap = editModal.querySelector('#ci-edit-labels');
      wrap.innerHTML = '';
      for (let i = 0; i < parts; i++) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.maxLength = 12;
        inp.placeholder = '第' + (i + 1) + '份';
        inp.className = 'ci-label-input';
        inp.value = (labels && labels[i]) ? labels[i] : '';
        inp.dataset.i = i;
        wrap.appendChild(inp);
      }
    }
    function openEditLabelsModal(id) {
      const h = habits.find((x) => x.id === id);
      if (!h) return;
      editTargetId = id;
      editModal.querySelector('#ci-edit-title').textContent = '编辑「' + (h.icon || '') + ' ' + h.name + '」';
      editModal.querySelector('#ci-edit-sub').textContent = '可修改名称和每一份的任务内容；份数变化会按现有对应关系保留。';
      editModal.querySelector('#ci-edit-name').value = h.name || '';
      editModal.querySelector('#ci-edit-parts').value = h.parts;
      renderEditLabels(h.parts, h.labels || []);
      editModal.hidden = false;
    }
    function closeEditModal() { editModal.hidden = true; editTargetId = null; }
    editModal.querySelector('#ci-edit-parts').addEventListener('input', () => {
      // 份数变化时只重渲输入框（已写内容按 i 保留，越界部分丢弃）
      const inputs = Array.from(editModal.querySelectorAll('#ci-edit-labels .ci-label-input'));
      const keep = inputs.map((i) => i.value);
      let n = parseInt(editModal.querySelector('#ci-edit-parts').value, 10);
      if (!n || n < 1) n = 1; if (n > 20) n = 20;
      renderEditLabels(n, keep);
    });
    editModal.querySelector('#ci-edit-cancel').addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });
    editModal.querySelector('#ci-edit-save').addEventListener('click', () => {
      const h = habits.find((x) => x.id === editTargetId);
      if (!h) { closeEditModal(); return; }
      const name = editModal.querySelector('#ci-edit-name').value.trim() || h.name;
      const newParts = parseInt(editModal.querySelector('#ci-edit-parts').value, 10) || h.parts;
      const newLabels = [];
      const inputs = editModal.querySelectorAll('#ci-edit-labels .ci-label-input');
      for (let i = 0; i < newParts; i++) {
        newLabels.push((inputs[i] && inputs[i].value.trim()) || '');
      }
      // 1) 名称
      h.name = name;
      // 2) 份数变化：迁移所有 records（按 i 保留现有 parts[i]；新增的为 false；减少则丢弃超出部分）
      if (newParts !== h.parts) {
        const rec = records[h.id] || {};
        Object.keys(rec).forEach((ds) => {
          const e = rec[ds];
          if (!e) return;
          const oldParts = (e.parts && e.parts.length) || h.parts;
          const fixed = new Array(newParts).fill(false);
          for (let i = 0; i < Math.min(newParts, oldParts); i++) fixed[i] = !!e.parts[i];
          e.parts = fixed;
          // done 仅在份数变化后仍能完全完成时保留
          if (e.done && !fixed.every(Boolean)) e.done = false;
        });
        records[h.id] = rec;
        h.parts = newParts;
        saveRecords();
      }
      // 3) 标签
      h.labels = newLabels;
      saveHabits();
      closeEditModal();
      App.toast('已保存「' + h.name + '」');
      refresh();
    });

    // ---------- 补签 ----------
    let makeupTargetId = null;
    function openMakeupModal(id) {
      const h = habits.find((x) => x.id === id);
      if (!h) return;
      makeupTargetId = id;
      // 默认日期 = 昨天
      const y = new Date(); y.setDate(y.getDate() - 1);
      const def = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
      const dateInput = makeupModal.querySelector('#ci-makeup-date');
      dateInput.value = def;
      // 限制可选范围：仅过去日期（昨天起往前）到记录起点（用习惯创建时间）
      const today = todayStr();
      const min = (h.createdAt && h.createdAt <= today) ? h.createdAt : (function () {
        // 最早有记录的日期
        const rec = records[h.id] || {};
        const keys = Object.keys(rec);
        if (keys.length) return keys.sort()[0];
        return today;
      })();
      dateInput.min = min;
      dateInput.max = today;
      // 上限取 min(创建时间, 今天)
      const hint = makeupModal.querySelector('#ci-makeup-hint');
      hint.textContent = '将把所选日期的 ' + h.parts + ' 份全部标记为完成（仅过去日期可补签）。';
      makeupModal.hidden = false;
    }
    function closeMakeupModal() { makeupModal.hidden = true; makeupTargetId = null; }
    makeupModal.querySelector('#ci-makeup-cancel').addEventListener('click', closeMakeupModal);
    makeupModal.addEventListener('click', (e) => { if (e.target === makeupModal) closeMakeupModal(); });
    makeupModal.querySelector('#ci-makeup-save').addEventListener('click', () => {
      const h = habits.find((x) => x.id === makeupTargetId);
      if (!h) { closeMakeupModal(); return; }
      const ds = makeupModal.querySelector('#ci-makeup-date').value;
      if (!ds) { App.toast('请选择日期'); return; }
      const t = todayStr();
      if (ds > t) { App.toast('只能为过去日期补签'); return; }
      const rec = records[h.id] || (records[h.id] = {});
      const arr = new Array(h.parts).fill(false);
      for (let i = 0; i < h.parts; i++) arr[i] = true;   // 全部完成
      rec[ds] = { parts: arr, done: true };
      saveRecords();
      closeMakeupModal();
      App.toast('已为 ' + ds + ' 补签「' + h.name + '」');
      // 刷新：日历该日加深 + 切到该日展示
      selDate = ds;
      paintCalendar();
      paintDetail();
      // 滚到补签日所在行（按 calEl 当前可视区定位）
      requestAnimationFrame(() => {
        const anchor = calEl.querySelector('.ci-day[data-date="' + ds + '"]');
        if (anchor) {
          anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    });

    // ---------- 首次渲染 ----------
    refresh();
  }
});
