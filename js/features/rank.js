/**
 * 小说拆文 · 知乎每日榜单
 * - 数据来自 data/rank.json（每日自动更新），用 css 中的 .nn-rank-* 样式渲染
 * - 每条可「收藏」到本地，作为后续拆文的选题（localStorage: nn.fav.v1）
 */
App.registerFeature({
  id: 'nn',
  title: '小说拆文',
  desc: '知乎每日榜单 · 选书拆文',
  icon: '📚',
  color: '#6fa860',
  async render(container, ctx) {
    const App = (ctx && ctx.App) || window.App;
    const esc = App.escapeHtml;

    container.innerHTML =
      '<div class="nn-page">' +
      '  <div class="nn-head"><h2>小说拆文 · 知乎榜单</h2></div>' +
      '  <div class="nn-rank" id="nn-rank"><p class="muted">加载中…</p></div>' +
      '</div>';

    const root = container.querySelector('#nn-rank');

    let data;
    try {
      const res = await fetch('data/rank.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      root.innerHTML = '<p class="error">榜单加载失败：' + esc(String(e)) + '（可稍后重试）</p>';
      return;
    }

    // 收藏状态（与小说拆文选题打通）
    const FAV_KEY = 'nn.fav.v1';
    function loadFav() {
      try { const d = JSON.parse(localStorage.getItem(FAV_KEY)); if (Array.isArray(d)) return d; } catch (e) {}
      return [];
    }
    function saveFav(arr) { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); }
    let fav = loadFav();

    if (!data || !Array.isArray(data.lists) || !data.lists.length) {
      root.innerHTML = '<p class="muted">暂无榜单数据。</p>';
      return;
    }

    root.innerHTML = data.lists.map(function (list) {
      const items = (list.items || []).map(function (it, i) {
        const no = i + 1;
        const title = esc(it.t || '书名');
        const tag = it.tag ? '<span class="nn-rank-tag">' + esc(it.tag) + '</span>' : '';
        const author = it.a ? '<div class="nn-rank-author muted">作者：' + esc(it.a) + '</div>' : '';
        const desc = it.d ? '<div class="nn-rank-desc">' + esc(it.d) + '</div>' : '';
        const key = it.t || ('#' + no);
        const isFav = fav.indexOf(key) !== -1;
        const favBtn = '<button class="btn sm nn-rank-fav' + (isFav ? ' on' : '') +
          '" data-key="' + esc(key) + '" type="button">' + (isFav ? '★ 已收藏' : '☆ 收藏') + '</button>';
        return '<div class="nn-rank-item">' +
          '<div class="nn-rank-no">' + no + '</div>' +
          '<div class="nn-rank-main">' +
            '<div class="nn-rank-title">' + title + tag + '</div>' +
            author + desc +
          '</div>' +
          favBtn +
        '</div>';
      }).join('');
      return '<section class="nn-list">' +
        '<h3 class="nn-rank-list-name">' + esc(list.name) + '</h3>' +
        items +
      '</section>';
    }).join('') +
    '<p class="nn-rank-tip">数据更新于 ' + esc(data.updatedAt || '未知') +
    ' · 来源 ' + esc(data.source || '') + '</p>';

    root.querySelectorAll('.nn-rank-fav').forEach(function (b) {
      b.addEventListener('click', function () {
        const k = b.dataset.key;
        const idx = fav.indexOf(k);
        if (idx === -1) {
          fav.push(k); b.classList.add('on'); b.textContent = '★ 已收藏';
          App.toast('已收藏：' + k);
        } else {
          fav.splice(idx, 1); b.classList.remove('on'); b.textContent = '☆ 收藏';
          App.toast('已取消收藏');
        }
        saveFav(fav);
      });
    });
  },
});
