/**
 * 小说拆文：
 * - 自己创建「书」(长篇 / 短篇)
 * - 每本书 7 个 tab：标题分析 / 导语分析 / 核心梗分析 / 人设分析 / 付费节点分析 / 摘抄 / 其他分析
 * - 每条 item 支持「文字」+「多页手写」(向量笔触：多色笔 / 荧光笔 / 橡皮擦 / 套索选择 / 撤回还原)
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
    const FIELDS = TABS.map((t) => t.field);
    const fieldOf = (k) => (TABS.find((t) => t.key === k) || {}).field;
    const labelOf = (k) => (TABS.find((t) => t.key === k) || {}).full || k;
    const fullList = TABS.map((t) => t.full).join('/');

    // ---------- 存储 ----------
    // book = { id, title, type, emoji,
    //   titleAnalysis, taglineAnalysis, hookAnalysis, charsAnalysis,
    //   payNodeAnalysis, otherAnalysis, quotes: [ {id,text,drawings:[{id,strokes,thumb,img}],createdAt} ],
    //   createdAt }
    function ensureArrays(b) {
      FIELDS.forEach((f) => { b[f] = Array.isArray(b[f]) ? b[f] : []; });
      b.type = (b.type === 'long' || b.type === 'short') ? b.type : 'short';
      b.emoji = b.emoji || '📕';
    }
    // 单条 item：旧 {text,img} -> {text,drawings}
    function migrateItem(it) {
      if (!it || typeof it !== 'object') return { id: 'i' + Math.random().toString(36).slice(2, 8), text: '', drawings: [], createdAt: Date.now() };
      if ('img' in it && !('drawings' in it)) {
        it.drawings = it.img ? [{ id: 'd' + Math.random().toString(36).slice(2, 8), strokes: [], img: it.img, thumb: it.img }] : [];
        delete it.img;
      }
      if (!Array.isArray(it.drawings)) it.drawings = [];
      if (!it.text) it.text = '';
      if (!it.id) it.id = 'i' + Math.random().toString(36).slice(2, 8);
      if (!it.createdAt) it.createdAt = Date.now();
      it.drawings.forEach((d) => {
        if (!Array.isArray(d.strokes)) d.strokes = [];
        if (!d.id) d.id = 'd' + Math.random().toString(36).slice(2, 8);
        d.strokes.forEach((s) => { if (!s.tool) s.tool = 'pen'; if (!s.color) s.color = '#274027'; if (!s.width) s.width = 3; });
      });
      return it;
    }
    function migrate(old) {
      if (!old || typeof old !== 'object') return { books: [] };
      if (Array.isArray(old.books)) {
        old.books.forEach((b) => {
          const wrap = (s) => s && String(s).trim()
            ? [{ id: 'm' + Math.random().toString(36).slice(2, 8), text: String(s), drawings: [], createdAt: Date.now() }]
            : [];
          b.titleAnalysis   = b.titleAnalysis   || [];
          b.taglineAnalysis = b.taglineAnalysis || wrap(b.tagline);
          b.hookAnalysis    = b.hookAnalysis    || wrap(b.hook);
          b.charsAnalysis   = b.charsAnalysis   || wrap(b.chars);
          b.payNodeAnalysis = b.payNodeAnalysis || [];
          b.otherAnalysis   = b.otherAnalysis   || (Array.isArray(b.analyses)
            ? b.analyses.map((a) => ({ id: a.id || ('m' + Math.random().toString(36).slice(2, 8)), text: a.text || '', drawings: [], createdAt: a.createdAt || Date.now() }))
            : []);
          b.quotes          = Array.isArray(b.quotes) ? b.quotes : [];
          FIELDS.forEach((f) => { b[f] = (b[f] || []).map(migrateItem); });
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
          text: n.text || '', drawings: [], createdAt: n.createdAt || now,
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
          quotes: orphans.map((n) => ({ id: n.id || ('q' + Math.random().toString(36).slice(2, 8)), text: n.text || '', drawings: [], createdAt: n.createdAt || now })),
          createdAt: now,
        }, empty));
      }
      return { books };
    }
    function load() {
      try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return migrate(d); } catch (e) {}
      return { books: [] };
    }
    function save() {
      localStorage.setItem(KEY, JSON.stringify(data));
      // markDirty 绝不应影响本地保存结果
      if (window.Sync) { try { Sync.markDirty(); } catch (e) {} }
    }
    let data = load();

    const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function getBook(id) { return data.books.find((b) => b.id === id); }

    // ---------- 手写笔色 ----------
    const PEN_COLORS = ['#274027', '#1f3a8a', '#b82929', '#c47a16', '#2f7d32', '#8a2b8a', '#222222', '#0d6b6b'];

    // ---------- 状态 ----------
    let view = 'books';           // books | detail | rank | allQuotes | allAnalyses
    let currentBookId = null;
    let suppressPaint = false;
    let activeTabKey = 'title';   // 记录最后一次停留的分页，重绘后恢复，避免保存后跳回标题

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
              activeTabKey = 'title';
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

      const pages = TABS.map((t, i) => {
        const arr = b[t.field] || [];
        const list = arr.length
          ? arr.map((it) => itemRow(t.key, it, b.id)).join('')
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
            ? b.titleAnalysis.map((it) => itemRow('title', it, b.id)).join('')
            : '<p class="muted nn-empty-inline">还没有标题分析，点「＋ 添加」开始。</p>') +
          '  </div>' +
          '</div>';
      }

      bodyEl.querySelector('#nn-back').addEventListener('click', () => {
        view = 'books'; currentBookId = null;
        fabEl.style.display = ''; titleEl.textContent = '小说拆文';
        tabsEl.querySelector('[data-view="books"]').classList.add('on');
        tabsEl.querySelectorAll('[data-view]').forEach((t) => { if (t.dataset.view !== 'books') t.classList.remove('on'); });
        paint();
      });
      bodyEl.querySelector('#nn-edit-book').addEventListener('click', () => openBookEditor(b));
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

      const pagesEl = bodyEl.querySelector('#nn-pages');
      const tabBtns = bodyEl.querySelectorAll('.nn-page-tab');
      const pagerDots = bodyEl.querySelectorAll('.nn-page-pager-dot');
      function goTo(i) {
        const w = pagesEl.clientWidth || 1;
        pagesEl.scrollTo({ left: i * w, behavior: 'smooth' });
      }
      pagesEl.addEventListener('scroll', () => {
        const i = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
        if (TABS[i]) activeTabKey = TABS[i].key;
        tabBtns.forEach((bb, idx) => bb.classList.toggle('on', idx === i));
        pagerDots.forEach((d, idx) => d.classList.toggle('on', idx === i));
      });
      tabBtns.forEach((bb, i) => bb.addEventListener('click', () => { activeTabKey = TABS[i].key; goTo(i); }));
      pagerDots.forEach((d) => d.addEventListener('click', () => { const i = +d.dataset.go; if (TABS[i]) activeTabKey = TABS[i].key; goTo(i); }));

      bodyEl.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', () => openItemEditor(b, btn.dataset.add, null, paintDetail));
      });
      bodyEl.querySelectorAll('[data-iedit]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, iid] = btn.dataset.iedit.split('|');
          const field = fieldOf(k);
          const it = (b[field] || []).find((x) => x.id === iid);
          if (it) openItemEditor(b, k, it, paintDetail);
        });
      });
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
      bindViewers();

      // 重绘后恢复到上次停留的分页（保存/删除操作后不再跳回标题）
      const restoreIdx = Math.max(0, TABS.findIndex((t) => t.key === activeTabKey));
      if (restoreIdx > 0) {
        setTimeout(() => {
          const w = pagesEl.clientWidth || 1;
          pagesEl.scrollLeft = restoreIdx * w;
          tabBtns.forEach((bb, idx) => bb.classList.toggle('on', idx === restoreIdx));
          pagerDots.forEach((d, idx) => d.classList.toggle('on', idx === restoreIdx));
        }, 0);
      }
    }

    // 单条 item 渲染：支持 文字 / 多页手写 / 两者
    function itemRow(key, it, bookId) {
      const textHtml = it.text
        ? '<div class="nn-item-text">' + App.escapeHtml(it.text) + '</div>' : '';
      const drawHtml = drawThumbsHtml(it, key, bookId);
      const hasText = !!it.text, hasDraw = (it.drawings || []).length > 0;
      const tag = (hasText && hasDraw) ? '图文' : (hasDraw ? '手写' : '文字');
      return '<div class="nn-item">' +
              '  <div class="nn-item-meta">' +
              '    <span class="nn-item-tag">' + tag + '</span>' +
              '    <span class="muted">' + fmtDate(it.createdAt) + '</span>' +
              '  </div>' +
                drawHtml + textHtml +
              '  <div class="nn-item-ops">' +
              '    <button class="nn-op" data-iedit="' + key + '|' + it.id + '" type="button" aria-label="编辑">✏️</button>' +
              '    <button class="nn-op" data-idel="' + key + '|' + it.id + '" type="button" aria-label="删除">✕</button>' +
              '  </div>' +
              '</div>';
    }

    // 手写缩略图区
    function drawThumbsHtml(it, key, bookId) {
      const draws = it.drawings || [];
      if (!draws.length) return '';
      return '<div class="nn-item-draws">' + draws.map((d, i) => {
        const src = d.thumb || d.img || '';
        return '<div class="nn-draw-thumb" data-vd="' + key + '|' + bookId + '|' + it.id + '|' + i + '">' +
          (src ? '<img src="' + src + '" alt="手写" />' : '<div class="nn-draw-empty">✍️</div>') +
          '</div>';
      }).join('') + '</div>';
    }

    // 绑定所有「查看手写大图」
    function bindViewers() {
      bodyEl.querySelectorAll('[data-vd]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, bid, iid, idx] = el.dataset.vd.split('|');
          openDrawingViewer(k, bid, iid, +idx);
        });
      });
    }

    // ---------- 手写大图查看（向量渲染） ----------
    function openDrawingViewer(key, bookId, itemId, idx) {
      const b = getBook(bookId); if (!b) return;
      const field = fieldOf(key);
      const it = (b[field] || []).find((x) => x.id === itemId); if (!it) return;
      const d = (it.drawings || [])[idx]; if (!d) return;
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      wrap.innerHTML =
        '<div class="nn-img-viewer">' +
        '  <button class="nn-img-close" type="button">✕</button>' +
        '  <div class="nn-viewer-canvas-wrap"><canvas id="nn-viewer-canvas"></canvas></div>' +
        '</div>';
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('#nn-viewer-canvas');
      function size() {
        const r = wrap.querySelector('.nn-viewer-canvas-wrap').getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        cv.width = Math.max(1, Math.floor(r.width * dpr));
        cv.height = Math.max(1, Math.floor(r.height * dpr));
        cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderStrokesTo(c, r.width, r.height, d, () => {});
      }
      setTimeout(size, 30);
      window.addEventListener('resize', size);
      function close() { window.removeEventListener('resize', size); wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('.nn-img-close')) close(); });
    }

    // 把一个 drawing（strokes/img）渲染到任意 2d 上下文（逻辑尺寸 W,H）
    const imgCache = {};
    function getImg(src, cb) {
      if (imgCache[src]) { if (imgCache[src].complete) cb(imgCache[src]); return; }
      const im = new Image();
      im.onload = () => { imgCache[src] = im; cb(im); };
      im.src = src;
    }
    function renderStrokesTo(ctx, W, H, d, onImg) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fdfbf5'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      function drawStrokes() {
        (d.strokes || []).forEach((s) => {
          if (!s.pts || s.pts.length === 0) return;
          ctx.beginPath();
          ctx.strokeStyle = s.color || '#274027';
          ctx.lineWidth = s.width || 3;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.globalAlpha = s.tool === 'marker' ? 0.42 : 1;
          ctx.moveTo(s.pts[0][0], s.pts[0][1]);
          for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }
      if (d.img) {
        getImg(d.img, (im) => {
          const ratio = Math.min(W / im.width, H / im.height);
          const w = im.width * ratio, h = im.height * ratio;
          ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
          drawStrokes();
          if (onImg) onImg();
        });
      } else {
        drawStrokes();
      }
    }

    // ---------- 添加/编辑：文字 + 多页手写（向量笔触） ----------
    function clonePages(arr) {
      return (arr || []).map((p) => ({
        id: p.id || uid('d'),
        strokes: (p.strokes || []).map((s) => ({
          pts: (s.pts || []).map((pt) => [pt[0], pt[1]]),
          color: s.color || '#274027',
          width: s.width || 3,
          tool: s.tool || 'pen',
        })),
        thumb: p.thumb || '',
        img: p.img || '',
        undo: [], redo: [],
      }));
    }

    function openItemEditor(book, key, existing, onDone) {
      const isNew = !existing;
      const field = fieldOf(key);
      const tab = TABS.find((t) => t.key === key) || {};
      const fullName = tab.full || key;
      const hint = key === 'quotes' ? '抄录精彩的句子、好词好句……' : '拆解这一维度的写作要点、技巧、节奏……';

      let pages = clonePages(existing ? existing.drawings : []);
      if (!pages.length) pages.push({ id: uid('d'), strokes: [], thumb: '', img: '', undo: [], redo: [] });
      let curText = existing ? (existing.text || '') : '';
      let mode = curText || pages[0].strokes.length ? (curText ? 'text' : 'draw') : 'text';

      openDrawEditor({
        title: (isNew ? '添加' : '编辑') + '·' + fullName,
        hint: hint,
        text: curText,
        pages: pages,
        onSave: (text, finalPages) => {
          const t = (text || '').trim();
          // 存盘时去掉 undo/redo 历史，减小体积、避免 localStorage 超额
          const kept = finalPages
            .filter((p) => (p.strokes && p.strokes.length) || p.img)
            .map((p) => ({ id: p.id, strokes: p.strokes || [], thumb: p.thumb || '', img: p.img || '' }));
          if (!t && !kept.length) { App.toast('文字和手写不能都为空'); return; }
          if (isNew) {
            (book[field] = book[field] || []).push({ id: uid(key), text: t, drawings: kept, createdAt: Date.now() });
          } else {
            existing.text = t; existing.drawings = kept;
          }
          try { save(); }
          catch (e) { console.error(e); App.toast('本地保存失败：存储空间可能已满，请删掉一些手写图片'); }
          (onDone || paintDetail)();
          App.toast(isNew ? '已添加' : '已更新');
        },
      });
    }

    // ---------- 全屏手写编辑器（多色 / 荧光 / 橡皮 / 套索 / 撤回还原 / 多页） ----------
    function openDrawEditor({ title, hint, text, pages, onSave }) {
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
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
        '  <div class="nn-edit-area">' +
        '    <div class="nn-edit-pane nn-edit-text" data-pane="text">' +
        (hint ? '<p class="muted nn-edit-hint">' + App.escapeHtml(hint) + '</p>' : '') +
        '      <textarea id="fe-text" placeholder="可留空"></textarea>' +
        '    </div>' +
        '    <div class="nn-edit-pane nn-edit-draw" data-pane="draw" hidden>' +
        '      <div class="hw">' +
        '        <div class="hw-row hw-tools">' +
        '          <button class="hw-tool on" data-tool="pen" type="button">🖊 笔</button>' +
        '          <button class="hw-tool" data-tool="marker" type="button">🖍 荧光</button>' +
        '          <button class="hw-tool" data-tool="eraser" type="button">🧽 橡皮</button>' +
        '          <button class="hw-tool" data-tool="lasso" type="button">⭕ 套索</button>' +
        '          <button class="hw-tool" id="hw-undo" type="button">↶ 撤回</button>' +
        '          <button class="hw-tool" id="hw-redo" type="button">↷ 还原</button>' +
        '        </div>' +
        '        <div class="hw-row hw-colors" id="hw-colors"></div>' +
        '        <div class="hw-row hw-opt">' +
        '          <label class="muted">粗细</label>' +
        '          <input type="range" id="hw-width" min="1" max="14" value="3" />' +
        '          <span id="hw-width-v" class="muted">3</span>' +
        '          <button class="hw-tool ghost" id="hw-clear" type="button">🗑 清空本页</button>' +
        '          <button class="hw-tool danger" id="hw-del-sel" type="button" hidden>🗑 删除选中</button>' +
        '          <span id="hw-tip" class="muted"></span>' +
        '        </div>' +
        '        <div class="nn-draw-wrap"><canvas id="fe-canvas"></canvas></div>' +
        '        <div class="hw-pages" id="hw-pages"></div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);

      const ta = wrap.querySelector('#fe-text');
      ta.value = text || '';
      const canvas = wrap.querySelector('#fe-canvas');
      const ctx = canvas.getContext('2d');
      const colorsEl = wrap.querySelector('#hw-colors');
      const widthEl = wrap.querySelector('#hw-width');
      const widthV = wrap.querySelector('#hw-width-v');
      const tipEl = wrap.querySelector('#hw-tip');
      const delSelBtn = wrap.querySelector('#hw-del-sel');

      let tool = 'pen';
      let curColor = PEN_COLORS[0];
      let curWidth = 3;
      let pageIndex = 0;
      let selected = new Set();
      let lassoPts = [];

      // 颜色色板
      colorsEl.innerHTML = PEN_COLORS.map((c, i) =>
        '<button class="hw-color' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" type="button" style="background:' + c + '"></button>'
      ).join('');
      colorsEl.querySelectorAll('.hw-color').forEach((b) => {
        b.addEventListener('click', () => {
          curColor = b.dataset.c;
          colorsEl.querySelectorAll('.hw-color').forEach((x) => x.classList.toggle('on', x === b));
        });
      });

      function page() { return pages[pageIndex]; }
      function snapshot() {
        return page().strokes.map((s) => ({ pts: s.pts.map((p) => [p[0], p[1]]), color: s.color, width: s.width, tool: s.tool }));
      }
      function commit(prev) { page().undo.push(prev); page().redo = []; updateUndoRedo(); }
      function applyStrokes(arr) { page().strokes = arr; selected.clear(); hideDelSel(); redraw(); updateUndoRedo(); }
      function updateUndoRedo() {
        wrap.querySelector('#hw-undo').disabled = page().undo.length === 0;
        wrap.querySelector('#hw-redo').disabled = page().redo.length === 0;
      }
      function showDelSel() { delSelBtn.hidden = selected.size === 0; tipEl.textContent = selected.size ? ('已选 ' + selected.size + ' 笔 · 拖动可移动') : ''; }
      function hideDelSel() { delSelBtn.hidden = true; tipEl.textContent = ''; }

      // ---------- 画布尺寸 ----------
      function resizeCanvas() {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(r.width * dpr));
        canvas.height = Math.max(1, Math.floor(r.height * dpr));
        canvas.style.width = r.width + 'px';
        canvas.style.height = r.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        redraw();
      }

      function drawBgGrid() {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        ctx.clearRect(0, 0, r.width, r.height);
        ctx.fillStyle = '#fdfbf5'; ctx.fillRect(0, 0, r.width, r.height);
        ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 1;
        for (let x = 0; x < r.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke(); }
        for (let y = 0; y < r.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke(); }
      }
      function drawImgFit(im) {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        const ratio = Math.min(r.width / im.width, r.height / im.height);
        const w = im.width * ratio, h = im.height * ratio;
        ctx.drawImage(im, (r.width - w) / 2, (r.height - h) / 2, w, h);
      }
      // 平滑路径：把采样点之间用二次贝塞尔曲线串起来（中点为锚点，相邻点为控制点）
      function strokeSmooth(s) {
        const pts = s.pts;
        if (!pts || pts.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        if (pts.length === 1) { ctx.stroke(); return; }
        if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); return; }
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
      }
      function drawStrokes() {
        (page().strokes || []).forEach((s, idx) => {
          if (!s.pts || s.pts.length === 0) return;
          ctx.strokeStyle = s.color || '#274027';
          ctx.lineWidth = s.width || 3;
          ctx.globalAlpha = s.tool === 'marker' ? 0.42 : 1;
          strokeSmooth(s);
          ctx.globalAlpha = 1;
          if (selected.has(idx)) {
            const bb = bbox(s);
            ctx.save();
            ctx.strokeStyle = '#e0533a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
            ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
            ctx.restore();
          }
        });
      }
      function drawLasso() {
        if (lassoPts.length < 2) return;
        ctx.save();
        ctx.strokeStyle = '#6a7ec4'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lassoPts[0][0], lassoPts[0][1]);
        for (let i = 1; i < lassoPts.length; i++) ctx.lineTo(lassoPts[i][0], lassoPts[i][1]);
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      function redraw() {
        drawBgGrid();
        const p = page();
        if (p.img) {
          getImg(p.img, (im) => { drawImgFit(im); drawStrokes(); drawLasso(); });
        }
        drawStrokes();
        drawLasso();
      }

      // ---------- 几何工具 ----------
      function bbox(s) {
        let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        s.pts.forEach((p) => { if (p[0] < minx) minx = p[0]; if (p[1] < miny) miny = p[1]; if (p[0] > maxx) maxx = p[0]; if (p[1] > maxy) maxy = p[1]; });
        return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
      }
      function distToSeg(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      }
      function pointInPoly(x, y, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      }
      function strokeInPoly(s, poly) { return s.pts.some((p) => pointInPoly(p[0], p[1], poly)); }
      function pointInStrokeBBox(x, y, s, m) {
        const b = bbox(s);
        return x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m;
      }

      // ---------- 画笔事件 ----------
      // MIN_STEP：相邻采样点的最小距离（像素）。小于这个距离的点直接丢弃，避免堆点数。
      // STEP：插值步长。距离 > STEP 时自动插入中间点，确保曲线丝滑。
      const MIN_STEP = 2;
      const STEP = 3.5;
      let drawing = false, lastX = 0, lastY = 0, curStroke = null, drawPrev = null;
      // drawnTo：画布上"已经画到的位置"。用它和最新点画一段贝塞尔，实时绘制也不会出现折痕。
      let drawnTo = null;
      let erasing = false, erasingChanged = false, erasePrev = null;
      let lassoing = false;
      let dragging = false, dragPrev = null, dragMoved = false, dragPrevSnap = null;

      function pos(e) {
        const r = canvas.getBoundingClientRect();
        const t = (e.touches && e.touches[0]) || e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      }

      // 距离太近直接丢弃 + 距离太远自动插值
      function pushSmoothPoint(stroke, x, y) {
        const last = stroke.pts[stroke.pts.length - 1];
        if (last) {
          const dx = x - last[0], dy = y - last[1];
          const d = Math.hypot(dx, dy);
          if (d < MIN_STEP) return false;
          const steps = Math.max(1, Math.ceil(d / STEP));
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            stroke.pts.push([last[0] + dx * t, last[1] + dy * t]);
          }
        } else {
          stroke.pts.push([x, y]);
        }
        return true;
      }

      function start(e) {
        e.preventDefault();
        const p = pos(e);
        if (tool === 'pen' || tool === 'marker') {
          drawing = true; lastX = p.x; lastY = p.y; drawPrev = snapshot();
          const w = tool === 'marker' ? Math.max(8, curWidth * 3) : curWidth;
          curStroke = { pts: [[p.x, p.y]], color: curColor, width: w, tool: tool };
          drawnTo = [p.x, p.y];
        } else if (tool === 'eraser') {
          erasing = true; erasingChanged = false; erasePrev = snapshot();
          lastX = p.x; lastY = p.y;
        } else if (tool === 'lasso') {
          lassoing = true; lassoPts = [[p.x, p.y]];
        } else if (tool === 'move') {
          // 点中已选中的笔画 -> 拖动
          let hit = -1;
          page().strokes.forEach((s, i) => { if (selected.has(i) && pointInStrokeBBox(p.x, p.y, s, 6)) hit = i; });
          if (hit >= 0) {
            dragging = true; dragMoved = false; dragPrev = p; dragPrevSnap = snapshot();
          } else {
            // 点空白处 -> 取消选择
            selected.clear(); hideDelSel(); redraw(); tool = 'pen'; setToolUI();
          }
        }
      }
      function move(e) {
        if (!drawing && !erasing && !lassoing && !dragging) return;
        e.preventDefault();
        const p = pos(e);
        if (drawing && curStroke) {
          const accepted = pushSmoothPoint(curStroke, p.x, p.y);
          if (!accepted) return;
          const newPt = curStroke.pts[curStroke.pts.length - 1];
          const prevPt = curStroke.pts.length >= 2 ? curStroke.pts[curStroke.pts.length - 2] : newPt;
          ctx.strokeStyle = curStroke.color; ctx.lineWidth = curStroke.width;
          ctx.globalAlpha = curStroke.tool === 'marker' ? 0.42 : 1;
          // 从上次画到的位置到新点，用"上一个采样点"作控制点，画一段二次贝塞尔
          ctx.beginPath();
          ctx.moveTo(drawnTo[0], drawnTo[1]);
          ctx.quadraticCurveTo(prevPt[0], prevPt[1], newPt[0], newPt[1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
          drawnTo = [newPt[0], newPt[1]];
          lastX = newPt[0]; lastY = newPt[1];
        } else if (erasing) {
          const er = Math.max(10, curWidth * 2 + 6);
          let removed = false;
          const strokes = page().strokes;
          for (let i = strokes.length - 1; i >= 0; i--) {
            if (strokes[i].pts.some((pt) => distToSeg(pt[0], pt[1], lastX, lastY, p.x, p.y) < er)) {
              strokes.splice(i, 1); removed = true;
            }
          }
          if (removed) { erasingChanged = true; redraw(); }
          lastX = p.x; lastY = p.y;
        } else if (lassoing) {
          lassoPts.push([p.x, p.y]); redraw();
        } else if (dragging) {
          const dx = p.x - dragPrev.x, dy = p.y - dragPrev.y;
          if (Math.abs(dx) > 0 || Math.abs(dy) > 0) dragMoved = true;
          page().strokes.forEach((s, i) => { if (selected.has(i)) s.pts.forEach((pt) => { pt[0] += dx; pt[1] += dy; }); });
          dragPrev = p; redraw();
        }
      }
      function end(e) {
        if (drawing) {
          drawing = false;
          if (curStroke) {
            // 入栈（已经在 pushSmoothPoint 里做过插值）
            if (curStroke.pts.length > 1) { page().strokes.push(curStroke); commit(drawPrev); }
            curStroke = null;
            drawnTo = null;
            redraw();
          }
        } else if (erasing) {
          erasing = false;
          if (erasingChanged) commit(erasePrev);
        } else if (lassoing) {
          lassoing = false;
          if (lassoPts.length >= 3) {
            selected = new Set();
            page().strokes.forEach((s, i) => { if (strokeInPoly(s, lassoPts)) selected.add(i); });
            if (selected.size) { tool = 'move'; setToolUI(); }
          }
          lassoPts = []; redraw(); showDelSel();
        } else if (dragging) {
          dragging = false;
          if (dragMoved) commit(dragPrevSnap);
        }
      }

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
      canvas.addEventListener('touchcancel', end);

      // 粗细
      widthEl.addEventListener('input', () => { curWidth = +widthEl.value; widthV.textContent = curWidth; });

      // 工具切换
      function setToolUI() {
        wrap.querySelectorAll('.hw-tool[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
        if (tool !== 'move') hideDelSel(); else showDelSel();
      }
      wrap.querySelectorAll('.hw-tool[data-tool]').forEach((b) => {
        b.addEventListener('click', () => {
          tool = b.dataset.tool;
          if (tool !== 'lasso') lassoPts = [];
          if (tool !== 'move') { selected.clear(); }
          setToolUI(); redraw();
        });
      });

      // 撤回 / 还原
      wrap.querySelector('#hw-undo').addEventListener('click', () => {
        const p = page();
        if (!p.undo.length) return;
        p.redo.push(snapshot());
        applyStrokes(p.undo.pop());
      });
      wrap.querySelector('#hw-redo').addEventListener('click', () => {
        const p = page();
        if (!p.redo.length) return;
        p.undo.push(snapshot());
        applyStrokes(p.redo.pop());
      });
      // 清空本页
      wrap.querySelector('#hw-clear').addEventListener('click', () => {
        const p = page();
        if (!p.strokes.length) return;
        App.confirm('清空本页', '清空当前页所有笔触？', () => { commit(snapshot()); p.strokes = []; selected.clear(); hideDelSel(); redraw(); });
      });
      // 删除选中
      delSelBtn.addEventListener('click', () => {
        if (!selected.size) return;
        const p = page();
        App.confirm('删除选中', '删除选中的 ' + selected.size + ' 笔？', () => {
          const prev = snapshot();
          p.strokes = p.strokes.filter((_, i) => !selected.has(i));
          selected.clear(); commit(prev); hideDelSel(); redraw();
        });
      });

      // ---------- 多页 ----------
      function makeThumb(p) {
        const r = wrap.querySelector('.nn-draw-wrap').getBoundingClientRect();
        if (r.width < 2) { p.thumb = p.img || ''; return; }
        const off = document.createElement('canvas');
        off.width = canvas.width; off.height = canvas.height;
        const octx = off.getContext('2d');
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderStrokesTo(octx, r.width, r.height, p, () => {});
        const tw = 120, th = Math.max(1, Math.round(tw * r.height / Math.max(1, r.width)));
        const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
        tc.getContext('2d').drawImage(off, 0, 0, tw, th);
        p.thumb = tc.toDataURL('image/png');
      }
      function renderPages() {
        const el = wrap.querySelector('#hw-pages');
        el.innerHTML = pages.map((p, i) =>
          '<div class="hw-page' + (i === pageIndex ? ' on' : '') + '" data-pi="' + i + '">' +
          (p.thumb ? '<img src="' + p.thumb + '" alt="页' + (i + 1) + '" />' : '<div class="hw-page-empty">✍️</div>') +
          '<span class="hw-page-no">' + (i + 1) + '</span>' +
          (pages.length > 1 ? '<button class="hw-page-del" data-del="' + i + '" type="button">✕</button>' : '') +
          '</div>'
        ).join('') +
        '<button class="hw-page hw-page-add" id="hw-page-add" type="button">＋</button>';
        el.querySelectorAll('.hw-page[data-pi]').forEach((b) => {
          b.addEventListener('click', (e) => {
            if (e.target.closest('.hw-page-del')) return;
            switchPage(+b.dataset.pi);
          });
        });
        el.querySelectorAll('.hw-page-del').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            const i = +b.dataset.del;
            App.confirm('删除此页', '删除第 ' + (i + 1) + ' 页手写？', () => {
              if (pages.length <= 1) { pages[0].strokes = []; pages[0].thumb = ''; }
              else { pages.splice(i, 1); if (pageIndex >= pages.length) pageIndex = pages.length - 1; }
              selected.clear(); hideDelSel(); redraw(); renderPages(); updateUndoRedo();
            });
          });
        });
        el.querySelector('#hw-page-add').addEventListener('click', () => {
          pages.push({ id: uid('d'), strokes: [], thumb: '', img: '', undo: [], redo: [] });
          pageIndex = pages.length - 1; selected.clear(); hideDelSel(); redraw(); renderPages(); updateUndoRedo();
        });
      }
      function switchPage(i) {
        if (i === pageIndex || i < 0 || i >= pages.length) return;
        makeThumb(page());
        pageIndex = i;
        selected.clear(); hideDelSel();
        redraw(); renderPages(); updateUndoRedo();
      }

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

      function close() {
        window.removeEventListener('mouseup', end);
        window.removeEventListener('resize', resizeCanvas);
        wrap.remove();
      }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('[data-close]')) close(); });

      // 保存
      wrap.querySelector('#fe-save').addEventListener('click', () => {
        makeThumb(page());
        if (mode === 'draw') makeThumb(page());
        close();
        try { onSave(ta.value, pages); } catch (e) { console.error(e); App.toast('保存失败'); }
      });

      setMode(mode);
      setTimeout(() => { if (mode === 'draw') resizeCanvas(); else ta.focus(); }, 60);
      renderPages(); updateUndoRedo();
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
            const drawHtml = drawThumbsHtml(item, tab.key, book.id);
            const hasText = !!item.text, hasDraw = (item.drawings || []).length > 0;
            const tag = (hasText && hasDraw) ? '图文' : (hasDraw ? '手写' : '文字');
            return '<div class="nn-item nn-item-all" data-bid="' + book.id + '">' +
                   '  <div class="nn-item-meta">' +
                   '    <span class="nn-item-tag">' + App.escapeHtml(tab.full) + '</span>' +
                   '    <span class="nn-item-from" data-goto="' + book.id + '">' + App.escapeHtml(book.title) + '</span>' +
                   '    <span class="muted">' + fmtDate(item.createdAt) + '</span>' +
                   '  </div>' +
                     drawHtml + textHtml +
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
          view = 'detail'; currentBookId = el.dataset.goto; paint();
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
      bindViewers();
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
