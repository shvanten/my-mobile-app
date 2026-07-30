/**
 * 小说拆文：
 * - 自己创建「书」(长篇 / 短篇)，选择封面图标
 * - 每个书里可写：导语、核心梗、人设
 * - 每个书里有两个列表：分析、摘抄（每条可编辑/删除）
 * - 书架视图：书本形象卡片，点击有翻书动画进入详情
 * - 保留「📈 榜单」tab 作为知乎盐言故事榜单参考（自动抓取）
 */
App.registerFeature({
  id: 'notes',
  title: '拆文',
  desc: '小说拆文便签',
  icon: '📝',
  color: '#b08bbf',
  render(container) {
    const KEY = 'novelnotes.v1';

    // ---------- 存储 ----------
    // 新结构：{ books: [{id,title,type,emoji,tagline,hook,chars,analyses:[],quotes:[],createdAt}] }
    function migrate(old) {
      // 旧结构 {cats:[{id,name}], types:[...], notes:[{id,text,type,catId,createdAt}]}
      if (!old || typeof old !== 'object') return { books: [] };
      if (Array.isArray(old.books)) {
        old.books.forEach((b) => {
          b.analyses = Array.isArray(b.analyses) ? b.analyses : [];
          b.quotes = Array.isArray(b.quotes) ? b.quotes : [];
          b.type = (b.type === 'long' || b.type === 'short') ? b.type : 'short';
          b.emoji = b.emoji || '📕';
          b.tagline = b.tagline || '';
          b.hook = b.hook || '';
          b.chars = b.chars || '';
        });
        return old;
      }
      const oldCats = Array.isArray(old.cats) ? old.cats : [];
      const oldNotes = Array.isArray(old.notes) ? old.notes : [];
      const now = Date.now();
      const byCat = {};
      oldNotes.forEach((n) => {
        if (!n.catId) return;
        (byCat[n.catId] = byCat[n.catId] || []).push(n);
      });
      const books = oldCats.map((c) => {
        const name = String(c.name || '').replace(/^[《]/, '').replace(/[》]$/, '');
        const qs = (byCat[c.id] || []).map((n) => ({
          id: n.id || ('q' + Math.random().toString(36).slice(2, 8)),
          text: n.text || '',
          createdAt: n.createdAt || now,
        }));
        return {
          id: 'b' + Math.random().toString(36).slice(2, 10),
          title: name || '未命名',
          type: 'short', emoji: '📕',
          tagline: '', hook: '', chars: '',
          analyses: [], quotes: qs,
          createdAt: now,
        };
      });
      // 没有分类的便签进「随手记录」
      const orphans = oldNotes.filter((n) => !n.catId);
      if (orphans.length) {
        books.push({
          id: 'b' + Math.random().toString(36).slice(2, 10),
          title: '随手记录', type: 'short', emoji: '📓',
          tagline: '之前没归入作品的便签', hook: '', chars: '',
          analyses: [],
          quotes: orphans.map((n) => ({
            id: n.id || ('q' + Math.random().toString(36).slice(2, 8)),
            text: n.text || '', createdAt: n.createdAt || now,
          })),
          createdAt: now,
        });
      }
      return { books };
    }
    function load() {
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d) return migrate(d);
      } catch (e) { /* ignore */ }
      return { books: [] };
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
    let data = load();

    const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function getBook(id) { return data.books.find((b) => b.id === id); }

    // ---------- 状态 ----------
    let view = 'books';           // books | detail | rank
    let currentBookId = null;
    let suppressPaint = false;    // 翻书动画期间 阻止 paintBooks 重排

    // ---------- 骨架 ----------
    container.innerHTML =
      '<div class="nn">' +
      '  <div class="nn-head" id="nn-head">' +
      '    <h2 id="nn-title">小说拆文</h2>' +
      '    <div class="nn-tabs" id="nn-tabs">' +
      '      <button class="nn-tab on" data-view="books" type="button">📚 我的书</button>' +
      '      <button class="nn-tab" data-view="rank" type="button">📈 榜单</button>' +
      '    </div>' +
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
            const qn = (b.quotes || []).length;
            const an = (b.analyses || []).length;
            return '<div class="nn-book" data-bid="' + b.id + '">' +
                    '  <div class="nn-book-cover">' +
                    '    <div class="nn-book-spine"></div>' +
                    '    <div class="nn-book-front">' +
                    '      <div class="nn-book-emoji">' + App.escapeHtml(b.emoji || '📕') + '</div>' +
                    '      <div class="nn-book-title">' + App.escapeHtml(b.title) + '</div>' +
                    '      <div class="nn-book-type nn-book-type-' + tint + '">' + (tint === 'long' ? '📚 长篇' : '📖 短篇') + '</div>' +
                    '    </div>' +
                    '    <div class="nn-book-back"></div>' +
                    '  </div>' +
                    '  <div class="nn-book-meta">' +
                    '    <span>摘抄 ' + qn + '</span><span>分析 ' + an + '</span>' +
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

    // ---------- 书籍详情 ----------
    function paintDetail() {
      const b = getBook(currentBookId);
      if (!b) { view = 'books'; paintBooks(); return; }
      const tint = b.type === 'long' ? 'long' : 'short';
      const analyses = b.analyses || [];
      const quotes = b.quotes || [];
      const aHtml = analyses.length
        ? analyses.map((it) => itemRow('a', it)).join('')
        : '<p class="muted nn-empty-inline">还没有分析，点击下方「＋ 添加」。</p>';
      const qHtml = quotes.length
        ? quotes.map((it) => itemRow('q', it)).join('')
        : '<p class="muted nn-empty-inline">还没有摘抄，点击下方「＋ 添加」。</p>';

      bodyEl.innerHTML =
        '<div class="nn-page">' +
        '  <div class="nn-page-bar">' +
        '    <button class="btn ghost sm nn-back-btn" id="nn-back" type="button">← 书架</button>' +
        '  </div>' +
        '  <div class="nn-page-head">' +
        '    <div class="nn-page-emoji">' + App.escapeHtml(b.emoji || '📕') + '</div>' +
        '    <div class="nn-page-titles">' +
        '      <h2>' + App.escapeHtml(b.title) +
                '<span class="nn-book-type nn-book-type-' + tint + '">' + (tint === 'long' ? '📚 长篇' : '📖 短篇') + '</span></h2>' +
        '      <p class="muted nn-page-tagline">' + (b.tagline ? App.escapeHtml(b.tagline) : '（点击下方「导语 · 编辑」写一句话简介）') + '</p>' +
        '    </div>' +
        '    <div class="nn-page-actions">' +
        '      <button class="btn sm ghost" id="nn-edit-book" type="button">编辑</button>' +
        '      <button class="btn sm danger" id="nn-del-book" type="button">删除</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="nn-section">' +
        '    <div class="nn-section-head"><h3>导语</h3><button class="btn sm ghost" id="nn-edit-tagline" type="button">编辑</button></div>' +
        '    <div class="nn-section-body">' + (b.tagline ? App.escapeHtml(b.tagline) : '<span class="muted">（未写导语）</span>') + '</div>' +
        '  </div>' +
        '  <div class="nn-section">' +
        '    <div class="nn-section-head"><h3>核心梗</h3><button class="btn sm ghost" id="nn-edit-hook" type="button">编辑</button></div>' +
        '    <div class="nn-section-body">' + (b.hook ? '<div class="nn-text">' + App.escapeHtml(b.hook) + '</div>' : '<span class="muted">（未写核心梗）</span>') + '</div>' +
        '  </div>' +
        '  <div class="nn-section">' +
        '    <div class="nn-section-head"><h3>人设</h3><button class="btn sm ghost" id="nn-edit-chars" type="button">编辑</button></div>' +
        '    <div class="nn-section-body">' + (b.chars ? '<div class="nn-text">' + App.escapeHtml(b.chars) + '</div>' : '<span class="muted">（未写人设）</span>') + '</div>' +
        '  </div>' +
        '  <div class="nn-section">' +
        '    <div class="nn-section-head"><h3>分析</h3><button class="btn sm" id="nn-add-analysis" type="button">＋ 添加</button></div>' +
        '    <div class="nn-section-list">' + aHtml + '</div>' +
        '  </div>' +
        '  <div class="nn-section">' +
        '    <div class="nn-section-head"><h3>摘抄</h3><button class="btn sm" id="nn-add-quote" type="button">＋ 添加</button></div>' +
        '    <div class="nn-section-list">' + qHtml + '</div>' +
        '  </div>' +
        '</div>';

      bodyEl.querySelector('#nn-back').addEventListener('click', () => {
        view = 'books';
        currentBookId = null;
        fabEl.style.display = '';
        titleEl.textContent = '小说拆文';
        tabsEl.querySelector('[data-view="books"]').classList.add('on');
        tabsEl.querySelector('[data-view="rank"]').classList.remove('on');
        paint();
      });
      bodyEl.querySelector('#nn-edit-book').addEventListener('click', () => openBookEditor(b));
      bodyEl.querySelector('#nn-del-book').addEventListener('click', () => {
        const qn = (b.quotes || []).length, an = (b.analyses || []).length;
        App.confirm('删除这本书', '《' + b.title + '》含 ' + qn + ' 条摘抄、' + an + ' 条分析。删除后无法恢复，继续？', () => {
          data.books = data.books.filter((x) => x.id !== b.id);
          save();
          view = 'books'; currentBookId = null;
          titleEl.textContent = '小说拆文';
          fabEl.style.display = '';
          tabsEl.querySelector('[data-view="books"]').classList.add('on');
          tabsEl.querySelector('[data-view="rank"]').classList.remove('on');
          paint();
          App.toast('已删除');
        });
      });
      bodyEl.querySelector('#nn-edit-tagline').addEventListener('click', () => {
        App.prompt('导语', b.tagline || '', (v) => {
          if (v == null) return;
          b.tagline = String(v).trim();
          save(); paintDetail();
        }, { hint: '一句话简介这本书，可留空' });
      });
      bodyEl.querySelector('#nn-edit-hook').addEventListener('click', () => {
        openLongTextEditor('核心梗', b.hook || '', (v) => {
          b.hook = v; save(); paintDetail();
        }, '这本书的核心冲突或设定，可以是几句话');
      });
      bodyEl.querySelector('#nn-edit-chars').addEventListener('click', () => {
        openLongTextEditor('人设', b.chars || '', (v) => {
          b.chars = v; save(); paintDetail();
        }, '主要角色的人设要点（女主/男主/反派等），可写多行');
      });
      bodyEl.querySelector('#nn-add-analysis').addEventListener('click', () => openItemEditor(b, 'a', null));
      bodyEl.querySelector('#nn-add-quote').addEventListener('click', () => openItemEditor(b, 'q', null));
      bodyEl.querySelectorAll('[data-iedit]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, id] = btn.dataset.iedit.split('-');
          const arr = k === 'a' ? b.analyses : b.quotes;
          const it = arr.find((x) => x.id === id);
          if (it) openItemEditor(b, k, it);
        });
      });
      bodyEl.querySelectorAll('[data-idel]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [k, id] = btn.dataset.idel.split('-');
          const title = k === 'a' ? '分析' : '摘抄';
          App.confirm('删除' + title, '确认删除这条' + title + '？', () => {
            if (k === 'a') b.analyses = b.analyses.filter((x) => x.id !== id);
            else b.quotes = b.quotes.filter((x) => x.id !== id);
            save(); paintDetail();
            App.toast('已删除');
          });
        });
      });
    }
    function itemRow(kind, it) {
      return '<div class="nn-item">' +
              '  <div class="nn-item-text">' + App.escapeHtml(it.text) + '</div>' +
              '  <div class="nn-item-ops">' +
              '    <button class="nn-op" data-iedit="' + kind + '-' + it.id + '" type="button" aria-label="编辑">✏️</button>' +
              '    <button class="nn-op" data-idel="' + kind + '-' + it.id + '" type="button" aria-label="删除">✕</button>' +
              '  </div>' +
              '</div>';
    }

    // ---------- 通用弹层（带 textarea 多行） ----------
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
          data.books.push({
            id: uid('b'), title: t, type: curType, emoji: '📕',
            tagline: '', hook: '', chars: '',
            analyses: [], quotes: [],
            createdAt: Date.now(),
          });
        } else {
          existing.title = t; existing.type = curType;
        }
        save(); close();
        paint();
        App.toast(isNew ? '已创建' : '已更新');
      });
      setTimeout(() => titleI.focus(), 60);
    }

    function openLongTextEditor(title, val, onSave, hint) {
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      wrap.innerHTML =
        '<div class="nn-sheet">' +
        '  <h3>' + App.escapeHtml(title) + '</h3>' +
        (hint ? '<p class="muted nb-h" style="font-size:12px">' + App.escapeHtml(hint) + '</p>' : '') +
        '  <textarea id="lt-text" rows="7" placeholder="可留空">' + App.escapeHtml(val) + '</textarea>' +
        '  <div class="nn-e-btns">' +
        '    <button class="btn ghost" data-close type="button">取消</button>' +
        '    <button class="btn" id="lt-ok" type="button">保存</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      const txt = wrap.querySelector('#lt-text');
      function close() { wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.matches('[data-close]')) close(); });
      wrap.querySelector('#lt-ok').addEventListener('click', () => {
        const v = txt.value.replace(/\s+$/, '');
        close();
        try { onSave(v); } catch (e) { console.error(e); App.toast('保存失败'); }
      });
      setTimeout(() => txt.focus(), 60);
    }

    function openItemEditor(book, kind, existing) {
      const isNew = !existing;
      const isA = kind === 'a';
      const title = isA ? '分析条目' : '摘抄条目';
      const placeholder = isA ? '拆解一种写作技巧、节奏、人物塑造……' : '抄录精彩的句子、好词好句……';
      openLongTextEditor((isNew ? '添加' : '编辑') + title, existing ? existing.text : '', (v) => {
        if (!v) { App.toast('内容为空，未保存'); return; }
        if (isNew) {
          (isA ? book.analyses : book.quotes).push({ id: uid(kind), text: v, createdAt: Date.now() });
        } else {
          existing.text = v;
        }
        save(); paintDetail();
        App.toast(isNew ? '已添加' : '已更新');
      }, placeholder);
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
      .then((j) => {
        if (j && Array.isArray(j.lists) && j.lists.length) {
          rankData = j;
          if (view === 'rank') paintRank();
        }
      })
      .catch(() => { /* 离线/不存在时使用 RANK 兜底 */ });

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
          data.books.push({
            id: uid('b'), title: name, type: 'short', emoji: '📕',
            tagline: '', hook: '', chars: '',
            analyses: [], quotes: [],
            createdAt: Date.now(),
          });
          save();
          App.toast('已创建《' + name + '》到书架');
        })
      );
    }

    function paint() {
      if (view === 'books') paintBooks();
      else if (view === 'detail') paintDetail();
      else if (view === 'rank') paintRank();
    }
    paint();
  }
});
