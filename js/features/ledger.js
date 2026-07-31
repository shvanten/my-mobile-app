/**
 * 记账模块：
 * - 顶部显示当前存款（余额 = 初始存款 + 收入 - 支出）。
 * - 余额下方常驻「金额 / 备注」输入区，直接输入即可生成一笔记录（无需弹窗）。
 * - 可先点分类（高亮）再记；也可不选分类直接记（记为「待分类」），之后在记录里补标签。
 * - 记录列表点一条可展开内联分类条，补上或修改类型。
 */
App.registerFeature({
  id: 'ledger',
  title: '记账',
  desc: '记录收支与存款',
  icon: 'wallet',
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

    // 分类：type=exp 支出 / inc 收入（已移除「居住」）
    const CATS = [
      { e: '🍜', n: '饮食', type: 'exp' }, { e: '🚌', n: '交通', type: 'exp' },
      { e: '🛍️', n: '购物', type: 'exp' }, { e: '🎮', n: '娱乐', type: 'exp' },
      { e: '💊', n: '医疗', type: 'exp' },
      { e: '📚', n: '学习', type: 'exp' }, { e: '🍿', n: '零食', type: 'exp' }, { e: '📦', n: '其他', type: 'exp' },
      { e: '💰', n: '工资', type: 'inc' }, { e: '🧧', n: '红包', type: 'inc' },
      { e: '📈', n: '理财', type: 'inc' }, { e: '➕', n: '其他收入', type: 'inc' },
    ];

    // 记账时选中的分类（可空）；正在补标签的记录 id（可空）
    let pendingType = null;
    let editingId = null;
    // 各类型支出明细当前选中的周期：day / week / month
    let typePeriod = 'month';

    // 余额
    function balance() {
      let b = state.init;
      state.records.forEach((r) => { b += (r.type === 'inc' ? r.amount : -r.amount); });
      return b;
    }

    // ---------- 渲染骨架（横滑双页） ----------
    container.innerHTML =
      '<div class="lg">' +
      '  <div class="lg-head">' +
      '    <h2>记账</h2>' +
      '    <button class="btn ghost lg-set" type="button" id="lg-set">💰 设置存款</button>' +
      '  </div>' +
      '  <div class="lg-pages" id="lg-pages">' +
      '    <div class="lg-page" data-page="main">' +
      '      <div class="lg-bal">' +
      '        <span class="lg-bal-label">当前存款</span>' +
      '        <span class="lg-bal-num" id="lg-bal-num">' + money(balance()) + '</span>' +
      '        <span class="lg-bal-sub" id="lg-bal-sub"></span>' +
      '      </div>' +
      '      <div class="lg-enter">' +
      '        <div class="lg-enter-row">' +
      '          <span class="lg-enter-sign">¥</span>' +
      '          <input id="lg-amount" class="lg-enter-input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="金额" />' +
      '          <button class="btn" id="lg-ok" type="button">记一笔</button>' +
      '        </div>' +
      '        <input id="lg-note" class="lg-enter-note" type="text" maxlength="20" placeholder="备注（可选）" />' +
      '        <div class="lg-enter-hint" id="lg-enter-hint"></div>' +
      '      </div>' +
      '      <div class="lg-cats-title">选择类型（可选）</div>' +
      '      <div class="lg-cats" id="lg-cats"></div>' +
      '      <div class="lg-rec-title">记录（点一条可补类型）</div>' +
      '      <div class="lg-rec" id="lg-rec"></div>' +
      '    </div>' +
      '    <div class="lg-page" data-page="summary">' +
      '      <div class="lg-cats-title">消费总结</div>' +
      '      <div class="lg-sum" id="lg-sum"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="lg-pager" id="lg-pager">' +
      '    <span class="lg-pager-dot on" data-go="main"></span>' +
      '    <span class="lg-pager-dot" data-go="summary"></span>' +
      '  </div>' +
      '</div>';

    const pagesEl = container.querySelector('#lg-pages');
    const pagerEl = container.querySelector('#lg-pager');
    // 横滑同步 dot
    pagesEl.addEventListener('scroll', () => {
      const i = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
      pagerEl.querySelectorAll('.lg-pager-dot').forEach((d, idx) => d.classList.toggle('on', idx === i));
    });
    pagerEl.querySelectorAll('.lg-pager-dot').forEach((d) => d.addEventListener('click', () => {
      const i = d.dataset.go === 'summary' ? 1 : 0;
      pagesEl.scrollTo({ left: i * pagesEl.clientWidth, behavior: 'smooth' });
    }));

    const balNumEl = container.querySelector('#lg-bal-num');
    const balSubEl = container.querySelector('#lg-bal-sub');
    const catsEl = container.querySelector('#lg-cats');
    const recEl = container.querySelector('#lg-rec');
    const amountInput = container.querySelector('#lg-amount');
    const noteInput = container.querySelector('#lg-note');
    const okBtn = container.querySelector('#lg-ok');
    const enterHint = container.querySelector('#lg-enter-hint');

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
      const byWeek = {};
      const byMonth = {};
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
      const msDay = 86400000;
      const spanDays = Math.max(1, Math.round((new Date(t + 'T00:00:00') - new Date(firstDate + 'T00:00:00')) / msDay) + 1);
      const spanWeeks = Math.max(1, Math.ceil(spanDays / 7));
      const spanMonths = Math.max(1, ((+t.slice(0, 4) - +firstDate.slice(0, 4)) * 12 + (+t.slice(5, 7) - +firstDate.slice(5, 7))) + 1);
      const dayAvg = totalExp / spanDays;
      const weekAvg = totalExp / spanWeeks;
      const monthAvg = totalExp / spanMonths;

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
        '<div class="lg-sum-table">' + monthRows + '</div>' +
        '<div class="lg-type-section">' +
        '  <div class="lg-sum-sec-head"><h3>各类型支出</h3>' +
        '    <div class="lg-seg" id="lg-type-seg">' +
        '      <button type="button" data-p="day">日</button>' +
        '      <button type="button" data-p="week">周</button>' +
        '      <button type="button" data-p="month">月</button>' +
        '    </div>' +
        '  </div>' +
        '  <div id="lg-type-breakdown"></div>' +
        '</div>';

      const seg = sumEl.querySelector('#lg-type-seg');
      if (seg) {
        seg.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('on', b.dataset.p === typePeriod);
          b.addEventListener('click', () => {
            seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            typePeriod = b.dataset.p;
            paintTypeBreakdown(b.dataset.p);
          });
        });
      }
      paintTypeBreakdown(typePeriod);
    }

    // 各类型支出明细：按 日/周/月 统计每个支出类型的总金额
    function paintTypeBreakdown(period) {
      const box = container.querySelector('#lg-type-breakdown');
      if (!box) return;
      const t = todayStr();
      const expCats = CATS.filter((c) => c.type === 'exp');
      const totals = {};
      let periodTotal = 0;
      state.records.forEach((r) => {
        if (r.type !== 'exp') return;
        let inP = false;
        if (period === 'day') inP = r.date === t;
        else if (period === 'week') inP = weekStart(r.date) === weekStart(t);
        else inP = r.date.slice(0, 7) === t.slice(0, 7);
        if (inP) { totals[r.cat] = (totals[r.cat] || 0) + r.amount; periodTotal += r.amount; }
      });
      const rows = expCats.map((c) => ({ c: c, amt: totals[c.n] || 0 }))
        .filter((x) => x.amt > 0)
        .sort((a, b) => b.amt - a.amt);
      if (!rows.length) {
        box.innerHTML = '<p class="muted" style="margin:6px 0 0">本期还没有支出记录。</p>';
        return;
      }
      const max = rows[0].amt;
      let periodLabel;
      if (period === 'day') periodLabel = '今日 ' + t;
      else if (period === 'week') {
        const d = new Date(weekStart(t) + 'T00:00:00');
        d.setDate(d.getDate() + 6);
        periodLabel = '本周 ' + shortMD(weekStart(t)) + '–' + shortMD(fmt(d));
      } else {
        periodLabel = '本月 ' + parseInt(t.slice(5, 7), 10) + '月';
      }
      box.innerHTML =
        '<div class="lg-type-label">' + periodLabel + ' · 支出合计 <b>' + money(periodTotal) + '</b>（' + rows.length + ' 类）</div>' +
        rows.map((x) => {
          const pct = max ? Math.round(x.amt / max * 100) : 0;
          const share = periodTotal ? Math.round(x.amt / periodTotal * 100) : 0;
          return '<div class="lg-type-row">' +
            '<span class="lg-type-e">' + x.c.e + '</span>' +
            '<span class="lg-type-n">' + App.escapeHtml(x.c.n) + '</span>' +
            '<span class="lg-type-amt">' + money(x.amt) + '</span>' +
            '<span class="lg-type-bar"><i style="width:' + pct + '%"></i></span>' +
            '<span class="lg-type-share">' + share + '%</span>' +
            '</div>';
        }).join('');
    }

    // ---------- 分类网格（选中高亮） ----------
    function paintCats() {
      catsEl.innerHTML = CATS.map((c) =>
        '<button class="lg-cat' + (c.type === 'inc' ? ' inc' : '') +
        (pendingType && pendingType.n === c.n ? ' on' : '') + '" type="button" ' +
        'data-cat="' + App.escapeHtml(c.n) + '">' +
        '<span class="lg-cat-e">' + c.e + '</span><span class="lg-cat-n">' + c.n + '</span>' +
        '</button>'
      ).join('');
    }
    function updateHint() {
      if (!enterHint) return;
      enterHint.textContent = pendingType
        ? ('已选「' + pendingType.n + '」，输入金额后点记一笔。')
        : '直接输入金额即可记账（待分类）；也可先点上方类型。';
    }

    // ---------- 记录列表（可展开补类型） ----------
    function paintRecords() {
      const list = state.records.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + b.id));
      if (!list.length) {
        recEl.innerHTML = '<p class="muted ci-empty">还没有记账记录。</p>';
        return;
      }
      recEl.innerHTML = list.map((r) => {
        const cat = CATS.find((c) => c.n === r.cat) || { e: r.cat ? '🏷️' : '❓', n: r.cat || '待分类' };
        const sign = r.type === 'inc' ? '+' : '-';
        const cls = r.type === 'inc' ? ' inc' : ' exp';
        const noCat = !r.cat;
        const note = r.note ? ' · ' + App.escapeHtml(r.note) : '';
        let html = '<div class="lg-rec-item' + cls + (noCat ? ' no-cat' : '') + '" data-id="' + r.id + '">' +
          '  <span class="lg-rec-e">' + cat.e + '</span>' +
          '  <span class="lg-rec-meta"><span class="lg-rec-cat">' + App.escapeHtml(cat.n) + '</span>' +
          '    <span class="lg-rec-date">' + r.date + note + '</span></span>' +
          '  <span class="lg-rec-amt">' + sign + money(r.amount) + '</span>' +
          '  <button class="lg-rec-del" type="button" data-del="' + r.id + '" aria-label="删除">✕</button>' +
          '</div>';
        if (editingId === r.id) {
          html += '<div class="lg-rec-cats" data-id="' + r.id + '">' +
            CATS.map((c) => '<button class="lg-rec-cat' + (c.type === 'inc' ? ' inc' : '') +
              '" type="button" data-cat="' + App.escapeHtml(c.n) + '">' + c.e + ' ' + c.n + '</button>').join('') +
            '</div>';
        }
        return html;
      }).join('');
    }

    // ---------- 记一笔（常驻输入区，无需弹窗） ----------
    function doRecord() {
      const amt = parseFloat(amountInput.value);
      if (!amt || amt <= 0) { App.toast('请输入金额'); return; }
      const cat = pendingType;
      state.records.push({
        id: 'r' + Date.now(),
        date: todayStr(),
        cat: cat ? cat.n : '',
        type: cat ? cat.type : 'exp',
        amount: Math.round(amt * 100) / 100,
        note: noteInput.value.trim(),
      });
      save();
      amountInput.value = '';
      noteInput.value = '';
      pendingType = null;
      paintCats();
      updateHint();
      paintBalance();
      paintRecords();
      paintSummary();
      App.toast('已记一笔' + (cat ? '：' + cat.n : '（待分类）'));
    }
    okBtn.addEventListener('click', doRecord);
    amountInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRecord(); });
    noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRecord(); });

    // 分类网格：点选 / 取消
    catsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      const c = CATS.find((x) => x.n === b.dataset.cat);
      if (!c) return;
      pendingType = (pendingType && pendingType.n === c.n) ? null : c;
      paintCats();
      updateHint();
    });

    // 记录列表：删除 / 补标签 / 展开
    recEl.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const id = del.dataset.del;
        const r = state.records.find((x) => x.id === id);
        if (!r) return;
        App.confirm('删除记录', '确认删除这笔「' + (r.cat || '待分类') + ' ' + money(r.amount) + '」？', () => {
          state.records = state.records.filter((x) => x.id !== id);
          save();
          paintBalance();
          paintRecords();
          paintSummary();
          App.toast('已删除');
        });
        return;
      }
      const catBtn = e.target.closest('.lg-rec-cat');
      if (catBtn) {
        const id = catBtn.closest('.lg-rec-cats').dataset.id;
        const r = state.records.find((x) => x.id === id);
        const c = CATS.find((x) => x.n === catBtn.dataset.cat);
        if (r && c) {
          r.cat = c.n; r.type = c.type;
          save();
          paintBalance();
          paintRecords();
          paintSummary();
          App.toast('已设类型为 ' + c.n);
        }
        editingId = null;
        return;
      }
      const item = e.target.closest('.lg-rec-item');
      if (item) {
        const id = item.dataset.id;
        editingId = (editingId === id) ? null : id;
        paintRecords();
      }
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
    updateHint();
  }
});
