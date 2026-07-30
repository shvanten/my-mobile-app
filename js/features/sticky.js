/**
 * 便签（备忘录）：像小便签一样随手记录的摘抄 / 灵感。
 * - 彩色便签，可编辑文字、换色、删除
 * - 独立 localStorage（sticky.v1），可被同步模块上传
 */
App.registerFeature({
  id: 'sticky',
  title: '便签',
  desc: '随手摘抄 · 备忘录便签',
  icon: '📌',
  color: '#e0a82e',
  render(container) {
    const KEY = 'sticky.v1';
    const COLORS = [
      { id: 'yellow', v: '#fff3b0' },
      { id: 'pink',   v: '#ffc9d4' },
      { id: 'blue',   v: '#bfe3ff' },
      { id: 'green',  v: '#cdeccd' },
      { id: 'purple', v: '#e2d2ff' },
      { id: 'orange', v: '#ffdcae' },
    ];
    const colorVal = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).v;

    function load() {
      try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && Array.isArray(d.notes)) return d; } catch (e) {}
      return { notes: [] };
    }
    function save() { localStorage.setItem(KEY, JSON.stringify(data)); if (window.Sync) Sync.markDirty(); }
    let data = load();
    const uid = (p) => (p || 's') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    container.innerHTML =
      '<div class="st">' +
      '  <div class="st-head"><h2>便签 · 随手摘抄</h2>' +
      '    <button class="btn sm" id="st-add" type="button">＋ 新便签</button></div>' +
      '  <div class="st-board" id="st-board"></div>' +
      '</div>';

    const board = container.querySelector('#st-board');

    function paint() {
      if (!data.notes.length) {
        board.innerHTML = '<div class="st-empty"><div class="st-empty-emoji">📌</div>' +
          '<p class="muted">还没有便签。点「＋ 新便签」记下一段随手摘抄或灵感。</p></div>';
        return;
      }
      board.innerHTML = data.notes.map((n) =>
        '<div class="st-note" data-id="' + n.id + '" style="background:' + colorVal(n.color) + '">' +
        '  <div class="st-note-bar">' +
        '    <div class="st-colors">' + COLORS.map((c) =>
            '<button class="st-color' + (c.id === n.color ? ' on' : '') + '" data-c="' + c.id + '" type="button" style="background:' + c.v + '"></button>'
          ).join('') + '</div>' +
        '    <button class="st-del" data-del="' + n.id + '" type="button" aria-label="删除">✕</button>' +
        '  </div>' +
        '  <textarea class="st-text" data-id="' + n.id + '" placeholder="随手写点什么…">' + App.escapeHtml(n.text) + '</textarea>' +
        '  <div class="st-date muted">' + fmtDate(n.createdAt) + '</div>' +
        '</div>'
      ).join('');

      // 换色
      board.querySelectorAll('.st-color').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const note = findNote(b);
          note.color = b.dataset.c;
          save();
          const card = b.closest('.st-note');
          card.style.background = colorVal(note.color);
          card.querySelectorAll('.st-color').forEach((x) => x.classList.toggle('on', x.dataset.c === note.color));
        });
      });
      // 编辑文字
      board.querySelectorAll('.st-text').forEach((ta) => {
        ta.addEventListener('input', () => {
          const note = data.notes.find((x) => x.id === ta.dataset.id);
          if (note) { note.text = ta.value; save(); }
        });
      });
      // 删除
      board.querySelectorAll('.st-del').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = b.dataset.del;
          App.confirm('删除便签', '确认删除这张便签？', () => {
            data.notes = data.notes.filter((x) => x.id !== id);
            save(); paint();
          });
        });
      });
    }
    function findNote(el) {
      const card = el.closest('.st-note');
      const id = card.dataset.id;
      return data.notes.find((x) => x.id === id);
    }
    function fmtDate(t) {
      if (!t) return '';
      const d = new Date(t);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    container.querySelector('#st-add').addEventListener('click', () => {
      const n = { id: uid('s'), text: '', color: 'yellow', createdAt: Date.now() };
      data.notes.unshift(n);
      save(); paint();
      const ta = board.querySelector('.st-note[data-id="' + n.id + '"] .st-text');
      if (ta) ta.focus();
    });

    paint();
  },
});
