/**
 * 示例功能 3：随手记（自动保存的便签）
 * 展示「输入即保存」的写法。
 */
App.registerFeature({
  id: 'notes',
  title: '随手记',
  desc: '自动保存的便签',
  icon: '📝',
  color: '#3f7a59',
  render(container) {
    const KEY = 'myapp.notes';
    const saved = localStorage.getItem(KEY) || '';
    container.innerHTML =
      '<div class="notes">' +
      '  <textarea id="notes-area" class="notes-area" placeholder="随手写点什么，内容会自动保存…">' +
      App.escapeHtml(saved) + '</textarea>' +
      '  <p class="muted">已自动保存到本机。</p>' +
      '</div>';
    const area = container.querySelector('#notes-area');
    area.addEventListener('input', () => localStorage.setItem(KEY, area.value));
  }
});
