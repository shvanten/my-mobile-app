/**
 * 记账模块（v2，便于后续拆分成独立网页）
 *
 * 设计要点：
 * - 业务逻辑与 App 框架解耦：通过顶部 App 兼容层，本模块在 App 内与独立页面都能跑。
 * - 数据全部走 state，持久化到 localStorage('ledger.v1')，向后兼容旧数据。
 * - 新增：月度预算与超支预警、分类自定义（增删改）、记录筛选（时间/分类/账户）。
 */
(function () {
  'use strict';

  // ===== App 兼容层：在 App 框架内用全局 App；独立运行时用兜底实现 =====
  const App = window.App || {
    toast: (m) => { try { console.log('[ledger]', m); } catch (e) {} },
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    confirm: (t, m, cb) => { if (window.confirm(m)) { if (cb) cb(); } },
    navigate: () => {},
    closeModal: () => {},
    icon: () => '',
  };

  App.registerFeature({
    id: 'ledger',
    title: '记账',
    desc: '记录收支与存款',
    icon: 'wallet',
    color: '#c2a06a',
    render(container) {
      const KEY = 'ledger.v1';
      const G = window.GitHubSync || null;

      // ---------- 默认值（用于首次/迁移） ----------
      // 账户：初始存款拆分为四个来源；记账时选择这笔钱来自 / 存入哪个账户
      const DEFAULT_ACCOUNTS = {
        bank: { name: '银行卡', init: 0 },
        wechat: { name: '微信', init: 0 },
        alipay: { name: '支付宝', init: 0 },
        cash: { name: '现金', init: 0 },
      };
      // 默认分类（支出/收入）。可被用户自定义覆盖。
      const DEFAULT_CATS = [
        { e: '🍜', n: '饮食', type: 'exp' },
        { e: '🚌', n: '交通', type: 'exp' },
        { e: '🛍️', n: '购物', type: 'exp' },
        { e: '🎮', n: '娱乐', type: 'exp' },
        { e: '💊', n: '医疗', type: 'exp' },
        { e: '📚', n: '学习', type: 'exp' },
        { e: '🍿', n: '零食', type: 'exp' },
        { e: '📦', n: '其他', type: 'exp' },
        { e: '💰', n: '工资', type: 'inc' },
        { e: '🧧', n: '红包', type: 'inc' },
        { e: '📈', n: '理财', type: 'inc' },
        { e: '➕', n: '其他收入', type: 'inc' },
      ];

      // ---------- 存储 ----------
      function load() {
        try {
          const o = JSON.parse(localStorage.getItem(KEY));
          if (o && typeof o === 'object') {
            if (!o.accounts || typeof o.accounts !== 'object') {
              o.accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
              if (typeof o.init === 'number') o.accounts.cash.init = o.init; // 旧单一存款并入现金
            }
            if (!Array.isArray(o.records)) o.records = [];
            if (!Array.isArray(o.cats)) o.cats = JSON.parse(JSON.stringify(DEFAULT_CATS));
            if (typeof o.budget !== 'number') o.budget = 0; // 月预算，0 表示未设置
            // 旧记录补齐 account 字段（归入现金）
            o.records.forEach((r) => { if (r && !r.account) r.account = 'cash'; });
            return o;
          }
        } catch (e) {}
        return {
          accounts: JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS)),
          records: [],
          cats: JSON.parse(JSON.stringify(DEFAULT_CATS)),
          budget: 0,
        };
      }
      function save() {
        localStorage.setItem(KEY, JSON.stringify(state));
        // 已连接 GitHub 时，把数据写回仓库文件（异步、失败仅提示，不阻塞）
        if (G && G.isConnected()) {
          G.sync(state).catch((err) => {
            App.toast('同步 GitHub 失败：' + (err && err.message ? err.message : '未知错误'));
          });
        }
      }

      let state = load();
      if (!Array.isArray(state.records)) state.records = [];

      // ---------- 工具 ----------
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
      function todayStr() { return fmt(new Date()); }
      function money(n) {
        const v = (Math.round(n * 100) / 100);
        const s = Math.abs(v).toFixed(2);
        const [int, dec] = s.split('.');
        const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (v < 0 ? '-' : '') + '¥' + withSep + '.' + dec;
      }
      function weekStart(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dow = (d.getDay() + 6) % 7;   // 周一为 0
        d.setDate(d.getDate() - dow);
        return fmt(d);
      }
      function shortMD(dateStr) { return parseInt(dateStr.slice(5, 7), 10) + '.' + parseInt(dateStr.slice(8, 10), 10); }

      function cats() { return state.cats && state.cats.length ? state.cats : DEFAULT_CATS; }

      // 分类：type=exp 支出 / inc 收入
      // 账户定义（图标 / 名称 / key）
      const ACCOUNTS = [
        { k: 'bank', e: '🏦', n: '银行卡' },
        { k: 'wechat', e: '💚', n: '微信' },
        { k: 'alipay', e: '🔷', n: '支付宝' },
        { k: 'cash', e: '💵', n: '现金' },
      ];

      // 记账时选中的分类（可空）；正在补标签的记录 id（可空）；选中的账户
      let pendingType = null;
      let editingId = null;
      let pendingAccount = 'bank';
      // 各类型支出明细当前选中的周期：day / week / month
      let typePeriod = 'month';
      // 记录筛选：scope = all/month/year；fCat = 分类名或 ''；fAcct = 账户 key 或 ''
      let fScope = 'all';
      let fCat = '';
      let fAcct = '';

      // 余额：各账户余额之和
      function accountBalance(k) {
        const a = state.accounts[k];
        let b = a ? a.init : 0;
        state.records.forEach((r) => { if (r.account === k) b += (r.type === 'inc' ? r.amount : -r.amount); });
        return b;
      }
      function balance() {
        let b = 0;
        Object.keys(state.accounts).forEach((k) => { b += accountBalance(k); });
        return b;
      }

      // ---------- 渲染骨架（横滑双页） ----------
      container.innerHTML =
        '<div class="lg">' +
        '  <div class="lg-head">' +
        '    <h2>记账</h2>' +
        '    <div class="lg-head-actions">' +
        '      <button class="btn ghost" type="button" id="lg-gh">🔗 同步</button>' +
        '      <button class="btn ghost" type="button" id="lg-cats-manage">🏷️ 分类</button>' +
        '      <button class="btn ghost lg-set" type="button" id="lg-set">💰 设置</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="lg-pages" id="lg-pages">' +
        '    <div class="lg-page" data-page="main">' +
        '      <div class="lg-bal">' +
        '        <div class="lg-bal-left">' +
        '          <span class="lg-bal-label">当前存款</span>' +
        '          <span class="lg-bal-num" id="lg-bal-num">' + money(balance()) + '</span>' +
        '          <span class="lg-bal-sub" id="lg-bal-sub"></span>' +
        '          <span class="lg-budget" id="lg-budget"></span>' +
        '        </div>' +
        '        <div class="lg-bal-right">' +
        '          <div class="lg-enter-row">' +
        '            <span class="lg-enter-sign" id="lg-enter-sign">−</span>' +
        '            <input id="lg-amount" class="lg-enter-input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="金额" />' +
        '          </div>' +
        '          <button class="btn" id="lg-ok" type="button">记一笔</button>' +
        '        </div>' +
        '      </div>' +
        '      <div class="lg-accounts" id="lg-accounts"></div>' +
        '      <input id="lg-note" class="lg-enter-note" type="text" maxlength="20" placeholder="备注（可选）" />' +
        '      <div class="lg-enter-hint" id="lg-enter-hint"></div>' +
        '      <div class="lg-cats-title">选择类型（可选）</div>' +
        '      <div class="lg-cats" id="lg-cats"></div>' +
        '      <div class="lg-accts-title">账户（这笔钱来自 / 存入）</div>' +
        '      <div class="lg-accts" id="lg-accts"></div>' +
        '      <div class="lg-rec-head">' +
        '        <span class="lg-cats-title" style="margin-top:14px">记录</span>' +
        '        <div class="lg-filter">' +
        '          <select id="lg-filter-scope" class="lg-filter-sel">' +
        '            <option value="all">全部</option>' +
        '            <option value="month">本月</option>' +
        '            <option value="year">本年</option>' +
        '          </select>' +
        '          <select id="lg-filter-cat" class="lg-filter-sel"></select>' +
        '          <select id="lg-filter-acct" class="lg-filter-sel">' +
        '            <option value="">全部账户</option>' +
        '            ' + ACCOUNTS.map((a) => '<option value="' + a.k + '">' + a.n + '</option>').join('') +
        '          </select>' +
        '        </div>' +
        '      </div>' +
        '      <div class="lg-rec" id="lg-rec"></div>' +
        '    </div>' +
        '    <div class="lg-page" data-page="calendar">' +
        '      <div class="lg-cal-head">' +
        '        <button class="btn ghost" id="lg-cal-prev" type="button" aria-label="上个月">‹</button>' +
        '        <span id="lg-cal-title"></span>' +
        '        <button class="btn ghost" id="lg-cal-next" type="button" aria-label="下个月">›</button>' +
        '      </div>' +
        '      <div class="lg-cal" id="lg-cal"></div>' +
        '      <div class="lg-cal-detail" id="lg-cal-detail"></div>' +
        '    </div>' +
        '    <div class="lg-page" data-page="summary">' +
        '      <div class="lg-cats-title">消费总结</div>' +
        '      <div class="lg-sum" id="lg-sum"></div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="lg-pager" id="lg-pager">' +
        '    <span class="lg-pager-dot on" data-go="main"></span>' +
        '    <span class="lg-pager-dot" data-go="calendar"></span>' +
        '    <span class="lg-pager-dot" data-go="summary"></span>' +
        '  </div>' +
        '  <div class="ci-modal" id="lg-acct-set" hidden>' +
        '    <div class="ci-modal-box">' +
        '      <h3>设置存款与预算</h3>' +
        '      <p class="muted ci-edit-sub">分别填写每个账户里现有的钱作为余额起点；并设置本月预算。</p>' +
        '      <div id="lg-acct-set-rows"></div>' +
        '      <div class="ci-field"><span>📅 本月预算（留空=不设置）</span><input type="number" inputmode="decimal" step="0.01" min="0" id="lg-budget-input" value="' + (state.budget || '') + '" /></div>' +
        '      <div class="ci-modal-actions">' +
        '        <button class="btn ghost" id="lg-acct-set-cancel" type="  button">取消</button>' +
        '        <button class="btn" id="lg-acct-set-save" type="button">保存</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="ci-modal" id="lg-cats-set" hidden>' +
        '    <div class="ci-modal-box">' +
        '      <h3>分类管理</h3>' +
        '      <p class="muted ci-edit-sub">新增分类，或修改 / 删除已有分类。</p>' +
        '      <div id="lg-cats-manage-list"></div>' +
        '      <div class="lg-cat-add">' +
        '        <input id="lg-cat-add-e" class="lg-cat-add-e" maxlength="2" placeholder="图标" />' +
        '        <input id="lg-cat-add-n" class="lg-cat-add-n" maxlength="8" placeholder="名称" />' +
        '        <select id="lg-cat-add-type">' +
        '          <option value="exp">支出</option>' +
        '          <option value="inc">收入</option>' +
        '        </select>' +
        '        <button class="btn" id="lg-cat-add-btn" type="button">＋ 添加</button>' +
        '      </div>' +
        '      <div class="ci-modal-actions">' +
        '        <button class="btn" id="lg-cats-save" type="button">完成</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="ci-modal" id="lg-gh-modal" hidden>' +
        '    <div class="ci-modal-box">' +
        '      <h3>GitHub 同步</h3>' +
        '      <div id="lg-gh-body"></div>' +
        '      <div class="ci-modal-actions">' +
        '        <button class="btn" id="lg-gh-close" type="button">关闭</button>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      const pagesEl = container.querySelector('#lg-pages');
      const pagerEl = container.querySelector('#lg-pager');
      // 横滑同步 dot
      pagesEl.addEventListener('scroll', () => {
        const i = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
        pagerEl.querySelectorAll('.lg-pager-dot').forEach((d, idx) => d.classList.toggle('on', idx === i));
      });
      pagerEl.querySelectorAll('.lg-pager-dot').forEach((d, idx) => d.addEventListener('click', () => {
        pagesEl.scrollTo({ left: idx * pagesEl.clientWidth, behavior: 'smooth' });
      }));

      const balNumEl = container.querySelector('#lg-bal-num');
      const balSubEl = container.querySelector('#lg-bal-sub');
      const budgetEl = container.querySelector('#lg-budget');
      const catsEl = container.querySelector('#lg-cats');
      const recEl = container.querySelector('#lg-rec');
      const accountsEl = container.querySelector('#lg-accounts');
      const acctsEl = container.querySelector('#lg-accts');
      const acctSetModal = container.querySelector('#lg-acct-set');
      const catsSetModal = container.querySelector('#lg-cats-set');
      const amountInput = container.querySelector('#lg-amount');
      const noteInput = container.querySelector('#lg-note');
      const okBtn = container.querySelector('#lg-ok');
      const enterHint = container.querySelector('#lg-enter-hint');
      const signEl = container.querySelector('#lg-enter-sign');
      const filterScope = container.querySelector('#lg-filter-scope');
      const filterCat = container.querySelector('#lg-filter-cat');
      const filterAcct = container.querySelector('#lg-filter-acct');

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
        // 预算：剩余 = 预算 - 本月支出
        if (state.budget > 0) {
          const remain = state.budget - exp;
          const over = remain < 0;
          budgetEl.innerHTML = '本月预算 ' + money(state.budget) +
            ' · 已用 ' + money(exp) +
            ' · <span style="color:' + (over ? '#c0392b' : 'var(--accent-deep)') + '">剩余 ' + money(remain) + '</span>' +
            (over ? ' ⚠️超支' : '');
        } else {
          budgetEl.innerHTML = '<span class="muted">未设置本月预算（点「设置」）</span>';
        }
        // 各账户余额（始终可见，不点余额也能看到）
        accountsEl.innerHTML = ACCOUNTS.map((a) => {
          const b = accountBalance(a.k);
          return '<div class="lg-acct-bal">' +
            '<span class="lg-acct-e">' + a.e + '</span>' +
            '<span class="lg-acct-meta"><span class="lg-acct-n">' + a.n + '</span>' +
            '<span class="lg-acct-amt' + (b < 0 ? ' neg' : '') + '">' + money(b) + '</span></span>' +
            '</div>';
        }).join('');
      }

      // ---------- 消费总结（周/月/平均） ----------
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
        const expCats = cats().filter((c) => c.type === 'exp');
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
      function updateSign() {
        if (!signEl) return;
        if (!pendingType) { signEl.textContent = '−'; signEl.className = 'lg-enter-sign'; return; }
        const inc = pendingType.type === 'inc';
        signEl.textContent = inc ? '+' : '−';
        signEl.className = 'lg-enter-sign' + (inc ? ' inc' : '');
      }
      function paintCats() {
        catsEl.innerHTML = cats().map((c) =>
          '<button class="lg-cat' + (c.type === 'inc' ? ' inc' : '') +
          (pendingType && pendingType.n === c.n ? ' on' : '') + '" type="button" ' +
          'data-cat="' + App.escapeHtml(c.n) + '">' +
          '<span class="lg-cat-e">' + c.e + '</span><span class="lg-cat-n">' + c.n + '</span>' +
          '</button>'
        ).join('');
        updateSign();
      }
      function paintAccts() {
        acctsEl.innerHTML = ACCOUNTS.map((a) =>
          '<button class="lg-acct' + (pendingAccount === a.k ? ' on' : '') + '" type="button" ' +
          'data-k="' + a.k + '">' +
          '<span class="lg-acct-e">' + a.e + '</span><span class="lg-acct-n">' + a.n + '</span>' +
          '</button>'
        ).join('');
      }
      function updateHint() {
        if (!enterHint) return;
        const acc = ACCOUNTS.find((a) => a.k === pendingAccount);
        const accName = acc ? acc.n : '';
        enterHint.textContent = pendingType
          ? ('已选「' + pendingType.n + '」，金额将' + (pendingType.type === 'inc' ? '存入' : '从') + '「' + accName + '」。')
          : ('直接输入金额即可记账（待分类 · 计入「' + accName + '」）；也可先点上方类型。');
      }

      // ---------- 记录列表（可展开补类型 + 筛选） ----------
      function filteredRecords() {
        const t = todayStr();
        return state.records.filter((r) => {
          if (fScope === 'month' && r.date.slice(0, 7) !== t.slice(0, 7)) return false;
          if (fScope === 'year' && r.date.slice(0, 4) !== t.slice(0, 4)) return false;
          if (fCat && r.cat !== fCat) return false;
          if (fAcct && r.account !== fAcct) return false;
          return true;
        });
      }
      function paintRecords() {
        const list = filteredRecords()
          .slice()
          .sort((a, b) => b.id.localeCompare(a.id));
        if (!list.length) {
          recEl.innerHTML = '<p class="muted ci-empty">没有符合条件的记录。</p>';
          return;
        }
        recEl.innerHTML = list.map((r) => {
          const cat = cats().find((c) => c.n === r.cat) || { e: r.cat ? '🏷️' : '❓', n: r.cat || '待分类' };
          const acc = ACCOUNTS.find((a) => a.k === r.account) || { e: '💵', n: '现金' };
          const sign = r.type === 'inc' ? '+' : '-';
          const cls = r.type === 'inc' ? ' inc' : ' exp';
          const noCat = !r.cat;
          const note = r.note ? ' · ' + App.escapeHtml(r.note) : '';
          let html = '<div class="lg-rec-item' + cls + (noCat ? ' no-cat' : '') + '" data-id="' + r.id + '">' +
            '  <span class="lg-rec-e">' + cat.e + '</span>' +
            '  <span class="lg-rec-meta"><span class="lg-rec-cat">' + App.escapeHtml(cat.n) + '</span>' +
            '    <span class="lg-rec-date">' + r.date + ' · ' + acc.e + acc.n + note + '</span></span>' +
            '  <span class="lg-rec-amt">' + sign + money(r.amount) + '</span>' +
            '  <button class="lg-rec-del" type="button" data-del="' + r.id + '" aria-label="删除">✕</button>' +
            '</div>';
          if (editingId === r.id) {
            html += '<div class="lg-rec-edit" data-id="' + r.id + '">' +
              '  <div class="ci-field"><span>日期</span><input type="date" class="lg-edit-date" value="' + r.date + '"></div>' +
              '  <div class="ci-field"><span>金额</span><input type="number" inputmode="decimal" step="0.01" min="0" class="lg-edit-amt" value="' + r.amount + '"></div>' +
              '  <div class="lg-edit-label">类型</div>' +
              '  <div class="lg-rec-cats">' +
              cats().map((c) => '<button class="lg-rec-cat' + (c.type === 'inc' ? ' inc' : '') +
                (r.cat === c.n ? ' on' : '') + '" type="button" data-cat="' + App.escapeHtml(c.n) + '">' + c.e + ' ' + c.n + '</button>').join('') +
              '</div>' +
              '  <div class="lg-edit-label">账户</div>' +
              '  <div class="lg-rec-accts">' +
              ACCOUNTS.map((a) => '<button class="lg-rec-acct' + (r.account === a.k ? ' on' : '') +
                '" type="button" data-acct="' + a.k + '">' + a.e + ' ' + a.n + '</button>').join('') +
              '</div>' +
              '  <div class="lg-rec-edit-actions">' +
              '    <button class="btn ghost" type="button" data-edit-cancel="' + r.id + '">取消</button>' +
              '    <button class="btn" type="button" data-edit-save="' + r.id + '">保存</button>' +
              '  </div>' +
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
          account: pendingAccount,
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
  const c = cats().find((x) => x.n === b.dataset.cat);
        if (!c) return;
        pendingType = (pendingType && pendingType.n === c.n) ? null : c;
        paintCats();
        updateHint();
      });
      // 账户选择
      acctsEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        pendingAccount = b.dataset.k;
        paintAccts();
        updateHint();
      });

      // 筛选联动
      filterScope.addEventListener('change', () => { fScope = filterScope.value; paintRecords(); });
      filterCat.addEventListener('change', () => { fCat = filterCat.value; paintRecords(); });
      filterAcct.addEventListener('change', () => { fAcct = filterAcct.value; paintRecords(); });

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
            editingId = null;
            paintBalance();
            paintRecords();
            paintSummary();
            paintCalendar();
            App.toast('已删除');
          });
          return;
        }
        const saveBtn = e.target.closest('[data-edit-save]');
        if (saveBtn) {
          const id = saveBtn.dataset.editSave;
          const r = state.records.find((x) => x.id === id);
          const block = saveBtn.closest('.lg-rec-edit');
          if (r && block) {
            const dateVal = block.querySelector('.lg-edit-date').value;
            const amtVal = parseFloat(block.querySelector('.lg-edit-amt').value);
            if (!dateVal) { App.toast('请选择日期'); return; }
            if (!amtVal || amtVal <= 0) { App.toast('请输入有效金额'); return; }
            const catBtn = block.querySelector('.lg-rec-cat.on');
            const acctBtn = block.querySelector('.lg-rec-acct.on');
            const cat = catBtn ? cats().find((c) => c.n === catBtn.dataset.cat) : null;
            const accK = acctBtn ? acctBtn.dataset.acct : r.account;
            r.date = dateVal;
            r.amount = Math.round(amtVal * 100) / 100;
            if (cat) { r.cat = cat.n; r.type = cat.type; }
            r.account = accK;
            save();
            editingId = null;
            paintBalance();
            paintRecords();
            paintSummary();
            paintCalendar();
            App.toast('已保存修改');
          }
          return;
        }
        const cancelBtn = e.target.closest('[data-edit-cancel]');
        if (cancelBtn) {
          editingId = null;
          paintRecords();
          return;
        }
        const catBtn = e.target.closest('.lg-rec-cat');
        if (catBtn) {
          const block = catBtn.closest('.lg-rec-edit');
          const r = state.records.find((x) => x.id === block.dataset.id);
          const c = cats().find((x) => x.n === catBtn.dataset.cat);
          if (r && c) {
            r.cat = c.n; r.type = c.type;
            save();
            paintBalance(); paintSummary(); paintCalendar(); paintRecords();
          }
          return;
        }
        const acctBtn = e.target.closest('.lg-rec-acct');
        if (acctBtn) {
          const block = acctBtn.closest('.lg-rec-edit');
          const r = state.records.find((x) => x.id === block.dataset.id);
          const k = acctBtn.dataset.acct;
          if (r && k) {
            r.account = k; save();
            paintBalance(); paintSummary(); paintCalendar(); paintRecords();
          }
          return;
        }
        const item = e.target.closest('.lg-rec-item');
        if (item && !e.target.closest('.lg-rec-edit')) {
          const id = item.dataset.id;
          editingId = (editingId === id) ? null : id;
          paintRecords();
        }
      });

      // ---------- 设置（存款 + 预算） ----------
      container.querySelector('#lg-set').addEventListener('click', openAcctSet);
      function openAcctSet() {
        const rows = acctSetModal.querySelector('#lg-acct-set-rows');
        rows.innerHTML = ACCOUNTS.map((a) =>
          '<div class="ci-field"><span>' + a.e + ' ' + a.n + '</span>' +
          '<input type="number" inputmode="decimal" step="0.01" min="0" data-k="' + a.k + '" value="' + (state.accounts[a.k].init || 0) + '" /></div>'
        ).join('');
        acctSetModal.querySelector('#lg-budget-input').value = (state.budget || '');
        acctSetModal.hidden = false;
      }
      function closeAcctSet() { acctSetModal.hidden = true; }
      acctSetModal.querySelector('#lg-acct-set-cancel').addEventListener('click', closeAcctSet);
      acctSetModal.addEventListener('click', (e) => { if (e.target === acctSetModal) closeAcctSet(); });
      acctSetModal.querySelector('#lg-acct-set-save').addEventListener('click', () => {
        acctSetModal.querySelectorAll('#lg-acct-set-rows input').forEach((inp) => {
          const k = inp.dataset.k;
          const v = parseFloat(inp.value);
          state.accounts[k].init = (isNaN(v) ? 0 : Math.round(v * 100) / 100);
        });
        const bv = parseFloat(acctSetModal.querySelector('#lg-budget-input').value);
        state.budget = (isNaN(bv) || bv <= 0) ? 0 : Math.round(bv * 100) / 100;
        save();
        closeAcctSet();
        paintBalance();
        paintSummary();
        App.toast('已保存存款与预算');
      });

      // ---------- 分类管理（增删改） ----------
      container.querySelector('#lg-cats-manage').addEventListener('click', openCatsManage);
      function openCatsManage() {
        paintCatsManageList();
        catsSetModal.hidden = false;
      }
      function closeCatsManage() { catsSetModal.hidden = true; }
      function paintCatsManageList() {
        const list = catsSetModal.querySelector('#lg-cats-manage-list');
        list.innerHTML = cats().map((c, i) =>
          '<div class="lg-cat-manage-row">' +
          '<span class="lg-cat-e">' + c.e + '</span>' +
          '<span class="lg-cat-mn">' + App.escapeHtml(c.n) + '</span>' +
          '<span class="lg-cat-mt">' + (c.type === 'inc' ? '收入' : '支出') + '</span>' +
          '<button class="btn ghost" type="button" data-del-cat="' + i + '">删除</button>' +
          '</div>'
        ).join('');
      }
      catsSetModal.querySelector('#lg-cats-save').addEventListener('click', closeCatsManage);
      catsSetModal.addEventListener('click', (e) => {
        if (e.target === catsSetModal) closeCatsManage();
        const delBtn = e.target.closest('[data-del-cat]');
        if (delBtn) {
          const idx = parseInt(delBtn.dataset.delCat, 10);
          const removed = cats()[idx];
          if (removed) {
            App.confirm('删除分类', '删除「' + removed.n + '」？已用该分类的记录会标记为「待分类」。', () => {
              state.cats.splice(idx, 1);
              save();
              paintCatsManageList();
              paintCats(); paintRecords(); paintSummary(); paintCalendar();
              App.toast('已删除分类');
            });
          }
        }
      });
      catsSetModal.querySelector('#lg-cat-add-btn').addEventListener('click', () => {
        const e = catsSetModal.querySelector('#lg-cat-add-e').value.trim();
        const n = catsSetModal.querySelector('#lg-cat-add-n').value.trim();
        const type = catsSetModal.querySelector('#lg-cat-add-type').value;
        if (!n) { App.toast('请填写名称'); return; }
        if (cats().some((c) => c.n === n)) { App.toast('分类已存在'); return; }
        state.cats.push({ e: e || '🏷️', n: n, type: type });
        save();
        catsSetModal.querySelector('#lg-cat-add-e').value = '';
        catsSetModal.querySelector('#lg-cat-add-n').value = '';
        paintCatsManageList();
        paintCats();
        App.toast('已添加分类');
      });

      // ---------- 记账日历 ----------
      let calY = new Date().getFullYear();
      let calM = new Date().getMonth();   // 0-11
      let selDay = todayStr();
      let calEditId = null;

      function paintCalendar() {
        const calEl = container.querySelector('#lg-cal');
        const titleEl = container.querySelector('#lg-cal-title');
        if (!calEl) return;
        titleEl.textContent = calY + '年' + (calM + 1) + '月';
        const ym = calY + '-' + pad(calM + 1);
        const startDow = (new Date(calY, calM, 1).getDay() + 6) % 7; // 周一为 0
        const daysInMonth = new Date(calY, calM + 1, 0).getDate();
        const dayMap = {};
        state.records.forEach((r) => {
          if (r.date.slice(0, 7) !== ym) return;
          const d = parseInt(r.date.slice(8, 10), 10);
          dayMap[d] = dayMap[d] || { exp: 0, inc: 0 };
          if (r.type === 'inc') dayMap[d].inc += r.amount; else dayMap[d].exp += r.amount;
        });
        const wk = ['一', '二', '三', '四', '五', '六', '日'];
        let cells = '<div class="lg-cal-grid lg-cal-headrow">' + wk.map((w) => '<span>' + w + '</span>').join('') + '</div>';
        cells += '<div class="lg-cal-grid">';
        for (let i = 0; i < startDow; i++) cells += '<span class="lg-cal-cell empty"></span>';
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = calY + '-' + pad(calM + 1) + '-' + pad(d);
          const m = dayMap[d];
          let mark = '';
          if (m) {
            const net = m.inc - m.exp;
            const shown = (net >= 0 ? '+' : '−') + money(Math.abs(net)).replace('¥', '');
            mark = '<span class="lg-cal-net ' + (net >= 0 ? 'inc' : 'exp') + '">' + shown + '</span>';
          }
          const sel = ds === selDay ? ' sel' : '';
          const today = ds === todayStr() ? ' today' : '';
          cells += '<button class="lg-cal-cell' + (m ? ' has' : '') + sel + today + '" type="button" data-day="' + ds + '">' +
            '<span class="lg-cal-d">' + d + '</span>' + mark + '</button>';
        }
        cells += '</div>';
        calEl.innerHTML = cells;
        paintCalDetail();
      }

      function paintCalDetail() {
        const el = container.querySelector('#lg-cal-detail');
        if (!el) return;
        const list = state.records.filter((r) => r.date === selDay)
          .sort((a, b) => b.id.localeCompare(a.id));
        let exp = 0, inc = 0;
        list.forEach((r) => { if (r.type === 'inc') inc += r.amount; else exp += r.amount; });
        const head = '<div class="lg-cal-detail-head">' + selDay +
          ' · 收 ' + money(inc) + ' / 支 ' + money(exp) + ' / 净 ' + money(inc - exp) +
          ' <button class="btn ghost lg-cal-add-btn" type="button" data-cal-add="1">＋ 记一笔</button></div>';
        if (!list.length) {
          el.innerHTML = head + '<p class="muted" style="margin:8px 0 0">这一天还没有记账，点「记一笔」添加。</p>';
          return;
        }
        const rows = list.map((r) => {
          const cat = cats().find((c) => c.n === r.cat) || { e: r.cat ? '🏷️' : '❓', n: r.cat || '待分类' };
          const acc = ACCOUNTS.find((a) => a.k === r.account) || { e: '💵', n: '现金' };
          const sign = r.type === 'inc' ? '+' : '−';
          const note = r.note ? ' · ' + App.escapeHtml(r.note) : '';
          let html = '<div class="lg-cal-item ' + (r.type === 'inc' ? 'inc' : 'exp') +
            (calEditId === r.id ? ' editing' : '') + '" data-id="' + r.id + '">' +
            '<span class="lg-cal-item-e">' + cat.e + '</span>' +
            '<span class="lg-cal-item-meta"><span class="lg-cal-item-cat">' + App.escapeHtml(cat.n) + '</span>' +
            '<span class="lg-cal-item-acc">' + acc.e + acc.n + note + '</span></span>' +
            '<span class="lg-cal-item-amt">' + sign + money(r.amount) + '</span>' +
            '</div>';
          if (calEditId === r.id) {
            html += '<div class="lg-rec-edit" data-id="' + r.id + '">' +
              '<div class="ci-field"><span>金额</span><input type="number" inputmode="decimal" step="0.01" min="0" class="lg-cal-edit-amt" value="' + r.amount + '"></div>' +
              '<div class="lg-edit-label">类型</div>' +
              '<div class="lg-rec-cats">' +
              cats().map((c) => '<button class="lg-rec-cat' + (c.type === 'inc' ? ' inc' : '') +
                (r.cat === c.n ? ' on' : '') + '" type="button" data-cat="' + App.escapeHtml(c.n) + '">' + c.e + ' ' + c.n + '</button>').join('') +
              '</div>' +
              '<button class="btn ghost lg-rec-cat-add" type="button" data-open-cats="1">＋ 新建分类</button>' +
              '<div class="lg-edit-label">账户</div>' +
              '<div class="lg-rec-accts">' +
              ACCOUNTS.map((a) => '<button class="lg-rec-acct' + (r.account === a.k ? ' on' : '') +
                '" type="button" data-acct="' + a.k + '">' + a.e + ' ' + a.n + '</button>').join('') +
              '</div>' +
              '<div class="lg-rec-edit-actions">' +
              '  <button class="btn ghost" type="button" data-cal-edit-cancel="1">取消</button>' +
              '  <button class="btn" type="button" data-cal-edit-save="1">保存</button>' +
              '</div>' +
              '</div>';
          }
          return html;
        }).join('');
        el.innerHTML = head + rows;
      }

      container.querySelector('#lg-cal-prev').addEventListener('click', () => {
        calM--; if (calM < 0) { calM = 11; calY--; }
        paintCalendar();
      });
      container.querySelector('#lg-cal-next').addEventListener('click', () => {
        calM++; if (calM > 11) { calM = 0; calY++; }
        paintCalendar();
      });
      container.querySelector('#lg-cal').addEventListener('click', (e) => {
        const c = e.target.closest('[data-day]');
        if (!c) return;
        selDay = c.dataset.day;
        paintCalendar();
      });

      // 日历明细：当天新建 / 点击编辑 / 保存 / 取消
      const calDetailEl = container.querySelector('#lg-cal-detail');
      calDetailEl.addEventListener('click', (e) => {
        const addBtn = e.target.closest('[data-cal-add]');
        if (addBtn) {
          const r = { id: 'r' + Date.now(), date: selDay, cat: '', type: 'exp', account: pendingAccount, amount: 0, note: '' };
          state.records.push(r);
          calEditId = r.id;
          paintCalDetail();
          const inp = calDetailEl.querySelector('.lg-cal-edit-amt');
          if (inp) inp.focus();
          return;
        }
        const saveBtn = e.target.closest('[data-cal-edit-save]');
        if (saveBtn) {
          const item = saveBtn.closest('.lg-cal-item');
          const r = state.records.find((x) => x.id === item.dataset.id);
          if (r) {
            const block = saveBtn.closest('.lg-rec-edit');
            const amtVal = parseFloat(block.querySelector('.lg-cal-edit-amt').value);
            if (!amtVal || amtVal <= 0) { App.toast('请输入有效金额'); return; }
            const catBtn = block.querySelector('.lg-rec-cat.on');
            const acctBtn = block.querySelector('.lg-rec-acct.on');
            const cat = catBtn ? cats().find((c) => c.n === catBtn.dataset.cat) : null;
            r.amount = Math.round(amtVal * 100) / 100;
            if (cat) { r.cat = cat.n; r.type = cat.type; }
            if (acctBtn) r.account = acctBtn.dataset.acct;
            save();
            calEditId = null;
            paintBalance(); paintSummary(); paintCalendar();
            App.toast('已保存');
          }
          return;
        }
        const cancelBtn = e.target.closest('[data-cal-edit-cancel]');
        if (cancelBtn) {
          const item = cancelBtn.closest('.lg-cal-item');
          const r = state.records.find((x) => x.id === item.dataset.id);
          // 新增但未保存（金额为 0 且无分类）的空记录，取消即删除
          if (r && r.amount === 0 && !r.cat) {
            state.records = state.records.filter((x) => x.id !== r.id);
            save();
          }
          calEditId = null;
          paintCalDetail();
          return;
        }
        const openCatsBtn = e.target.closest('[data-open-cats]');
        if (openCatsBtn) { openCatsManage(); return; }
        const catBtn = e.target.closest('.lg-rec-cat');
        if (catBtn) {
          const item = catBtn.closest('.lg-cal-item');
          const r = state.records.find((x) => x.id === item.dataset.id);
          const c = cats().find((x) => x.n === catBtn.dataset.cat);
          if (r && c) { r.cat = c.n; r.type = c.type; save(); paintBalance(); paintSummary(); paintCalendar(); }
          return;
        }
        const acctBtn = e.target.closest('.lg-rec-acct');
        if (acctBtn) {
          const item = acctBtn.closest('.lg-cal-item');
          const r = state.records.find((x) => x.id === item.dataset.id);
          if (r) { r.account = acctBtn.dataset.acct; save(); paintBalance(); paintSummary(); paintCalendar(); }
          return;
        }
        const item = e.target.closest('.lg-cal-item');
        if (item && !e.target.closest('.lg-rec-edit')) {
          const id = item.dataset.id;
          calEditId = (calEditId === id) ? null : id;
          paintCalDetail();
        }
      });

      // ---------- GitHub 同步 ----------
      const ghModal = container.querySelector('#lg-gh-modal');
      const ghBody = container.querySelector('#lg-gh-body');
      ghModal.querySelector('#lg-gh-close').addEventListener('click', () => { ghModal.hidden = true; });
      ghModal.addEventListener('click', (e) => { if (e.target === ghModal) ghModal.hidden = true; });

      function ghStatusHtml() {
        if (!G) return '<p class="muted">同步模块未加载。</p>';
        if (G.isConnected()) {
          return '<p style="margin:0 0 10px">已连接 GitHub，数据会自动同步到仓库 <code>data/ledger.json</code>。</p>' +
            '<button class="btn ghost" type="button" id="lg-gh-logout">断开连接</button>';
        }
        return '<p class="muted" style="margin:0 0 10px">点「开始连接」后，会显示一个验证码，' +
          '去 github.com/login/device 输入即可（无需密码/密钥）。</p>' +
          '<button class="btn" type="button" id="lg-gh-start">开始连接</button>';
      }
      function bindGhButtons() {
        const startBtn = ghBody.querySelector('#lg-gh-start');
        if (startBtn) startBtn.addEventListener('click', doLogin);
        const lo = ghBody.querySelector('#lg-gh-logout');
        if (lo) lo.addEventListener('click', () => { G.logout(); paintGhModal(); App.toast('已断开连接'); });
      }
      function paintGhModal() { ghBody.innerHTML = ghStatusHtml(); bindGhButtons(); }

      async function doLogin() {
        if (!G) return;
        ghBody.innerHTML = '<p>正在获取设备码…</p>';
        let flow;
        try {
          flow = await G.startDeviceFlow();
        } catch (e) {
          ghBody.innerHTML = '<p style="color:#c0392b">发起失败：' + (e.message || e) + '</p>' +
            '<button class="btn" type="button" id="lg-gh-start">重试</button>';
          bindGhButtons();
          return;
        }
        ghBody.innerHTML =
          '<p>请在浏览器打开：<a href="' + flow.verification_uri + '" target="_blank" rel="noopener">' + flow.verification_uri + '</a></p>' +
          '<p>输入验证码：<b style="font-size:20px;letter-spacing:2px">' + flow.user_code + '</b></p>' +
          '<p class="muted" id="lg-gh-wait">等待授权…</p>';
        try {
          await G.pollToken(flow.device_code, flow.interval, (s) => {
            const w = ghBody.querySelector('#lg-gh-wait');
            if (w) w.textContent = (s === 'slow_down' ? '请稍候（服务器要求放慢轮询）…' : '等待授权…');
          });
          try {
            const { content } = await G.readFile();
            if (content && typeof content === 'object') {
              state = content;
              if (!Array.isArray(state.records)) state.records = [];
              if (!state.accounts) state.accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
              if (!Array.isArray(state.cats)) state.cats = JSON.parse(JSON.stringify(DEFAULT_CATS));
              if (typeof state.budget !== 'number') state.budget = 0;
              state.records.forEach((r) => { if (r && !r.account) r.account = 'cash'; });
              paintBalance(); paintCats(); paintAccts(); paintRecords(); paintSummary(); paintCalendar();
            } else {
              G.sync(state).catch(() => {}); // 仓库为空，上传本地
            }
          } catch (e) {
            App.toast('拉取仓库数据失败：' + (e.message || e));
          }
          paintGhModal();
          App.toast('已连接 GitHub，数据已同步');
        } catch (e) {
          ghBody.innerHTML = '<p style="color:#c0392b">授权失败：' + (e.message || e) + '</p>' +
            '<button class="btn" type="button" id="lg-gh-start">重试</button>';
          bindGhButtons();
        }
      }

      container.querySelector('#lg-gh').addEventListener('click', () => { paintGhModal(); ghModal.hidden = false; });

      // ---------- 首次渲染 ----------
      paintBalance();
      paintCats();
      paintAccts();
      paintRecords();
      paintSummary();
      paintCalendar();
      updateHint();

      // 已连接 GitHub 时，打开即拉取仓库最新数据（多端共享同一份）
      if (G && G.isConnected()) {
        G.readFile().then((res) => {
          if (res && res.content && typeof res.content === 'object') {
            state = res.content;
            if (!Array.isArray(state.records)) state.records = [];
            if (!state.accounts) state.accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
            if (!Array.isArray(state.cats)) state.cats = JSON.parse(JSON.stringify(DEFAULT_CATS));
            if (typeof state.budget !== 'number') state.budget = 0;
            state.records.forEach((r) => { if (r && !r.account) r.account = 'cash'; });
            paintBalance(); paintCats(); paintAccts(); paintRecords(); paintSummary(); paintCalendar();
          }
        }).catch((e) => { /* 离线则用本地数据，不影响使用 */ });
      }
    }
  });
})();
