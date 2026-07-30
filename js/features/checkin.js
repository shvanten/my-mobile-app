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

    let habits = loadHabits();
    let records = loadRecords();

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
    let viewY = now.getFullYear();
    let viewM = now.getMonth();
    let selDate = todayStr();

    function selHabit() { return habits.find((h) => h.id === selHabitId) || null; }

    // ---------- 渲染骨架 ----------
    container.innerHTML =
      '<div class="ci">' +
      '  <div class="ci-head">' +
      '    <h2>打卡</h2>' +
      '    <button class="btn ci-add" type="button">＋ 新建打卡</button>' +
      '  </div>' +
      '  <div class="ci-habits" id="ci-habits"></div>' +
      '  <div class="ci-cal" id="ci-cal"></div>' +
      '  <div class="ci-detail" id="ci-detail"></div>' +
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
      '</div>';

    const habitsEl = container.querySelector('#ci-habits');
    const calEl = container.querySelector('#ci-cal');
    const detailEl = container.querySelector('#ci-detail');
    const modal = container.querySelector('#ci-modal');

    // ---------- 习惯列表 ----------
    function paintHabits() {
      if (!habits.length) {
        habitsEl.innerHTML = '<p class="muted ci-empty">还没有打卡，点右上角「＋ 新建打卡」。</p>';
        return;
      }
      habitsEl.innerHTML = habits.map((h) => {
        const done = todayDoneCount(h);
        const active = h.id === selHabitId ? ' active' : '';
        return '<button class="ci-habit' + active + '" type="button" data-id="' + h.id + '">' +
          '<span class="ci-habit-ic">' + App.escapeHtml(h.icon) + '</span>' +
          '<span class="ci-habit-name">' + App.escapeHtml(h.name) + '</span>' +
          '<span class="ci-habit-prog">' + done + '/' + h.parts + '</span>' +
          '</button>';
      }).join('');
    }

    // ---------- 日历 ----------
    const WD = ['日', '一', '二', '三', '四', '五', '六'];
    function monthCells(y, m) {
      const first = new Date(y, m, 1);
      const startW = first.getDay();
      const dim = new Date(y, m + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < startW; i++) cells.push(null);
      for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));
      while (cells.length % 7 !== 0) cells.push(null);
      return cells;
    }
    function paintCalendar() {
      const h = selHabit();
      if (!h) { calEl.innerHTML = ''; return; }
      const cells = monthCells(viewY, viewM);
      const t = todayStr();
      let html = '<div class="ci-cal-head">' +
        '<button class="icon-btn" id="ci-prev" type="button">‹</button>' +
        '<span class="ci-cal-title">' + viewY + '年' + (viewM + 1) + '月</span>' +
        '<button class="icon-btn" id="ci-next" type="button">›</button>' +
        '</div>';
      html += '<div class="ci-week">' + WD.map((w) => '<span>' + w + '</span>').join('') + '</div>';
      html += '<div class="ci-grid">';
      cells.forEach((d) => {
        if (!d) { html += '<span class="ci-day empty"></span>'; return; }
        const ds = fmt(d);
        const depth = dayDepth(h, ds);
        const cls = ['ci-day'];
        if (ds === t) cls.push('today');
        if (ds === selDate) cls.push('selected');
        if (depth >= 1) cls.push('full');
        html += '<button class="' + cls.join(' ') + '" type="button" data-date="' + ds + '" style="--depth:' + depth + '">' +
          '<span class="ci-day-num">' + d.getDate() + '</span>' +
          '<span class="ci-day-fill"></span>' +
          '</button>';
      });
      html += '</div>';
      const full = monthFullDays(h, viewY, viewM);
      const st = streak(h);
      html += '<div class="ci-stat">连续 <b>' + st + '</b> 天 · 本月全勤 <b>' + full + '</b> 天</div>';
      calEl.innerHTML = html;
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

    function refresh() { paintHabits(); paintCalendar(); paintDetail(); }

    // ---------- 交互 ----------
    habitsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      selHabitId = b.dataset.id;
      // 切到该习惯的今天
      const t = new Date();
      viewY = t.getFullYear(); viewM = t.getMonth(); selDate = todayStr();
      refresh();
    });

    calEl.addEventListener('click', (e) => {
      if (e.target.closest('#ci-prev')) {
        viewM--; if (viewM < 0) { viewM = 11; viewY--; } paintCalendar(); paintDetail(); return;
      }
      if (e.target.closest('#ci-next')) {
        viewM++; if (viewM > 11) { viewM = 0; viewY++; } paintCalendar(); paintDetail(); return;
      }
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
        if (arr[0]) App.toast('已打卡 ✓');
      }
      paintCalendar(); paintDetail();
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
          paintCalendar();
          paintDetail();   // 回到带方框（未点亮）的初始态
          App.toast('已重置今日打卡');
        } else {
          // 确认：仅切 .confirmed class + 日历变深，不重跑 morph 动画
          entry.done = true;
          saveRecords();
          paintCalendar();
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
      const habit = { id: 'h' + Date.now(), name: name, icon: pickIcon, parts: parts, labels: labels };
      habits.push(habit); saveHabits();
      selHabitId = habit.id;
      closeModal();
      App.toast('已新建打卡：' + name);
      refresh();
    });

    container.querySelector('.ci-add').addEventListener('click', openModal);

    // ---------- 首次渲染 ----------
    refresh();
  }
});
