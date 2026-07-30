/**
 * 示例功能 2：待办清单（带本地保存）
 * 展示「状态 + localStorage」的写法，关闭网页也不会丢。
 */
App.registerFeature({
  id: 'todo',
  title: '待办清单',
  desc: '本地保存的待办事项',
  icon: '✅',
  color: '#97a98c',
  render(container) {
    const KEY = 'myapp.todo';
    let items = [];
    try { items = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { items = []; }
    const save = () => localStorage.setItem(KEY, JSON.stringify(items));

    function paint() {
      list.innerHTML = items.length
        ? items.map((it, i) =>
            '<li class="todo-item ' + (it.done ? 'done' : '') + '">' +
            '  <label><input type="checkbox" data-toggle="' + i + '" ' + (it.done ? 'checked' : '') + '/> ' +
            '  <span>' + App.escapeHtml(it.text) + '</span></label>' +
            '  <button class="del" data-del="' + i + '" aria-label="删除">✕</button>' +
            '</li>').join('')
        : '<li class="muted">还没有待办，下面添加一个吧。</li>';
    }

    container.innerHTML =
      '<div class="todo">' +
      '  <form id="todo-form" class="todo-form">' +
      '    <input id="todo-input" type="text" placeholder="添加待办…" autocomplete="off" />' +
      '    <button class="btn" type="submit">添加</button>' +
      '  </form>' +
      '  <ul id="todo-list" class="todo-list"></ul>' +
      '</div>';

    const form = container.querySelector('#todo-form');
    const input = container.querySelector('#todo-input');
    const list = container.querySelector('#todo-list');
    paint();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      items.push({ text: v, done: false });
      save(); paint(); input.value = '';
    });

    list.addEventListener('click', (e) => {
      const t = e.target.closest('[data-toggle]');
      const d = e.target.closest('[data-del]');
      if (t) { items[+t.dataset.toggle].done = t.checked; save(); paint(); }
      if (d) { items.splice(+d.dataset.del, 1); save(); paint(); }
    });
  }
});
