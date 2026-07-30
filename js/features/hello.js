/**
 * 示例功能 1：静态欢迎页
 * 展示最简单的一种功能：往容器里写一点 HTML，绑定一个事件。
 */
App.registerFeature({
  id: 'hello',
  title: '你好',
  desc: '一个简单的示例页面',
  icon: '👋',
  color: '#4f46e5',
  render(container) {
    container.innerHTML =
      '<div class="hero">' +
      '  <div class="hero-emoji">👋</div>' +
      '  <h2>欢迎使用你的专属应用</h2>' +
      '  <p>这是第一个示例功能。你可以在 <code>js/features/</code> 里添加自己的功能。</p>' +
      '  <button class="btn" id="hello-btn">点我打招呼</button>' +
      '  <p id="hello-out" class="muted"></p>' +
      '</div>';
    container.querySelector('#hello-btn').addEventListener('click', () => {
      container.querySelector('#hello-out').textContent =
        '你好，世界！🎉 ' + new Date().toLocaleTimeString();
    });
  }
});
