/**
 * 小说拆文便签：
 * - 把摘抄 / 总结的「语句、词句、技巧」写成便签。
 * - 便签可以归入分类（比如属于哪篇文章），可按分类、类型筛选。
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
    // { cats:[{id,name}], notes:[{id,text,type,catId,createdAt}] }
    function load() {
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && Array.isArray(d.cats) && Array.isArray(d.notes)) return d;
      } catch (e) { /* ignore */ }
      return { cats: [], notes: [] };
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

    // 便签类型
    const TYPES = [
      { id: 'sent', name: '语句', icon: '💬' },   // 摘抄的句子 / 段落
      { id: 'word', name: '词句', icon: '✨' },   // 好词好短语
      { id: 'tech', name: '技巧', icon: '🛠️' },  // 写作技巧 / 拆文总结
    ];
    function typeOf(id) { return TYPES.find((t) => t.id === id) || TYPES[0]; }

    // ---------- 知乎盐言故事榜单（抓取于 2026-07-30，静态快照） ----------
    const RANK = [
      { t: '承珠冠', a: '李迟迟', tag: '古言', d: '命中注定的弑君者 vs 忠犬追随者。「公主的珠冠，一样可以承载社稷江山。」' },
      { t: '你已有取死之道', a: '海的鸽子', tag: '古言·爽文', d: '鲨穿了的追妻火葬场女主 vs 一言不合就被鲨的男主们。「当追妻火葬场女主决定当女帝。」' },
      { t: '吃人心的小妖怪', a: '女巫', tag: '志怪', d: '心软小妖怪 vs 淳朴善良村民。「吃人心的小妖怪死了，土庙里却多了个小神仙。」' },
      { t: '山回路转不见鸡', a: '旺旺大队长', tag: '仙侠·种田', d: '捡个男人只为种地的女主 vs 拧巴清冷无情道仙尊。「和离后，无情道前夫给我送了个男人。」' },
      { t: '阿缨', a: '鸠森', tag: '古言', d: '真心错付落魄贵女 vs 纨绔但护短小狗弟弟。「误以为未婚夫要我改嫁，我嫁给了他弟弟。」' },
      { t: '沙洲秘事', a: '应不染', tag: '悬疑·IP榜', d: '入选 2026「最具转化价值文学IP推荐榜」，并入选中国作协网络文学重点扶持项目。' },
      { t: '死到临头', a: '咸良', tag: '悬疑', d: '悬疑感十足，大银幕转化价值高；作者前作《恶女阿尤》改编电影《恶意》票房 2.54 亿。' },
      { t: '锦绣南洋', a: '迷路', tag: '年代·家国', d: '细腻笔触描摹华人闯荡海外的拼搏史诗，兼具年代质感和家国情怀。' },
      { t: '相亲夜校', a: '胡阿花', tag: '都市', d: '入选 IP 榜剧情都市赛道，贴近市场、接地气、共情力强。' },
      { t: '照殿红', a: '盐选热门', tag: '脑洞·短篇', d: '女主手握照殿红四次穿越的时空闭环设定，知乎盐选超火短篇。' },
      { t: '洗铅华', a: '盐选爆款', tag: '古言', d: '与《掌中之物》《娇藏》同为日均阅读量超 2000 万次的盐选爆款。' },
      { t: '河清海晏', a: '盐言故事', tag: 'IP开发', d: '已出实体书 + 精品有声剧，真人长剧 2026 年内开机，全链路 IP 开发代表作。' },
    ];

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
    function paintNotes() {
      const catChips =
        '<button class="nn-chip' + (filterCat === 'all' ? ' on' : '') + '" data-fc="all" type="button">全部</button>' +
        data.cats.map((c) =>
          '<button class="nn-chip' + (filterCat === c.id ? ' on' : '') + '" data-fc="' + c.id + '" type="button">📁 ' +
          App.escapeHtml(c.name) + '</button>'
        ).join('') +
        '<button class="nn-chip nn-chip-add" data-addcat="1" type="button">＋分类</button>';

      const typeChips =
        '<button class="nn-chip sm' + (filterType === 'all' ? ' on' : '') + '" data-ft="all" type="button">全部类型</button>' +
        TYPES.map((t) =>
          '<button class="nn-chip sm' + (filterType === t.id ? ' on' : '') + '" data-ft="' + t.id + '" type="button">' +
          t.icon + ' ' + t.name + '</button>'
        ).join('');

      let list = data.notes.slice().sort((a, b) => b.createdAt - a.createdAt);
      if (filterCat !== 'all') list = list.filter((n) => n.catId === filterCat);
      if (filterType !== 'all') list = list.filter((n) => n.type === filterType);

      const cards = list.length
        ? list.map((n, i) => {
            const t = typeOf(n.type);
            const cn = catName(n.catId);
            return '<div class="nn-note c' + (i % 5) + (i % 2 ? ' tilt-r' : ' tilt-l') + '" data-id="' + n.id + '">' +
              '  <div class="nn-note-top">' +
              '    <span class="nn-note-type">' + t.icon + ' ' + t.name + '</span>' +
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
      bodyEl.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', () => {
        filterCat = b.dataset.fc; paintNotes();
      }));
      bodyEl.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => {
        filterType = b.dataset.ft; paintNotes();
      }));
      // 新建分类（长按分类 chip 可删除/改名 —— 简化为点击＋分类新建，长按暂不做）
      const addCatBtn = bodyEl.querySelector('[data-addcat]');
      if (addCatBtn) addCatBtn.addEventListener('click', () => {
        const name = prompt('新分类名称（比如某篇文章名）：');
        if (!name || !name.trim()) return;
        addCat(name.trim());
        paintNotes();
      });
      // 新建 / 编辑 / 删除
      bodyEl.querySelector('#nn-add').addEventListener('click', () => openEditor(null));
      bodyEl.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const n = data.notes.find((x) => x.id === b.dataset.edit);
        if (n) openEditor(n);
      }));
      bodyEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('删除这张便签？')) return;
        data.notes = data.notes.filter((x) => x.id !== b.dataset.del);
        save(); paintNotes();
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
      const typeBtns = TYPES.map((t) =>
        '<button class="nn-chip sm' + ((note ? note.type : 'sent') === t.id ? ' on' : '') + '" data-t="' + t.id + '" type="button">' +
        t.icon + ' ' + t.name + '</button>'
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
      let curType = note ? note.type : 'sent';
      if (note) textEl.value = note.text;

      wrap.querySelector('#nn-e-type').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        curType = b.dataset.t;
        wrap.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      });
      wrap.querySelector('#nn-e-newcat').addEventListener('click', () => {
        const name = prompt('新分类名称（比如某篇文章名）：');
        if (!name || !name.trim()) return;
        const id = addCat(name.trim());
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = name.trim(); opt.selected = true;
        selEl.appendChild(opt);
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
      bodyEl.innerHTML =
        '<div class="nn-rank">' +
        '  <p class="muted nn-rank-tip">知乎盐言故事 · 2026 热门作品（快照于 2026-07-30，来源：公开报道/榜单）。点「收藏为分类」即可给这本书建拆文分类。</p>' +
        RANK.map((r, i) =>
          '<div class="nn-rank-item">' +
          '  <div class="nn-rank-no">' + (i + 1) + '</div>' +
          '  <div class="nn-rank-main">' +
          '    <div class="nn-rank-title">《' + App.escapeHtml(r.t) + '》' +
          '      <span class="nn-rank-tag">' + App.escapeHtml(r.tag) + '</span></div>' +
          '    <div class="nn-rank-author muted">' + App.escapeHtml(r.a) + '</div>' +
          '    <div class="nn-rank-desc">' + App.escapeHtml(r.d) + '</div>' +
          '  </div>' +
          '  <button class="nn-chip sm nn-rank-fav" data-fav="' + App.escapeHtml(r.t) + '" type="button">收藏为分类</button>' +
          '</div>'
        ).join('') +
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
