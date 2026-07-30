/**
 * 小说拆文：
 * - 自己创建「书」(长篇 / 短篇)
 * - 每本书 7 个 tab：标题分析 / 导语分析 / 核心梗分析 / 人设分析 / 付费节点分析 / 摘抄 / 其他分析
 * - 导航栏简称：标题 / 导语 / 核心梗 / 人设 / 付费节点 / 摘抄 / 其他
 * - 每条 item 支持「文字」或「手写图片」(text+img 至少一个)
 * - 编辑/添加弹层沾满一页，全屏可写
 * - 顶部 tab：📚 我的书 / 📑 全部摘抄 / 💡 全部分析 / 📈 榜单
 */
App.registerFeature({
  id: 'notes',
  title: '拆文',
  desc: '小说拆文便签',
  icon: '📝',
  color: '#b08bbf',
  render(container) {
    const KEY = 'novelnotes.v1';

    // ---------- 7 个 tab 配置 ----------
    const TABS = [
      { key: 'title',    short: '标题',     full: '标题分析',     field: 'titleAnalysis' },
      { key: 'tagline',  short: '导语',     full: '导语分析',     field: 'taglineAnalysis' },
      { key: 'hook',     short: '核心梗',   full: '核心梗分析',   field: 'hookAnalysis' },
      { key: 'chars',    short: '人设',     full: '人设分析',     field: 'charsAnalysis' },
      { key: 'payNode',  short: '付费节点', full: '付费节点分析', field: 'payNodeAnalysis' },
      { key: 'quotes',   short: '摘抄',     full: '摘抄',         field: 'quotes' },
      { key: 'other',    short: '其他',     full: '其他分析',     field: 'otherAnalysis' },
    ];
    const fieldOf = (k) => (TABS.find((t) => t.key === k) || {}).field;
    const labelOf = (k) => (TABS.find((t) => t.key === k) || {}).full || k;
    const fullList = TABS.map((t) => t.full).join('/');

    // ---------- 存储 ----------
    // book = { id, title, type, emoji,
    //   titleAnalysis, taglineAnalysis, hookAnalysis, charsAnalysis,
    //   payNodeAnalysis, otherAnalysis, quotes: [ {id,text,img,createdAt} ],
    //   createdAt }
    function ensureArrays(b) {
      TABS.forEach((t) => { b[t.field] = Array.isArray(b[t.field]) ? b[t.field] : []; });
      b.type = (b.type === 'long' || b.type === 'short') ? b.type : 'short';
      b.emoji = b.emoji || '📕';
    }
    function migrate(old) {
      if (!old || typeof old !== 'object') return { books: [] };
      if (Array.isArray(old.books)) {
        old.books.forEach((b) => {
          // 旧结构迁移：tagline/hook/chars 字符串 -> 各自一条 entry
          const wrap = (s) => s && String(s).trim()
            ? [{ id: 'm' + Math.random().toString(36).slice(2, 8), text: String(s), img: '', createdAt: Date.now() }]
            : [];
          b.titleAnalysis   = b.titleAnalysis   || [];
          b.taglineAnalysis = b.taglineAnalysis || wrap(b.tagline);
          b.hookAnalysis    = b.hookAnalysis    || wrap(b.hook);
          b.charsAnalysis   = b.charsAnalysis   || wrap(b.chars);
          b.payNodeAnalysis = b.payNodeAnalysis || [];
          b.otherAnalysis   = b.otherAnalysis   || (Array.isArray(b.analyses) ? b.analyses : []);
          b.quotes          = Array.isArray(b.quotes) ? b.quotes : [];
          // 清掉旧字段
          delete b.tagline; delete b.hook; delete b.chars; delete b.analyses;
          ensureArrays(b);
        });
        return old;
      }
      // 极旧的 {cats,types,notes} 结构
      const oldCats = Array.isArray(old.cats) ? old.cats : [];
      const oldNotes = Array.isArray(old.notes) ? old.notes : [];
      const now = Date.now();
      const byCat = {};
      oldNotes.forEach((n) => { if (n.catId) (byCat[n.catId] = byCat[n.catId] || []).push(n); });
      const books = oldCats.map((c) => {
        const name = String(c.name || '').replace(/^[《]/, '').replace(/[》]$/, '');
        const qs = (byCat[c.id] || []).map((n) => ({
          id: n.id || ('q' + Math.random().toString(36).slice(2, 8)),
          text: n.text || '', img: '', createdAt: n.createdAt || now,
        }));
        const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
        return Object.assign({
          id: 'b' + Math.random().toString(36).slice(2, 10),
          title: name || '未命名', type: 'short', emoji: '📕',
          quotes: qs, createdAt: now,
        }, empty);
      });
      const orphans = oldNotes.filter((n) => !n.catId);
      if (orphans.length) {
        const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
        books.push(Object.assign({
          id: 'b' + Math.random().toString(36).slice(2, 10),
          title: '随手记录', type: 'short', emoji: '📓',
          quotes: orphans.map((n) => ({ id: n.id || ('q' + Math.random().toString(36).slice(2, 8)), text: n.text || '', img: '', createdAt: n.createdAt || now })),
          createdAt: now,
        }, empty));
      }
      return { books };
    }
    function load() {
      try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return migrate(d); } catch (e) {}
      return { books: [] };
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(data)); if (window.Sync) Sync.markDirty(); }
    let data = load();

    const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function getBook(id) { return data.books.find((b) => b.id === id); }

    // ---------- 状态 ----------
    let view = 'books';           // books | detail | rank | allQuotes | allAnalyses
    let currentBookId = null;
    let suppressPaint = false;

    // ---------- 骨架 ----------
    container.innerHTML =
      '<div class="nn">' +
      '  <div class="nn-head" id="nn-head">' +
      '    <h2 id="nn-title">小说拆文</h2>' +
      '  </div>' +
      '  <div class="nn-tabs" id="nn-tabs">' +
      '    <button class="nn-tab on" data-view="books" type="button">📚 我的书</button>' +
      '    <button class="nn-tab" data-view="allQuotes" type="button">📑 全部摘抄</button>' +
      '    <button class="nn-tab" data-view="allAnalyses" type="button">💡 全部分析</button>' +
      '    <button class="nn-tab" data-view="rank" type="button">📈 榜单</button>' +
      '  </div>' +
      '  <div class="nn-body" id="nn-body"></div>' +
      '  <button class="nn-fab" id="nn-fab" type="button" aria-label="新建">＋</button>' +
      '</div>';

    const bodyEl = container.querySelector('#nn-body');
    const titleEl = container.querySelector('#nn-title');
    const tabsEl = container.querySelector('#nn-tabs');
    const fabEl = container.querySelector('#nn-fab');

    tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('.nn-tab');
      if (!b) return;
      view = b.dataset.view;
      tabsEl.querySelectorAll('.nn-tab').forEach((t) => t.classList.toggle('on', t === b));
      if (view !== 'detail') currentBookId = null;
      fabEl.style.display = (view === 'books') ? '' : 'none';
      paint();
    });
    fabEl.addEventListener('click', () => openBookEditor(null));

    // ---------- 我的书（书架） ----------
    function paintBooks() {
      const books = data.books;
      const cards = books.length
        ? books.map((b) => {
            const tint = b.type === 'long' ? 'long' : 'short';
            const total = TABS.reduce((s, t) => s + (b[t.field] || []).length, 0);
            return '<div class="nn-book" data-bid="' + b.id + '">' +
                    '  <div class="nn-book-cover">' +
                    '    <div class="nn-book-spine"></div>' +
                    '    <div class="nn-book-front">' +
                    '      <div class="nn-book-title">' + App.escapeHtml(b.title) + '</div>' +
                    '      <div class="nn-book-type nn-book-type-' + tint + '">' + (tint === 'long' ? '📚 长篇' : '📖 短篇') + '</div>' +
                    '    </div>' +
                    '    <div class="nn-book-back"></div>' +
                    '  </div>' +
                    '  <div class="nn-book-meta">' +
                    '    <span>共 ' + total + ' 条</span>' +
                    '  </div>' +
                    '</div>';
          }).join('')
        : '<div class="nn-shelf-empty">' +
          '  <div class="nn-shelf-emoji">📚</div>' +
          '  <p class="muted">书架还是空的，点右下角 ＋ 创建你的第一本书吧。</p>' +
          '</div>';
      bodyEl.innerHTML = '<div class="nn-shelf">' + cards + '</div>';

      bodyEl.querySelectorAll('.nn-book').forEach((card) => {
        card.addEventListener('click', () => {
          if (card.classList.contains('opening')) return;
          card.classList.add('opening');
          const bid = card.dataset.bid;
          setTimeout(() => {
            view = 'detail';
            currentBookId = bid;
            paint();
          }, 620);
        });
      });
    }

    // ---------- 书籍详情：7 tab 横滑 ----------
    function paintDetail() {
      const b = getBook(currentBookId);
      if (!b) { view = 'books'; paintBooks(); return; }
      const tint = b.type === 'long' ? 'long' : 'short';
      const total = TABS.reduce((s, t) => s + (b[t.field] || []).length, 0);

      // 7 个 tab 页面
      const pages = TABS.map((t, i) => {
        const arr = b[t.field] || [];
        const list = arr.length
          ? arr.map((it) => itemRow(t.key, it)).join('')
          : '<p class="muted nn-empty-inline">还没有内容，点「＋ 添加」开始记录。</p>';
        return '<div class="nn-pp" data-pp="' + t.key + '">' +
               '  <div class="nn-pp-section-head">' +
               '    <span>' + App.escapeHtml(t.full) + '</span>' +
               '    <button class="btn sm" data-add="' + t.key + '" type="button">＋ 添加</button>' +
               '  </div>' +
               '  <div class="nn-section-list">' + list + '</div>' +
               '</div>';
      }).join('');

      const tabsBtns = TABS.map((t, i) =>
        '<button class="nn-page-tab' + (i === 0 ? ' on' : '') + '" data-tab="' + t.key + '" type="button">' + App.escapeHtml(t.short) + '</button>'
      ).join('');
      const dots = TABS.map((t, i) =>
        '<span class="nn-page-pager-dot' + (i === 0 ? ' on' : '') + '" data-go="' + i + '"></span>'
      ).join('');

      bodyEl.innerHTML =
        '<div class="nn-page">' +
        '  <div class="nn-page-bar">' +
        '    <button class="btn ghost sm nn-back-btn" id="nn-back" type="button">← 书架</button>' +
        '    <span class="nn-pp-book-tag nn-book-type-' + tint + '">' + (tint === 'long' ? '📚 长篇' : '📖 短篇') + '</span>' +
        '    <div class="nn-book-title-mini">' + App.escapeHtml(b.title) + '</div>' +
        '    <button class="btn sm ghost" id="nn-edit-book" type="button">编辑</button>' +
        '    <button class="btn sm danger" id="nn-del-book" type="button">删除</button>' +
        '  </div>' +
        '  <div class="nn-page-tabs" id="nn-page-tabs">' + tabsBtns + '</div>' +
        '  <div class="nn-pages" id="nn-pages">' + pages + '</div>' +
        '  <div class="nn-page-pager" id="nn-page-pager">' + dots + '</div>' +
        '</div>';

      // 顶部小卡片：第 1 个 tab（标题）显示书名/类型/总数，所以覆盖 title page 内容
      const titlePage = bodyEl.querySelector('.nn-pp[data-pp="title"]');
      if (titlePage) {
        titlePage.innerHTML =
          '<div class="nn-pp-title-card">' +
          '  <h2 class="nn-pp-book-title">' + App.escapeHtml(b.title) + '</h2>' +
          '  <span class="nn-book-type nn-book-type-' + tint + '">' + (tint === 'long' ? '📚 长篇' : '📖 短篇') + '</span>' +
          '  <p class="muted nn-pp-meta">共 ' + total + ' 条内容 · 7 个维度</p>' +
          '  <div class="nn-pp-section-head" style="margin-top:14px">' +
          '    <span>标题分析</span>' +
          '    <button class="btn sm" data-add="title" type="button">＋ 添加</button>' +
          '  </div>' +
          '  <div class="nn-section-list">' +
          ((b.titleAnalysis || []).length
            ? b.titleAnalysis.map((it) => itemRow('title', it)).join('')
            : '<p class="muted nn-empty-inline">还没有标题分析，点「＋ 添加」开始。</p>') +
          '  </div>' +
          '</div>';
      }

      // 返回
      bodyEl.querySelector('#nn-back').addEventListener('click', () => {
        view = 'books'; currentBookId = null;
        fabEl.style.display = ''; titleEl.textContent = '小说拆文';
        tabsEl.querySelector('[data-view="books"]').classList.add('on');
        tabsEl.querySelectorAll('[data-view]').forEach((t) => { if (t.dataset.view !== 'books') t.classList.remove('on'); });
        paint();
      });
      // 编辑书
      bodyEl.querySelector('#nn-edit-book').addEventListener('click', () => openBookEditor(b));
      // 删除书
      bodyEl.querySelector('#nn-del-book').addEventListener('click', () => {
        const sum = TABS.map((t) => (b[t.field] || []).length + ' ' + t.short).join(' · ');
        App.confirm('删除这本书', '《' + b.title + '》\n' + sum + '\n\n删除后无法恢复，继续？', () => {
          data.books = data.books.filter((x) => x.id !== b.id);
          save();
          view = 'books'; currentBookId = null;
          titleEl.textContent = '小说拆文';
          fabEl.style.display = '';
          tabsEl.querySelector('[data-view="books"]').classList.add('on');
          tabsEl.querySelectorAll('[data-view]').forEach((t) => { if (t.dataset.view !== 'books') t.classList.remove('on'); });
          paint();
          App.toast('已删除');
        });
      });

      // 横滑同步
      const pagesEl = bodyEl.querySelector('#nn-pages');
      const tabBtns = bodyEl.querySelectorAll('.nn-page-tab');
      const pagerDots = bodyEl.querySelectorAll('.nn-page-pager-dot');
      function goTo(i) {
        const w = pagesEl.clientWidth || 1;
        pagesEl.scrollTo({ left: i * w, behavior: 'smooth' });
      }
      pagesEl.addEventListener('scroll', () => {
        const i = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
        tabBtns.forEach((bb, idx) => bb.classList.toggle('on', idx === i));
        pagerDots.forEach((d, idx) => d.classList.toggle('on', idx === i));
      });
      tabBtns.forEach((bb, i) => bb.addEventListener('click', () => goTo(i)));
      pagerDots.forEach((d) => d.addEventListener('click', () => goTo(+d.dataset.go)));

      // 添加
      bodyEl.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', () => openItemEditor(b, btn.dataset.add, null, paintDetail));
      });
      // 编辑
      bodyEl.querySelectorAll('[data-iedit]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, iid] = btn.dataset.iedit.split('|');
          const field = fieldOf(k);
          const arr = b[field] || [];
          const it = arr.find((x) => x.id === iid);
          if (it) openItemEditor(b, k, it, paintDetail);
        });
      });
      // 删除
      bodyEl.querySelectorAll('[data-idel]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, iid] = btn.dataset.idel.split('|');
          const field = fieldOf(k);
          const name = labelOf(k);
          App.confirm('删除' + name, '确认删除这条' + name + '？', () => {
            b[field] = (b[field] || []).filter((x) => x.id !== iid);
            save(); paintDetail();
            App.toast('已删除');
          });
        });
      });
      // 查看大图
      bodyEl.querySelectorAll('[data-viewimg]').forEach((img) => {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          openImageViewer(img.dataset.viewimg);
        });
      });
    }

    // 单条 item 渲染：支持 文字 / 手写图 / 两者
    function itemRow(key, it) {
      const textHtml = it.text
        ? '<div class="nn-item-text">' + App.escapeHtml(it.text) + '</div>' : '';
      const imgHtml = it.img
        ? '<div class="nn-item-img-wrap"><img class="nn-item-img" data-viewimg="' + it.img + '" src="' + it.img + '" alt="手写" /></div>' : '';
      const tag = (it.text && it.img) ? '图文' : (it.img ? '手写' : '文字');
      return '<div class="nn-item">' +
              '  <div class="nn-item-meta">' +
              '    <span class="nn-item-tag">' + tag + '</span>' +
              '    <span class="muted">' + fmtDate(it.createdAt) + '</span>' +
              '  </div>' +
                imgHtml + textHtml +
              '  <div class="nn-item-ops">' +
              '    <button class="nn-op" data-iedit="' + key + '|' + it.id + '" type="button" aria-label="编辑">✏️</button>' +
              '    <button class="nn-op" data-idel="' + key + '|' + it.id + '" type="button" aria-label="删除">✕</button>' +
              '  </div>' +
              '</div>';
    }

    // ---------- 大图查看 ----------
    function openImageViewer(src) {
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      wrap.innerHTML =
        '<div class="nn-img-viewer">' +
        '  <button class="nn-img-close" type="button">✕</button>' +
        '  <img src="' + src + '" alt="查看大图" />' +
        '</div>';
      document.body.appendChild(wrap);
      function close() { wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('.nn-img-close')) close(); });
    }

    // ---------- 添加/编辑：全屏弹层，文字 + 手写切换 ----------
    function openItemEditor(book, key, existing, onDone) {
      const isNew = !existing;
      const field = fieldOf(key);
      const tab = TABS.find((t) => t.key === key) || {};
      const fullName = tab.full || key;
      const hint = key === 'quotes' ? '抄录精彩的句子、好词好句……' : '拆解这一维度的写作要点、技巧、节奏……';
      openFullEditor({
        title: (isNew ? '添加' : '编辑') + '·' + fullName,
        text: existing ? existing.text : '',
        img: existing ? existing.img : '',
        hint: hint,
        onSave: (text, img) => {
          const t = (text || '').trim();
          if (!t && !img) { App.toast('文字和手写不能都为空'); return; }
          if (isNew) {
            (book[field] = book[field] || []).push({
              id: uid(key),
              text: t, img: img || '',
              createdAt: Date.now(),
            });
          } else {
            existing.text = t; existing.img = img || '';
          }
          save();
          (onDone || paintDetail)();
          App.toast(isNew ? '已添加' : '已更新');
        },
      });
    }

    // ---------- 全屏编辑器：文字 + 手写两 tab ----------
    function openFullEditor({ title, text, img, hint, onSave }) {
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      let curText = text || '';
      let curImg = img || '';
      let mode = text || !img ? 'text' : 'draw';   // 默认文字优先
      wrap.innerHTML =
        '<div class="nn-sheet nn-sheet-full">' +
        '  <div class="nn-sheet-bar">' +
        '    <button class="btn ghost sm" data-close type="button">取消</button>' +
        '    <div class="nn-sheet-title">' + App.escapeHtml(title) + '</div>' +
        '    <button class="btn sm" id="fe-save" type="button">保存</button>' +
        '  </div>' +
        '  <div class="nn-edit-tabs">' +
        '    <button class="nn-edit-tab on" data-mode="text" type="button">⌨️ 文字</button>' +
        '    <button class="nn-edit-tab" data-mode="draw" type="button">✍️ 手写</button>' +
        '  </div>' +
        '  <div class="nn-edit-area" id="fe-area">' +
        // 文字区
        '    <div class="nn-edit-pane nn-edit-text" data-pane="text">' +
        (hint ? '<p class="muted nn-edit-hint">' + App.escapeHtml(hint) + '</p>' : '') +
        '      <textarea id="fe-text" placeholder="可留空"></textarea>' +
        '    </div>' +
        // 手写区
        '    <div class="nn-edit-pane nn-edit-draw" data-pane="draw" hidden>' +
        '      <div class="nn-draw-bar">' +
        '        <label class="muted">笔触</label>' +
        '        <input type="range" id="fe-pen" min="1" max="10" step="1" value="3" />' +
        '        <span id="fe-pen-v" class="muted">3</span>' +
        '        <button class="btn ghost sm" id="fe-undo" type="button">↶ 撤销</button>' +
        '        <button class="btn ghost sm" id="fe-clear" type="button">🗑 清空</button>' +
        '      </div>' +
        '      <div class="nn-draw-wrap"><canvas id="fe-canvas"></canvas></div>' +
        '    </div>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      const ta = wrap.querySelector('#fe-text');
      ta.value = curText;
      const canvas = wrap.querySelector('#fe-canvas');
      const ctx = canvas.getContext('2d');
      let drawing = false, lastX = 0, lastY = 0;
      let penW = 3, strokes = [], curStroke = null;

      function resizeCanvas() {
        // 设置 canvas 尺寸为容器尺寸 * devicePixelRatio
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(r.width * dpr));
        canvas.height = Math.max(1, Math.floor(r.height * dpr));
        canvas.style.width = r.width + 'px';
        canvas.style.height = r.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#274027';
        // 重放历史
        redraw();
      }

      function redraw() {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        ctx.clearRect(0, 0, r.width, r.height);
        // 浅米色背景便于看
        ctx.fillStyle = '#fdfbf5';
        ctx.fillRect(0, 0, r.width, r.height);
        // 网格
        ctx.strokeStyle = '#e8e2d0';
        ctx.lineWidth = 1;
        for (let x = 0; x < r.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke(); }
        for (let y = 0; y < r.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke(); }
        // 笔触
        const all = strokes.concat(curStroke ? [curStroke] : []);
        all.forEach((s) => {
          if (!s.pts || s.pts.length < 1) return;
          ctx.beginPath();
          ctx.strokeStyle = '#274027';
          ctx.lineWidth = s.w;
          ctx.moveTo(s.pts[0].x, s.pts[0].y);
          for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
          ctx.stroke();
        });
      }

      function pos(e) {
        const r = canvas.getBoundingClientRect();
        const t = (e.touches && e.touches[0]) || e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      }
      function start(e) {
        e.preventDefault();
        drawing = true; const p = pos(e); lastX = p.x; lastY = p.y;
        curStroke = { w: penW, pts: [{ x: p.x, y: p.y }] };
        redraw();
      }
      function move(e) {
        if (!drawing) return; e.preventDefault();
        const p = pos(e);
        curStroke.pts.push({ x: p.x, y: p.y });
        // 增量画
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        ctx.strokeStyle = '#274027'; ctx.lineWidth = curStroke.w;
        ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
        lastX = p.x; lastY = p.y;
      }
      function end(e) {
        if (!drawing) return; e && e.preventDefault && e.preventDefault();
        drawing = false;
        if (curStroke) { strokes.push(curStroke); curStroke = null; }
      }
      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
      canvas.addEventListener('touchcancel', end);

      // 笔触 / 撤销 / 清空
      const penEl = wrap.querySelector('#fe-pen');
      const penV = wrap.querySelector('#fe-pen-v');
      penEl.addEventListener('input', () => { penW = +penEl.value; penV.textContent = penW; });
      wrap.querySelector('#fe-undo').addEventListener('click', () => { strokes.pop(); redraw(); });
      wrap.querySelector('#fe-clear').addEventListener('click', () => {
        App.confirm('清空手写', '清空当前画板上的所有笔触？', () => { strokes = []; curStroke = null; redraw(); });
      });

      // 如果是编辑现有手写图，先把 img 画到画板
      if (curImg) {
        const tmp = new Image();
        tmp.onload = () => {
          setTimeout(resizeCanvas, 30);
          const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
          // 简单等比缩放绘制
          const ratio = Math.min(r.width / tmp.width, r.height / tmp.height);
          const w = tmp.width * ratio, h = tmp.height * ratio;
          ctx.drawImage(tmp, (r.width - w) / 2, (r.height - h) / 2, w, h);
          // 这种情况下保存时直接导出当前 canvas 即可
        };
        tmp.src = curImg;
      } else {
        setTimeout(resizeCanvas, 30);
      }
      window.addEventListener('resize', resizeCanvas);

      // 模式切换
      const modeBtns = wrap.querySelectorAll('.nn-edit-tab');
      const panes = wrap.querySelectorAll('.nn-edit-pane');
      function setMode(m) {
        mode = m;
        modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
        panes.forEach((p) => p.hidden = (p.dataset.pane !== m));
        if (m === 'draw') setTimeout(resizeCanvas, 30);
        if (m === 'text') setTimeout(() => ta.focus(), 30);
      }
      modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

      // 关闭
      function close() {
        window.removeEventListener('mouseup', end);
        window.removeEventListener('resize', resizeCanvas);
        wrap.remove();
      }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('[data-close]')) close(); });

      // 保存
      wrap.querySelector('#fe-save').addEventListener('click', () => {
        curText = ta.value;
        // 如果当前在手写模式，导出 canvas 为 dataURL
        if (mode === 'draw') {
          const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
          // 如果画板为空（没有 strokes 且没原图），curImg 置空
          if (strokes.length === 0 && !curImg) {
            curImg = '';
          } else {
            // 临时画一个干净背景
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width; tmp.height = canvas.height;
            const tctx = tmp.getContext('2d');
            tctx.drawImage(canvas, 0, 0);
            curImg = tmp.toDataURL('image/png');
          }
        }
        close();
        try { onSave(curText, curImg); } catch (e) { console.error(e); App.toast('保存失败'); }
      });

      setMode(mode);
      setTimeout(() => { if (mode === 'text') ta.focus(); }, 60);
    }

    // ---------- 新建/编辑书（弹层） ----------
    function openBookEditor(existing) {
      const isNew = !existing;
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      let curType = existing ? existing.type : 'short';
      wrap.innerHTML =
        '<div class="nn-sheet">' +
        '  <h3>' + (isNew ? '新建一本' : '编辑书') + '</h3>' +
        '  <input id="nb-title" type="text" maxlength="20" placeholder="书名（10字以内最佳）" value="' + (existing ? App.escapeHtml(existing.title) : '') + '" />' +
        '  <div>' +
        '    <p class="muted nb-h">类型</p>' +
        '    <div class="nb-type">' +
        '      <button class="nb-type-btn' + (curType === 'short' ? ' on' : '') + '" data-t="short" type="button">📖 短篇</button>' +
        '      <button class="nb-type-btn' + (curType === 'long' ? ' on' : '') + '" data-t="long" type="button">📚 长篇</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="nn-e-btns">' +
        '    <button class="btn ghost" data-close type="button">取消</button>' +
        '    <button class="btn" id="nb-ok" type="button">' + (isNew ? '创建' : '保存') + '</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      const titleI = wrap.querySelector('#nb-title');
      wrap.querySelector('.nb-type').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]'); if (!b) return;
        curType = b.dataset.t;
        wrap.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      });
      function close() { wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('[data-close]')) close(); });
      wrap.querySelector('#nb-ok').addEventListener('click', () => {
        const t = titleI.value.trim();
        if (!t) { App.toast('请输入书名'); return; }
        if (isNew) {
          const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
          data.books.push(Object.assign({
            id: uid('b'), title: t, type: curType, emoji: '📕',
            quotes: [], createdAt: Date.now(),
          }, empty));
        } else {
          existing.title = t; existing.type = curType;
        }
        save(); close();
        paint();
        App.toast(isNew ? '已创建' : '已更新');
      });
      setTimeout(() => titleI.focus(), 60);
    }

    // ---------- 知乎榜单 ----------
    const RANK = [
      { t: '承珠冠', a: '李迟迟', tag: '古言', d: '命中注定的弑君者 vs 忠犬追随者。' },
      { t: '你已有取死之道', a: '海的鸽子', tag: '古言·爽文', d: '追妻火葬场女主 vs 一言不合就被鲨的男主们。' },
      { t: '吃人心的小妖怪', a: '女巫', tag: '志怪', d: '心软小妖怪 vs 淳朴善良村民。' },
      { t: '山回路转不见鸡', a: '旺旺大队长', tag: '仙侠·种田', d: '捡个男人只为种地的女主。' },
      { t: '阿缨', a: '鸠森', tag: '古言', d: '真心错付落魄贵女 vs 纨绔但护短小狗弟弟。' },
      { t: '沙洲秘事', a: '应不染', tag: '悬疑·IP榜', d: '入选 2026「最具转化价值文学IP推荐榜」。' },
      { t: '死到临头', a: '咸良', tag: '悬疑', d: '作者前作改编电影《恶意》票房 2.54 亿。' },
      { t: '照殿红', a: '盐选热门', tag: '脑洞·短篇', d: '女主手握照殿红四次穿越的时空闭环设定。' },
    ];
    let rankData = {
      updatedAt: '2026-07-30（内置快照）',
      lists: [
        { name: '热度榜', items: RANK.slice(0, 5) },
        { name: '新书榜', items: RANK.slice(5, 8) },
        { name: '推荐榜', items: RANK.slice(0, 3).concat(RANK.slice(6, 8)) },
      ],
    };
    fetch('data/rank.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && Array.isArray(j.lists) && j.lists.length) { rankData = j; if (view === 'rank') paintRank(); } })
      .catch(() => {});

    function paintRank() {
      const listsHtml = rankData.lists.map((L) =>
        '<div class="nn-rank-list-name">' + App.escapeHtml(L.name) + '</div>' +
        (L.items || []).map((r, i) =>
          '<div class="nn-rank-item">' +
          '  <div class="nn-rank-no">' + (i + 1) + '</div>' +
          '  <div class="nn-rank-main">' +
          '    <div class="nn-rank-title">《' + App.escapeHtml(r.t) + '》' +
            (r.tag ? '<span class="nn-rank-tag">' + App.escapeHtml(r.tag) + '</span>' : '') + '</div>' +
          '    <div class="nn-rank-author muted">' + App.escapeHtml(r.a || '') + '</div>' +
          '    <div class="nn-rank-desc">' + App.escapeHtml(r.d || '') + '</div>' +
          '  </div>' +
          '  <button class="nn-chip sm nn-rank-fav" data-fav="' + App.escapeHtml(r.t) + '" type="button">收藏为书</button>' +
          '</div>'
        ).join('')
      ).join('');
      bodyEl.innerHTML =
        '<div class="nn-rank">' +
        '  <p class="muted nn-rank-tip">知乎盐言故事榜单 · 更新于 ' + App.escapeHtml(rankData.updatedAt || '—') + '（每天自动抓取，不含长篇榜）。点「收藏为书」即可创建该书的拆文本。</p>' +
          listsHtml +
        '</div>';

      bodyEl.querySelectorAll('[data-fav]').forEach((b) =>
        b.addEventListener('click', () => {
          const name = b.dataset.fav;
          const empty = { titleAnalysis: [], taglineAnalysis: [], hookAnalysis: [], charsAnalysis: [], payNodeAnalysis: [], otherAnalysis: [] };
          data.books.push(Object.assign({
            id: uid('b'), title: name, type: 'short', emoji: '📕',
            quotes: [], createdAt: Date.now(),
          }, empty));
          save();
          App.toast('已创建《' + name + '》到书架');
        })
      );
    }

    // ---------- 全部摘抄 / 全部分析（不分书） ----------
    function paintAll(kind, label, emoji) {
      const all = [];
      data.books.forEach((b) => {
        TABS.forEach((t) => {
          if (kind === 'quotes' ? t.key !== 'quotes' : t.key === 'quotes') return;
          (b[t.field] || []).forEach((it) => all.push({ book: b, tab: t, item: it }));
        });
      });
      all.sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0));

      const rows = all.length
        ? all.map(({ book, tab, item }) => {
            const textHtml = item.text ? '<div class="nn-item-text">' + App.escapeHtml(item.text) + '</div>' : '';
            const imgHtml = item.img ? '<div class="nn-item-img-wrap"><img class="nn-item-img" data-viewimg="' + item.img + '" src="' + item.img + '" alt="手写" /></div>' : '';
            return '<div class="nn-item nn-item-all" data-bid="' + book.id + '" data-iid="' + item.id + '">' +
                   '  <div class="nn-item-meta">' +
                   '    <span class="nn-item-tag">' + App.escapeHtml(tab.full) + '</span>' +
                   '    <span class="nn-item-from" data-goto="' + book.id + '">' + App.escapeHtml(book.title) + '</span>' +
                   '    <span class="muted">' + fmtDate(item.createdAt) + '</span>' +
                   '  </div>' +
                     imgHtml + textHtml +
                   '  <div class="nn-item-ops">' +
                   '    <button class="nn-op" data-iedit="' + tab.key + '|' + book.id + '|' + item.id + '" type="button" aria-label="编辑">✏️</button>' +
                   '    <button class="nn-op" data-idel="' + tab.key + '|' + book.id + '|' + item.id + '" type="button" aria-label="删除">✕</button>' +
                   '  </div>' +
                   '</div>';
          }).join('')
        : '<div class="nn-shelf-empty"><div class="nn-shelf-emoji">' + emoji + '</div>' +
          '<p class="muted">还没有' + label + '。点「📚 我的书」进入任意一本书，添加内容。</p></div>';

      bodyEl.innerHTML =
        '<div class="nn-all">' +
        '  <p class="muted nn-all-tip">共 ' + all.length + ' 条' + label + '（按时间倒序，点书名跳到该书）</p>' +
        '  <div class="nn-section-list">' + rows + '</div>' +
        '</div>';

      bodyEl.querySelectorAll('[data-goto]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const bid = el.dataset.goto;
          view = 'detail'; currentBookId = bid; paint();
        });
      });
      bodyEl.querySelectorAll('[data-iedit]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const parts = btn.dataset.iedit.split('|');
          const k = parts[0], bid = parts[1], iid = parts[2];
          const b = getBook(bid); if (!b) return;
          const field = fieldOf(k);
          const it = (b[field] || []).find((x) => x.id === iid);
          if (it) openItemEditor(b, k, it, paint);
        });
      });
      bodyEl.querySelectorAll('[data-idel]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const parts = btn.dataset.idel.split('|');
          const k = parts[0], bid = parts[1], iid = parts[2];
          const b = getBook(bid); if (!b) return;
          const field = fieldOf(k);
          const name = labelOf(k);
          App.confirm('删除' + name, '确认删除这条' + name + '？', () => {
            b[field] = (b[field] || []).filter((x) => x.id !== iid);
            save(); paint(); App.toast('已删除');
          });
        });
      });
      bodyEl.querySelectorAll('[data-viewimg]').forEach((img) => {
        img.addEventListener('click', (e) => { e.stopPropagation(); openImageViewer(img.dataset.viewimg); });
      });
    }

    function fmtDate(t) {
      if (!t) return '';
      const d = new Date(t);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function paint() {
      if (view === 'books') paintBooks();
      else if (view === 'detail') paintDetail();
      else if (view === 'rank') paintRank();
      else if (view === 'allQuotes') paintAll('quotes', '摘抄', '📑');
      else if (view === 'allAnalyses') paintAll('analyses', '分析', '💡');
    }
    paint();
  }
});
