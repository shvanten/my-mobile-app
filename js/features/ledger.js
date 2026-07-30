/**
 * 记账模块：
 * - 顶部显示当前存款（余额 = 初始存款 + 收入 - 支出）。
 * - 点击分类（饮食 / 交通 …）后在底部弹窗填数字即可生成一笔记录。
 * - 记录列表可删除；可设置初始存款。
 */
App.registerFeature({
  id: 'ledger',
  title: '记账',
  desc: '记录收支与存款',
  icon: '💰',
  color: '#c2a06a',
  render(container) {
    const KEY = 'ledger.v1';

    // ---------- 存储 ----------
    function load() {
      try {
        const o = JSON.parse(localStorage.getItem(KEY));
        if (o && typeof o === 'object') return o;
      } catch (e) {}
      return { init: 0, records: [] };
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

    let state = load();
    if (!Array.isArray(state.records)) state.records = [];
    if (typeof state.init !== 'number') state.init = 0;

    // ---------- 工具 ----------
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function todayStr() { return fmt(new Date()); }
    function money(n) {
      // 千分位 + 两位小数
      const v = (Math.round(n * 100) / 100);
      const s = Math.abs(v).toFixed(2);
      const [int, dec] = s.split('.');
      const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (v < 0 ? '-' : '') + '¥' + withSep + '.' + dec;
    }

    // 分类：type=exp 支出 / inc 收入
    const CATS = [
      { e: '🍜', n: '饮食', type: 'exp' }, { e: '🚌', n: '交通', type: 'exp' },
      { e: '🛍️', n: '购物', type: 'exp' }, { e: '🎮', n: '娱乐', type: 'exp' },
      { e: '🏠', n: '居住', type: 'exp' }, { e: '💊', n: '医疗', type: 'exp' },
      { e: '📚', n: '学习', type: 'exp' }, { e: '📦', n: '其他', type: 'exp' },
      { e: '💰', n: '工资', type: 'inc' }, { e: '🧧', n: '红包', type: 'inc' },
      { e: '📈', n: '理财', type: 'inc' }, { e: '➕', n: '其他收入', type: 'inc' },
    ];

    // 当前弹窗选中的分类
    let sheetCat = null;

    // 余额
    function balance() {
      let b = state.init;
      state.records.forEach((r) => { b += (r.type === 'inc' ? r.amount : -r.amount); });
      return b;
    }

    // ---------- 渲染骨架 ----------
    container.innerHTML =
      '<div class="lg">' +
      '  <div class="lg-head">' +
      '    <h2>记账</h2>' +
      '    <button class="btn ghost lg-set" type="button" id="lg-set">💰 设置存款</button>' +
      '  </div>' +
      '  <div class="lg-bal">' +
      '    <span class="lg-bal-label">当前存款</span>' +
      '    <span class="lg-bal-num" id="lg-bal-num">' + money(balance()) + '</span>' +
      '    <span class="lg-bal-sub" id="lg-bal-sub"></span>' +
      '  </div>' +
      '  <div class="lg-cats-title">记一笔</div>' +
      '  <div class="lg-cats" id="lg-cats"></div>' +
      '  <div class="lg-cats-title">消费总结</div>' +
      '  <div class="lg-sum" id="lg-sum"></div>' +
      '  <div class="lg-rec-title">记录</div>' +
      '  <div class="lg-rec" id="lg-rec"></div>' +
      '  <div class="lg-sheet" id="lg-sheet" hidden>' +
      '    <div class="lg-sheet-backdrop"></div>' +
      '    <div class="lg-sheet-box">' +
      '      <div class="lg-sheet-head">' +
      '        <span class="lg-sheet-cat" id="lg-sheet-cat"></span>' +
      '        <span class="lg-sheet-type" id="lg-sheet-type"></span>' +
      '      </div>' +
      '      <div class="lg-amount"><span class="lg-amount-sign">¥</span>' +
      '        <input id="lg-amount" class="lg-amount-input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" /></div>' +
      '      <input id="lg-note" class="lg-note" type="text" maxlength="20" placeholder="备注（可选）" />' +
      '      <div class="lg-sheet-actions">' +
      '        <button class="btn ghost" id="lg-cancel" type="button">取消</button>' +
      '        <button class="btn" id="lg-ok" type="button">记一笔</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    const balNumEl = container.querySelector('#lg-bal-num');
    const balSubEl = container.querySelector('#lg-bal-sub');
    const catsEl = container.querySelector('#lg-cats');
    const recEl = container.querySelector('#lg-rec');
    const sheet = container.querySelector('#lg-sheet');
    const amountInput = container.querySelector('#lg-amount');
    const noteInput = container.querySelector('#lg-note');
    const sheetCatEl = container.querySelector('#lg-sheet-cat');
    const sheetTypeEl = container.querySelector('#lg-sheet-type');

    // ---------- 余额 / 统计 ----------
    function paintBalance() {
      balNumEl.textContent = money(balance());
      const ym = todayStr().slice(0, 7);
      let inc = 0, exp = 0;
      state.records.forEach((r) => {
        if (r.date.slice(0, 7) !== ym) return;
        if (r.type === 'inc') inc += r.amount; else exp += r.amount;
      });
      balSubEl.textContent = '本月收入 ' + money(inc) + ' · 支出 ' + money(exp);
    }

    // ---------- 消费总结（周/月/平均） ----------
    // 某天所在自然周（周一开头）的周一日期，作为周的 key
    function weekStart(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const dow = (d.getDay() + 6) % 7;   // 0=周一
      d.setDate(d.getDate() - dow);
      return fmt(d);
    }
    function shortMD(dateStr) { return parseInt(dateStr.slice(5, 7), 10) + '.' + parseInt(dateStr.slice(8, 10), 10); }

    function paintSummary() {
      const sumEl = container.querySelector('#lg-sum');
      if (!state.records.length) {
        sumEl.innerHTML = '<p class="muted" style="margin:0">记几笔之后，这里会出现总结。</p>';
        return;
      }
      const t = todayStr();
      // 按周 / 按月分组
      const byWeek = {};   // { 周一日期: {exp,inc} }
      const byMonth = {};  // { 'YYYY-MM': {exp,inc} }
      let firstDate = t, totalExp = 0;
      state.records.forEach((r) => {
        if (r.date < firstDate) firstDate = r.date;
        const wk = weekStart(r.date);
        const mo = r.date.slice(0, 7);
        byWeek[wk] = byWeek[wk] || { exp: 0, inc: 0 };
        byMonth[mo] = byMonth[mo] || { exp: 0, inc: 0 };
        if (r.type === 'inc') { byWeek[wk].inc += r.amount; byMonth[mo].inc += r.amount; }
        else { byWeek[wk].exp += r.amount; byMonth[mo].exp += r.amount; totalExp += r.amount; }
      });
      // 平均：从第一笔记录到今天的跨度
      const msDay = 86400000;
      const spanDays = Math.max(1, Math.round((new Date(t + 'T00:00:00') - new Date(firstDate + 'T00:00:00')) / msDay) + 1);
      const spanWeeks = Math.max(1, Math.ceil(spanDays / 7));
      const spanMonths = Math.max(1, ((+t.slice(0, 4) - +firstDate.slice(0, 4)) * 12 + (+t.slice(5, 7) - +firstDate.slice(5, 7))) + 1);
      const dayAvg = totalExp / spanDays;
      const weekAvg = totalExp / spanWeeks;
      const monthAvg = totalExp / spanMonths;

      // 每周总结：最近 6 个有记录的周（最近在前）
      const weekKeys = Object.keys(byWeek).sort().reverse().slice(0, 6);
      const curWeek = weekStart(t);
      const weekRows = weekKeys.map((wk) => {
        const d = new Date(wk + 'T00:00:00');
        d.setDate(d.getDate() + 6);
        const label = (wk === curWeek ? '本周 ' : '') + shortMD(wk) + '–' + shortMD(fmt(d));
        return '<div class="lg-sum-row">' +
          '<span class="lg-sum-name">' + label + '</span>' +
          '<span class="lg-sum-exp">支出 ' + money(byWeek[wk].exp) + '</span>' +
          '<span class="lg-sum-inc">收入 ' + money(byWeek[wk].inc) + '</span></div>';
      }).join('');

      // 每月总结：最近 6 个有记录的月（最近在前）
      const monthKeys = Object.keys(byMonth).sort().reverse().slice(0, 6);
      const curMonth = t.slice(0, 7);
      const monthRows = monthKeys.map((mo) => {
        const label = (mo === curMonth ? '本月 ' : '') + parseInt(mo.slice(5, 7), 10) + '月（' + mo.slice(0, 4) + '）';
        return '<div class="lg-sum-row">' +
          '<span class="lg-sum-name">' + label + '</span>' +
          '<span class="lg-sum-exp">支出 ' + money(byMonth[mo].exp) + '</span>' +
          '<span class="lg-sum-inc">收入 ' + money(byMonth[mo].inc) + '</span></div>';
      }).join('');

      sumEl.innerHTML =
        '<div class="lg-sum-avgs">' +
        '  <div class="lg-sum-avg"><b>' + money(dayAvg) + '</b><span>日均消费</span></div>' +
        '  <div class="lg-sum-avg"><b>' + money(weekAvg) + '</b><span>周均消费</span></div>' +
        '  <div class="lg-sum-avg"><b>' + money(monthAvg) + '</b><span>月均消费</span></div>' +
        '</div>' +
        '<div class="lg-sum-sub">自 ' + firstDate + ' 起，累计支出 ' + money(totalExp) + '（跨 ' + spanDays + ' 天）</div>' +
        '<div class="lg-sum-row head"><span>每周总结</span><span></span><span></span></div>' +
        '<div class="lg-sum-table">' + weekRows + '</div>' +
        '<div class="lg-sum-row head"><span>每月总结</span><span></span><span></span></div>' +
        '<div class="lg-sum-table">' + monthRows + '</div>';
    }

    // ---------- 分类网格 ----------
    function paintCats() {
      catsEl.innerHTML = CATS.map((c) =>
        '<button class="lg-cat' + (c.type === 'inc' ? ' inc' : '') + '" type="button" ' +
        'data-cat="' + App.escapeHtml(c.n) + '">' +
        '<span class="lg-cat-e">' + c.e + '</span><span class="lg-cat-n">' + c.n + '</span>' +
        '</button>'
      ).join('');
    }

    // ---------- 记录列表 ----------
    function paintRecords() {
      const list = state.records.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + b.id));
      if (!list.length) {
        recEl.innerHTML = '<p class="muted ci-empty">还没有记账记录。</p>';
        return;
      }
      recEl.innerHTML = list.map((r) => {
        const cat = CATS.find((c) => c.n === r.cat) || { e: '📝', n: r.cat };
        const sign = r.type === 'inc' ? '+' : '-';
        const cls = r.type === 'inc' ? ' inc' : ' exp';
        const note = r.note ? ' · ' + App.escapeHtml(r.note) : '';
        return '<div class="lg-rec-item' + cls + '">' +
          '  <span class="lg-rec-e">' + cat.e + '</span>' +
          '  <span class="lg-rec-meta"><span class="lg-rec-cat">' + App.escapeHtml(r.cat) +
          '    </span><span class="lg-rec-date">' + r.date + note + '</span></span>' +
          '  <span class="lg-rec-amt">' + sign + money(r.amount).replace('¥', '¥') + '</span>' +
          '  <button class="lg-rec-del" type="button" data-del="' + r.id + '" aria-label="删除">✕</button>' +
          '</div>';
      }).join('');
    }

    // ---------- 底部弹窗 ----------
    function openSheet(catName) {
      const cat = CATS.find((c) => c.n === catName);
      if (!cat) return;
      sheetCat = cat;
      sheetCatEl.textContent = cat.e + ' ' + cat.n;
      sheetTypeEl.textContent = cat.type === 'inc' ? '收入' : '支出';
      sheetTypeEl.className = 'lg-sheet-type ' + (cat.type === 'inc' ? 'inc' : 'exp');
      amountInput.value = '';
      noteInput.value = '';
      sheet.hidden = false;
      setTimeout(() => amountInput.focus(), 60);
    }
    function closeSheet() { sheet.hidden = true; sheetCat = null; }

    catsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      openSheet(b.dataset.cat);
    });

    sheet.querySelector('#lg-cancel').addEventListener('click', closeSheet);
    sheet.addEventListener('click', (e) => { if (e.target.classList.contains('lg-sheet-backdrop')) closeSheet(); });
    sheet.querySelector('#lg-ok').addEventListener('click', () => {
      if (!sheetCat) { closeSheet(); return; }
      const amt = parseFloat(amountInput.value);
      if (!amt || amt <= 0) { App.toast('请输入金额'); return; }
      state.records.push({
        id: 'r' + Date.now(),
        date: todayStr(),
        cat: sheetCat.n,
        type: sheetCat.type,
        amount: Math.round(amt * 100) / 100,
        note: noteInput.value.trim(),
      });
      save();
      closeSheet();
      paintBalance();
      paintRecords();
      paintSummary();
      App.toast('已记一笔：' + sheetCat.n + ' ' + money(amt));
    });
    // 回车直接确认
    amountInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sheet.querySelector('#lg-ok').click(); });

    // ---------- 删除记录 ----------
    recEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const id = b.dataset.del;
      const r = state.records.find((x) => x.id === id);
      if (!r) return;
      App.confirm('删除记录', '确认删除这笔「' + r.cat + ' ' + money(r.amount) + '」？', () => {
        state.records = state.records.filter((x) => x.id !== id);
        save();
        paintBalance();
        paintRecords();
        paintSummary();
        App.toast('已删除');
      });
    });

    // ---------- 设置存款（初始余额） ----------
    container.querySelector('#lg-set').addEventListener('click', () => {
      App.prompt('设置初始存款', state.init, (n) => {
        if (n == null || isNaN(n)) { App.toast('请输入数字'); return; }
        state.init = Math.round(n * 100) / 100;
        save();
        paintBalance();
        App.toast('已设置存款为 ' + money(state.init));
      }, { type: 'number', hint: '设置后会作为余额起点，加上后面所有收入减去支出 = 当前存款。' });
    });

    // ---------- 首次渲染 ----------
    paintBalance();
    paintCats();
    paintRecords();
    paintSummary();
  }
});
