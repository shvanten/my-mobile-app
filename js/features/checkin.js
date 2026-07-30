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
    // 连续多月视图：起点 = 当前月往前推 VIEW_BACK；共 VIEW_MONTHS 个月
    const VIEW_BACK = 18;       // 往前 18 个月
    const VIEW_MONTHS = 36;     // 总共渲染 36 个月（前后各 18）
    let viewStartY = now.getFullYear();
    let viewStartM = now.getMonth() - VIEW_BACK;
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
      let body = '<div class="ci-grid">';
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
      body += '</div>';
      calEl.innerHTML = headHtml + body;
      drawSeparators();
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
    // 在月份交界处绘制"可弯折"虚线：沿上一月最后一天的下边缘 → 下一月首天左缘向下弯 → 下一月首行的上边缘
    function drawSeparators() {
      const old = calEl.querySelector('.ci-sep');
      if (old) old.remove();
      if (!calEl.isConnected) return;
      // 取全部有内容的日期按钮，按 年-月 分组（连续网格里每个月天然成一组）
      const days = Array.from(calEl.querySelectorAll('.ci-grid .ci-day:not(.empty)'));
      if (days.length < 2) return;
      const months = [];
      days.forEach((btn) => {
        const key = btn.dataset.y + '-' + btn.dataset.m;
        let g = months[months.length - 1];
        if (!g || g.key !== key) { g = { key: key, first: btn, last: btn }; months.push(g); }
        else { g.last = btn; }
      });
      if (months.length < 2) return;
      const cs = getComputedStyle(calEl);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      const borderT = calEl.clientTop || 0;
      const borderL = calEl.clientLeft || 0;
      const calRect = calEl.getBoundingClientRect();
      const W = calEl.scrollWidth - padL - padR;
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'ci-sep');
      svg.setAttribute('width', W);
      svg.setAttribute('height', calEl.scrollHeight - padT - padB);
      svg.style.top = padT + 'px';
      svg.style.left = padL + 'px';
      const toContent = (r) => ({
        top: r.top - calRect.top - borderT - padT + calEl.scrollTop,
        left: r.left - calRect.left - borderL - padL + calEl.scrollLeft,
        bottom: r.bottom - calRect.top - borderT - padT + calEl.scrollTop,
      });
      let d = '';
      for (let i = 0; i < months.length - 1; i++) {
        const aR = toContent(months[i].last.getBoundingClientRect());
        const bR = toContent(months[i + 1].first.getBoundingClientRect());
        const yBottomA = aR.bottom;     // 上一月最后一天的下边缘
        const yTopB = bR.top;           // 下一月第一天所在行的上边缘
        const xBend = bR.left;          // 下一月首天左缘 = 弯折点
        d += 'M0 ' + yBottomA +
             ' L' + xBend + ' ' + yBottomA +
             ' L' + xBend + ' ' + yTopB +
             ' L' + W + ' ' + yTopB + ' ';
      }
      if (!d) return;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'ci-sep-path');
      svg.appendChild(path);
      calEl.appendChild(svg);
    }
    // 在每个月区块的垂直中心、左列绘制竖向居中的月份标签。
    // 这样即使滚到月末（当月 1 号已滚出顶部），左列对应月份仍清晰可见，不会误显示为下月。
    function drawMonthLabels() {
      calEl.querySelectorAll('.ci-mlabel').forEach((e) => e.remove());
      if (!calEl.isConnected) return;
      const days = Array.from(calEl.querySelectorAll('.ci-grid .ci-day:not(.empty)'));
      if (!days.length) return;
      // 按 年-月 分组，取每个月首/末按钮（与 drawSeparators 同口径）
      const months = [];
      days.forEach((btn) => {
        const key = btn.dataset.y + '-' + btn.dataset.m;
        let g = months[months.length - 1];
        if (!g || g.key !== key) { g = { key: key, y: +btn.dataset.y, m: +btn.dataset.m, first: btn, last: btn }; months.push(g); }
        else { g.last = btn; }
      });
      const cs = getComputedStyle(calEl);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padT = parseFloat(cs.paddingTop) || 0;
      const borderL = calEl.clientLeft || 0;
      const borderT = calEl.clientTop || 0;
      const calRect = calEl.getBoundingClientRect();
      months.forEach((mo) => {
        const a = mo.first.getBoundingClientRect();
        const b = mo.last.getBoundingClientRect();
        const topA = a.top - calRect.top - borderT - padT + calEl.scrollTop;
        const botB = b.bottom - calRect.top - borderT - padT + calEl.scrollTop;
        const cy = (topA + botB) / 2;   // 该月区块的垂直中心
        const div = document.createElement('div');
        div.className = 'ci-mlabel';
        div.textContent = (mo.m + 1) + '月';
        div.style.top = cy + 'px';
        div.style.left = padL + 'px';
        calEl.appendChild(div);
      });
    }
    // 窗口尺寸变化时重算虚线位置
    let sepRaf = 0;
    window.addEventListener('resize', () => {
      if (sepRaf) cancelAnimationFrame(sepRaf);
      sepRaf = requestAnimationFrame(() => {
        if (calEl.isConnected) { drawSeparators(); drawMonthLabels(); }
      });
    });
    // 滚动到指定 (年,月) 的首日格子（避开吸顶星期表头）；smooth=true 平滑，false 直接定位
    function scrollToMonth(y, m, smooth) {
      const anchor = calEl.querySelector('.ci-day.month-start[data-y="' + y + '"][data-m="' + m + '"]');
      if (anchor && calEl.scrollTo) {
        const head = calEl.querySelector('.ci-cal-head');
        const headH = head ? head.offsetHeight : 0;
        calEl.scrollTo({ top: Math.max(0, anchor.offsetTop - headH), behavior: smooth ? 'smooth' : 'auto' });
      }
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
      selDate = todayStr();
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
    // 进入页面默认定位到现实时间的当前月（直接定位，避免长平滑滚动）
    const cur = new Date();
    scrollToMonth(cur.getFullYear(), cur.getMonth(), false);
  }
});
