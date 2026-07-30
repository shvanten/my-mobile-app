/**
 * 小说拆文便签：
 * - 把摘抄 / 总结的「语句、词句、技巧」写成便签。
 * - 便签可以归入分类（比如属于哪篇文章），可按分类、类型筛选。
 * - 分类和类型都可以新增/删除（点 chip 上的 ×）。
 * - 内置一份「知乎盐言故事热门榜单」参考页，可一键把榜单作品收藏为分类。
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
    // { cats:[{id,name}], types:[{id,name,icon}], notes:[{id,text,type,catId,createdAt}] }
    const DEFAULT_TYPES = [
      { id: 'sent', name: '语句', icon: '💬' },
      { id: 'word', name: '词句', icon: '✨' },
      { id: 'tech', name: '技巧', icon: '🛠️' },
    ];
    const TYPE_ICONS = ['💬', '✨', '🛠️', '💡', '📖', '🎭', '🌟', '🔮', '💎', '🪶', '🪞', '🧩', '🪄', '🗝️', '🧵'];
    function load() {
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && Array.isArray(d.cats) && Array.isArray(d.notes)) {
          if (!Array.isArray(d.types) || !d.types.length) d.types = DEFAULT_TYPES.slice();
          return d;
        }
      } catch (e) { /* ignore */ }
      return { cats: [], types: DEFAULT_TYPES.slice(), notes: [] };
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
    let data = load();

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    function dateStr(ts) {
      const d = new Date(ts);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function catName(id) {
      const c = data.cats.find((c) => c.id === id);
      return c ? c.name : '';
    }
    function typeOf(id) { return data.types.find((t) => t.id === id) || data.types[0]; }

    // ---------- 知乎盐言故事榜单 ----------
    // 优先读取 data/rank.json（由每日自动抓取任务更新）；失败时用下面的内置快照兜底。
    const RANK = [
      { t: '承珠冠', a: '李迟迟', tag: '古言', d: '命中注定的弑君者 vs 忠犬追随者。「公主的珠冠，一样可以承载社稷江山。」' },
      { t: '你已有取死之道', a: '海的鸽子', tag: '古言·爽文', d: '鲨穿了的追妻火葬场女主 vs 一言不合就被鲨的男主们。' },
      { t: '吃人心的小妖怪', a: '女巫', tag: '志怪', d: '心软小妖怪 vs 淳朴善良村民。「吃人心的小妖怪死了，土庙里却多了个小神仙。」' },
      { t: '山回路转不见鸡', a: '旺旺大队长', tag: '仙侠·种田', d: '捡个男人只为种地的女主 vs 拧巴清冷无情道仙尊。' },
      { t: '阿缨', a: '鸠森', tag: '古言', d: '真心错付落魄贵女 vs 纨绔但护短小狗弟弟。' },
      { t: '沙洲秘事', a: '应不染', tag: '悬疑·IP榜', d: '入选 2026「最具转化价值文学IP推荐榜」。' },
      { t: '死到临头', a: '咸良', tag: '悬疑', d: '作者前作《恶女阿尤》改编电影《恶意》票房 2.54 亿。' },
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
      .catch(() => { /* 离线时用内置快照 */ });

    // ---------- 状态 ----------
    let view = 'notes';        // notes | rank
    let filterCat = 'all';     // all | catId
    let filterType = 'all';    // all | typeId

    // ---------- 骨架 ----------
    container.innerHTML =
      '<div class="nn">' +
      '  <div class="nn-head">' +
      '    <h2>小说拆文</h2>' +
      '    <div class="nn-tabs">' +
      '      <button class="nn-tab on" type="button" data-view="notes">便签</button>' +
      '      <button class="nn-tab" type="button" data-view="rank">知乎榜单</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="nn-body" id="nn-body"></div>' +
      '</div>';

    const bodyEl = container.querySelector('#nn-body');
    const tabs = container.querySelectorAll('.nn-tab');
    tabs.forEach((b) => b.addEventListener('click', () => {
      view = b.dataset.view;
      tabs.forEach((x) => x.classList.toggle('on', x === b));
      paint();
    }));

    // ---------- 便签页 ----------
    function catChip(id, name) {
      return '<button class="nn-chip' + (filterCat === id ? ' on' : '') + '" data-fc="' + id + '" type="button">' +
        '<span class="nn-chip-text">📁 ' + App.escapeHtml(name) + '</span>' +
        '<span class="nn-chip-x" data-delcat="' + id + '" role="button" aria-label="删除分类" title="删除分类">×</span>' +
        '</button>';
    }
    function typeChip(id, name, icon) {
      return '<button class="nn-chip sm' + (filterType === id ? ' on' : '') + '" data-ft="' + id + '" type="button">' +
        '<span class="nn-chip-text">' + icon + ' ' + App.escapeHtml(name) + '</span>' +
        '<span class="nn-chip-x" data-deltype="' + id + '" role="button" aria-label="删除类型" title="删除类型">×</span>' +
        '</button>';
    }

    function paintNotes() {
      const catChips =
        '<button class="nn-chip' + (filterCat === 'all' ? ' on' : '') + '" data-fc="all" type="button">全部</button>' +
        data.cats.map((c) => catChip(c.id, c.name)).join('') +
        '<button class="nn-chip nn-chip-add" data-addcat="1" type="button">＋分类</button>';

      const typeChips =
        '<button class="nn-chip sm' + (filterType === 'all' ? ' on' : '') + '" data-ft="all" type="button">全部类型</button>' +
        data.types.map((t) => typeChip(t.id, t.name, t.icon)).join('') +
        '<button class="nn-chip sm nn-chip-add" data-addtype="1" type="button">＋类型</button>';

      let list = data.notes.slice().sort((a, b) => b.createdAt - a.createdAt);
      if (filterCat !== 'all') list = list.filter((n) => n.catId === filterCat);
      if (filterType !== 'all') list = list.filter((n) => n.type === filterType);

      const cards = list.length
        ? list.map((n, i) => {
            const t = typeOf(n.type);
            const cn = catName(n.catId);
            return '<div class="nn-note c' + (i % 5) + (i % 2 ? ' tilt-r' : ' tilt-l') + '" data-id="' + n.id + '">' +
              '  <div class="nn-note-top">' +
              '    <span class="nn-note-type">' + t.icon + ' ' + App.escapeHtml(t.name) + '</span>' +
              '    <span class="nn-note-ops">' +
              '      <button class="nn-op" data-edit="' + n.id + '" type="button" aria-label="编辑">✏️</button>' +
              '      <button class="nn-op" data-del="' + n.id + '" type="button" aria-label="删除">✕</button>' +
              '    </span>' +
              '  </div>' +
              '  <div class="nn-note-text">' + App.escapeHtml(n.text) + '</div>' +
              '  <div class="nn-note-foot">' +
              (cn ? '<span class="nn-note-cat">📁 ' + App.escapeHtml(cn) + '</span>' : '<span></span>') +
              '    <span class="nn-note-date">' + dateStr(n.createdAt) + '</span>' +
              '  </div>' +
              '</div>';
          }).join('')
        : '<p class="muted nn-empty">还没有便签，点右下角 ＋ 写第一张吧。</p>';

      bodyEl.innerHTML =
        '<div class="nn-filter">' +
        '  <div class="nn-chips">' + catChips + '</div>' +
        '  <div class="nn-chips">' + typeChips + '</div>' +
        '</div>' +
        '<div class="nn-grid">' + cards + '</div>' +
        '<button class="nn-fab" id="nn-add" type="button" aria-label="新建便签">＋</button>';

      // 筛选
      bodyEl.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', (e) => {
        if (e.target.closest('[data-delcat]')) return;  // 点 × 不触发筛选
        filterCat = b.dataset.fc; paintNotes();
      }));
      bodyEl.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', (e) => {
        if (e.target.closest('[data-deltype]')) return; // 点 × 不触发筛选
        filterType = b.dataset.ft; paintNotes();
      }));
      // 删除分类（点 chip 上的 ×）
      bodyEl.querySelectorAll('[data-delcat]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.dataset.delcat;
        const cat = data.cats.find((c) => c.id === id);
        if (!cat) return;
        const noteCount = data.notes.filter((n) => n.catId === id).length;
        const tip = noteCount
          ? '分类「' + cat.name + '」下有 ' + noteCount + ' 张便签，删除后这些便签会改为「无分类」。继续？'
          : '删除分类「' + cat.name + '」？';
        App.confirm('删除分类', tip, () => {
          data.notes.forEach((n) => { if (n.catId === id) n.catId = ''; });
          data.cats = data.cats.filter((c) => c.id !== id);
          if (filterCat === id) filterCat = 'all';
          save(); paintNotes();
          App.toast('已删除分类');
        });
      }));
      // 删除类型（点 chip 上的 ×）
      bodyEl.querySelectorAll('[data-deltype]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = b.dataset.deltype;
        const t = data.types.find((x) => x.id === id);
        if (!t) return;
        if (data.types.length <= 1) { App.toast('至少保留一个类型'); return; }
        const noteCount = data.notes.filter((n) => n.type === id).length;
        const fallback = data.types.find((x) => x.id !== id) || DEFAULT_TYPES[0];
        const tip = noteCount
          ? '类型「' + t.name + '」下有 ' + noteCount + ' 张便签，删除后会改为「' + fallback.name + '」。继续？'
          : '删除类型「' + t.name + '」？';
        App.confirm('删除类型', tip, () => {
          data.notes.forEach((n) => { if (n.type === id) n.type = fallback.id; });
          data.types = data.types.filter((x) => x.id !== id);
          if (filterType === id) filterType = 'all';
          save(); paintNotes();
          App.toast('已删除类型');
        });
      }));
      // 新建分类
      const addCatBtn = bodyEl.querySelector('[data-addcat]');
      if (addCatBtn) addCatBtn.addEventListener('click', () => {
        App.prompt('新建分类', '', (v) => {
          if (!v || !v.trim()) return;
          addCat(v.trim());
          paintNotes();
        }, { hint: '比如某篇文章名、某个作者、某个题材。' });
      });
      // 新建类型
      const addTypeBtn = bodyEl.querySelector('[data-addtype]');
      if (addTypeBtn) addTypeBtn.addEventListener('click', () => openTypeEditor(null));
      // 新建 / 编辑 / 删除便签
      bodyEl.querySelector('#nn-add').addEventListener('click', () => openEditor(null));
      bodyEl.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const n = data.notes.find((x) => x.id === b.dataset.edit);
        if (n) openEditor(n);
      }));
      bodyEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        App.confirm('删除便签', '确认删除这张便签？', () => {
          data.notes = data.notes.filter((x) => x.id !== b.dataset.del);
          save(); paintNotes();
          App.toast('已删除');
        });
      }));
    }

    function addCat(name) {
      const exist = data.cats.find((c) => c.name === name);
      if (exist) return exist.id;
      const c = { id: uid(), name: name };
      data.cats.push(c);
      save();
      return c.id;
    }

    // ---------- 新建 / 编辑类型（弹层选 icon + name） ----------
    function openTypeEditor(existing) {
      const isNew = !existing;
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      let curIcon = existing ? existing.icon : TYPE_ICONS[0];
      const iconBtns = TYPE_ICONS.map((ic) =>
        '<button class="nn-type-icon' + (ic === curIcon ? ' on' : '') + '" data-icon="' + ic + '" type="button">' + ic + '</button>'
      ).join('');
      wrap.innerHTML =
        '<div class="nn-sheet">' +
        '  <h3>' + (isNew ? '新建类型' : '编辑类型') + '</h3>' +
        '  <p class="muted" style="margin:0;font-size:12px">挑一个图标，再起个名字</p>' +
        '  <div class="nn-type-icons">' + iconBtns + '</div>' +
        '  <input id="nn-t-name" class="lg-note" type="text" maxlength="8" placeholder="类型名（如 套路 / 节奏）" value="' + (existing ? App.escapeHtml(existing.name) : '') + '" />' +
        '  <div class="nn-e-btns">' +
        '    <button class="btn ghost" id="nn-t-cancel" type="button">取消</button>' +
        '    <button class="btn" id="nn-t-ok" type="button">保存</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);
      const nameEl = wrap.querySelector('#nn-t-name');
      wrap.querySelector('.nn-type-icons').addEventListener('click', (e) => {
        const b = e.target.closest('[data-icon]');
        if (!b) return;
        curIcon = b.dataset.icon;
        wrap.querySelectorAll('.nn-type-icon').forEach((x) => x.classList.toggle('on', x === b));
      });
      function close() { wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
      wrap.querySelector('#nn-t-cancel').addEventListener('click', close);
      wrap.querySelector('#nn-t-ok').addEventListener('click', () => {
        const name = nameEl.value.trim();
        if (!name) { App.toast('请输入类型名'); return; }
        if (isNew) {
          // 唯一 id
          let id = uid();
          while (data.types.some((t) => t.id === id)) id = uid();
          data.types.push({ id, name, icon: curIcon });
        } else {
          existing.name = name; existing.icon = curIcon;
        }
        save(); close(); paintNotes();
        App.toast(isNew ? '已添加类型' : '已更新类型');
      });
      setTimeout(() => nameEl.focus(), 60);
    }

    // ---------- 便签编辑弹层 ----------
    function openEditor(note) {
      const isNew = !note;
      const wrap = document.createElement('div');
      wrap.className = 'nn-mask';
      const catOpts =
        '<option value="">（无分类）</option>' +
        data.cats.map((c) =>
          '<option value="' + c.id + '"' + (note && note.catId === c.id ? ' selected' : '') + '>' +
          App.escapeHtml(c.name) + '</option>'
        ).join('');
      const typeBtns = data.types.map((t) =>
        '<button class="nn-chip sm' + ((note ? note.type : 'sent') === t.id ? ' on' : '') + '" data-t="' + t.id + '" type="button">' +
        t.icon + ' ' + App.escapeHtml(t.name) + '</button>'
      ).join('');
      wrap.innerHTML =
        '<div class="nn-sheet">' +
        '  <h3>' + (isNew ? '新便签' : '编辑便签') + '</h3>' +
        '  <div class="nn-chips" id="nn-e-type">' + typeBtns + '</div>' +
        '  <textarea id="nn-e-text" rows="5" maxlength="1000" placeholder="写下摘抄的语句、好词句，或拆文技巧…"></textarea>' +
        '  <div class="nn-e-cat">' +
        '    <select id="nn-e-sel">' + catOpts + '</select>' +
        '    <button class="nn-chip sm" id="nn-e-newcat" type="button">＋新分类</button>' +
        '  </div>' +
        '  <div class="nn-e-btns">' +
        '    <button class="btn ghost" id="nn-e-cancel" type="button">取消</button>' +
        '    <button class="btn" id="nn-e-ok" type="button">保存</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(wrap);

      const textEl = wrap.querySelector('#nn-e-text');
      const selEl = wrap.querySelector('#nn-e-sel');
      let curType = note ? note.type : (data.types[0] && data.types[0].id) || 'sent';
      if (note) textEl.value = note.text;

      wrap.querySelector('#nn-e-type').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        curType = b.dataset.t;
        wrap.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      });
      wrap.querySelector('#nn-e-newcat').addEventListener('click', () => {
        App.prompt('新建分类', '', (v) => {
          if (!v || !v.trim()) return;
          const id = addCat(v.trim());
          const opt = document.createElement('option');
          opt.value = id; opt.textContent = v.trim(); opt.selected = true;
          selEl.appendChild(opt);
        }, { hint: '比如某篇文章名、某个作者。' });
      });
      function close() { wrap.remove(); }
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
      wrap.querySelector('#nn-e-cancel').addEventListener('click', close);
      wrap.querySelector('#nn-e-ok').addEventListener('click', () => {
        const text = textEl.value.trim();
        if (!text) { App.toast('写点内容再保存吧'); return; }
        if (isNew) {
          data.notes.push({ id: uid(), text: text, type: curType, catId: selEl.value || '', createdAt: Date.now() });
        } else {
          note.text = text; note.type = curType; note.catId = selEl.value || '';
        }
        save(); close(); paintNotes();
        App.toast(isNew ? '便签已贴上 📝' : '便签已更新');
      });
      textEl.focus();
    }

    // ---------- 榜单页 ----------
    function paintRank() {
      const listsHtml = rankData.lists.map((L) =>
        '<div class="nn-rank-list-name">' + App.escapeHtml(L.name) + '</div>' +
        (L.items || []).map((r, i) =>
          '<div class="nn-rank-item">' +
          '  <div class="nn-rank-no">' + (i + 1) + '</div>' +
          '  <div class="nn-rank-main">' +
          '    <div class="nn-rank-title">《' + App.escapeHtml(r.t) + '》' +
          (r.tag ? '<span class="nn-rank-tag">' + App.escapeHtml(r.tag) + '</span>' : '') + '</div>' +
          (r.a ? '<div class="nn-rank-author muted">' + App.escapeHtml(r.a) + '</div>' : '') +
          (r.d ? '<div class="nn-rank-desc">' + App.escapeHtml(r.d) + '</div>' : '') +
          '  </div>' +
          '  <button class="nn-chip sm nn-rank-fav" data-fav="' + App.escapeHtml(r.t) + '" type="button">收藏为分类</button>' +
          '</div>'
        ).join('')
      ).join('');
      bodyEl.innerHTML =
        '<div class="nn-rank">' +
        '  <p class="muted nn-rank-tip">知乎盐言故事榜单 · 更新于 ' + App.escapeHtml(rankData.updatedAt || '—') +
        '（每天自动抓取，不含长篇榜）。点「收藏为分类」即可给这本书建拆文分类。</p>' +
        listsHtml +
        '</div>';

      bodyEl.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', () => {
        const name = '《' + b.dataset.fav + '》';
        addCat(name);
        App.toast('已创建分类 ' + name);
      }));
    }

    function paint() { view === 'rank' ? paintRank() : paintNotes(); }
    paint();
  }
});
