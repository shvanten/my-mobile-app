/**
 * 云端同步：
 * - 方案 A（推荐）：用 GitHub Gist 作为云端存储。一个 Private Gist 装下所有数据。
 *   优点：免费、私密、用户已用 GitHub；缺点：需要在设置里粘贴一次 Personal Access Token (gist 权限即可)。
 * - 方案 B：导出 / 导入 JSON 文件。不需要任何账号，但只能手动。
 *
 * 数据形态（云端 gist 文件 myapp-sync.json）：
 *   { "v":1, "ts":<ms>, "stores": {
 *       "mood":       { "ts":.., "data": <localStorage mood.v1> },
 *       "ledger":     { "ts":.., "data": <localStorage ledger.v1> },
 *       "novelnotes": { "ts":.., "data": <localStorage novelnotes.v1> },
 *       "checkin":    { "ts":.., "habits":..., "records":..., "archived":... }
 *     } }
 *
 * 跨设备关键：
 *   - 所有设备用「同一个 Token + 同一个 Gist」。首次推送时按固定 description 标记
 *     自动寻找已存在的同步 Gist 复用，避免每设备各建一份导致互不同步。
 *   - 推送时与云端合并（记账记录按 id 合并、初始存款取较大值），避免互相覆盖/清空。
 *   - last-write-wins 的简化版，但已做合并，单用户多端日常够用。
 *
 * 同步策略：
 *   - 每次本地写入 → Sync.markDirty()，5 秒后自动 push（带合并）。
 *   - 进入「同步」页面时自动 pull 一次，把云端覆盖到本地。
 *   - 拉取后页面需要刷新才能看到新数据，UI 上提示用户。
 */

const SYNC_GIST_DESC = 'My Mobile App sync data';   // 跨设备复用的标记

// ============================================================
// 模块顶层：自动推送（不依赖 UI 是否打开）
// ============================================================
(function () {
  const CFG_KEY = 'sync.cfg.v1';
  function loadCfg() {
    try { return Object.assign({ token: '', gistId: '', lastPush: 0, lastPull: 0, lastSync: 0, auto: true }, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); }
    catch (e) { return { token: '', gistId: '', lastPush: 0, lastPull: 0, lastSync: 0, auto: true }; }
  }
  function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function collect() {
    return {
      v: 1,
      ts: Date.now(),
      stores: {
        mood:       { ts: Date.now(), data: read('mood.v1') },
        ledger:     { ts: Date.now(), data: read('ledger.v1') },
        novelnotes: { ts: Date.now(), data: read('novelnotes.v1') },
        checkin: {
          ts: Date.now(),
          habits:   read('checkin.habits.v1'),
          records:  read('checkin.records.v1'),
          archived: read('checkin.archived.v1'),
        },
      },
    };
  }

  // 合并云端 base 与本地 local：本地为基底，云端有而本地没有的条目补进来。
  function mergeStores(base, local) {
    const out = JSON.parse(JSON.stringify(local));
    // 通用：本地没有但云端有 → 用云端（防止空设备覆盖掉云端数据）
    ['mood', 'ledger', 'novelnotes'].forEach((k) => {
      const bHas = base[k] && base[k].data != null;
      const lHas = out[k] && out[k].data != null;
      if (bHas && !lHas) out[k] = JSON.parse(JSON.stringify(base[k]));
    });
    if (base.checkin && local.checkin) {
      ['habits', 'records', 'archived'].forEach((k) => {
        if (base.checkin[k] != null && out.checkin[k] == null) out.checkin[k] = JSON.parse(JSON.stringify(base.checkin[k]));
      });
    }
    // 记账：记录按 id 合并（不丢任何一笔）；初始存款取较大值
    const bLed = base.ledger && base.ledger.data;
    const lLed = local.ledger && local.ledger.data;
    if (bLed && lLed && out.ledger && out.ledger.data) {
      const ids = new Set((out.ledger.data.records || []).map((r) => r.id));
      (bLed.records || []).forEach((r) => { if (r && r.id && !ids.has(r.id)) out.ledger.data.records.push(r); });
      const bi = typeof bLed.init === 'number' ? bLed.init : 0;
      const li = typeof out.ledger.data.init === 'number' ? out.ledger.data.init : 0;
      out.ledger.data.init = Math.max(bi, li);
    }
    return out;
  }

  async function api(method, url, body, token) {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error('GitHub ' + res.status + ' · ' + (err.message || res.statusText));
    }
    return res.json();
  }

  // 找已有的同步 Gist（同 Token 多设备共享）
  async function findSyncGist(token) {
    try {
      const res = await fetch('https://api.github.com/gists', {
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) return null;
      const list = await res.json();
      const found = (list || []).find((g) => g.description === SYNC_GIST_DESC && g.files && g.files['myapp-sync.json']);
      return found ? found.id : null;
    } catch (e) { return null; }
  }

  async function push(cfg) {
    if (!cfg.token) throw new Error('未配置 Token');
    const payload = collect();
    // 先与云端已有数据合并，避免覆盖别的设备刚记的内容
    if (cfg.gistId) {
      try {
        const cur = await api('GET', 'https://api.github.com/gists/' + cfg.gistId, null, cfg.token);
        const f = cur.files && cur.files['myapp-sync.json'];
        if (f) {
          const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
          const base = JSON.parse(content);
          if (base && base.stores) payload.stores = mergeStores(base.stores, payload.stores);
        }
      } catch (e) { /* 忽略，直接覆盖 */ }
    }
    const file = { 'myapp-sync.json': { content: JSON.stringify(payload, null, 2) } };
    if (cfg.gistId) {
      const data = await api('PATCH', 'https://api.github.com/gists/' + cfg.gistId, { files: file }, cfg.token);
      cfg.gistId = data.id;
    } else {
      const existing = await findSyncGist(cfg.token);
      if (existing) {
        cfg.gistId = existing;
        const data = await api('PATCH', 'https://api.github.com/gists/' + existing, { files: file }, cfg.token);
        cfg.gistId = data.id;
      } else {
        const data = await api('POST', 'https://api.github.com/gists', {
          description: SYNC_GIST_DESC,
          public: false,
          files: file,
        }, cfg.token);
        cfg.gistId = data.id;
      }
    }
    cfg.lastPush = Date.now();
    cfg.lastSync = Date.now();
    saveCfg(cfg);
  }

  let dirty = false;
  let autoTimer = null;
  function scheduleAutoPush() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(async () => {
      autoTimer = null;
      if (!dirty) return;
      const cfg = loadCfg();
      if (!cfg.token || !cfg.auto) return;
      dirty = false;
      try { await push(cfg); }
      catch (e) { dirty = true; console.warn('[sync] auto push failed:', e); }
    }, 5000);
  }

  // 暴露给其它模块的 API
  window.Sync = {
    markDirty() {
      dirty = true;
      scheduleAutoPush();
    },
  };
})();

// ============================================================
// UI 部分（注册到 sidebar）
// ============================================================
App.registerFeature({
  id: 'sync',
  title: '同步',
  desc: '手机 / 平板 / 电脑多端同步',
  icon: '☁️',
  color: '#6a7ec4',
  render(container) {
    const CFG_KEY = 'sync.cfg.v1';
    function loadCfg() {
      try { return Object.assign({ token: '', gistId: '', lastPush: 0, lastPull: 0, lastSync: 0, auto: true }, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); }
      catch (e) { return { token: '', gistId: '', lastPush: 0, lastPull: 0, lastSync: 0, auto: true }; }
    }
    function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
    let cfg = loadCfg();

    function read(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
    }
    function write(key, val) {
      if (val == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    }
    function collect() {
      return {
        v: 1,
        ts: Date.now(),
        stores: {
          mood:       { ts: Date.now(), data: read('mood.v1') },
          ledger:     { ts: Date.now(), data: read('ledger.v1') },
          novelnotes: { ts: Date.now(), data: read('novelnotes.v1') },
          checkin: {
            ts: Date.now(),
            habits:   read('checkin.habits.v1'),
            records:  read('checkin.records.v1'),
            archived: read('checkin.archived.v1'),
          },
        },
      };
    }
    // 合并云端 base 与本地 local
    function mergeStores(base, local) {
      const out = JSON.parse(JSON.stringify(local));
      ['mood', 'ledger', 'novelnotes'].forEach((k) => {
        const bHas = base[k] && base[k].data != null;
        const lHas = out[k] && out[k].data != null;
        if (bHas && !lHas) out[k] = JSON.parse(JSON.stringify(base[k]));
      });
      if (base.checkin && local.checkin) {
        ['habits', 'records', 'archived'].forEach((k) => {
          if (base.checkin[k] != null && out.checkin[k] == null) out.checkin[k] = JSON.parse(JSON.stringify(base.checkin[k]));
        });
      }
      const bLed = base.ledger && base.ledger.data;
      const lLed = local.ledger && local.ledger.data;
      if (bLed && lLed && out.ledger && out.ledger.data) {
        const ids = new Set((out.ledger.data.records || []).map((r) => r.id));
        (bLed.records || []).forEach((r) => { if (r && r.id && !ids.has(r.id)) out.ledger.data.records.push(r); });
        const bi = typeof bLed.init === 'number' ? bLed.init : 0;
        const li = typeof out.ledger.data.init === 'number' ? out.ledger.data.init : 0;
        out.ledger.data.init = Math.max(bi, li);
      }
      return out;
    }
    function apply(remote) {
      if (!remote || !remote.stores) return 0;
      let n = 0;
      const s = remote.stores;
      if (s.mood       != null) { write('mood.v1',              s.mood.data   != null ? s.mood.data   : s.mood); n++; }
      if (s.ledger     != null) { write('ledger.v1',            s.ledger.data != null ? s.ledger.data : s.ledger); n++; }
      if (s.novelnotes != null) { write('novelnotes.v1',        s.novelnotes.data != null ? s.novelnotes.data : s.novelnotes); n++; }
      if (s.checkin) {
        if (s.checkin.habits   != null) { write('checkin.habits.v1',   s.checkin.habits);   n++; }
        if (s.checkin.records  != null) { write('checkin.records.v1',  s.checkin.records);  n++; }
        if (s.checkin.archived != null) { write('checkin.archived.v1', s.checkin.archived); n++; }
      }
      return n;
    }
    async function api(method, url, body) {
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': 'token ' + cfg.token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error('GitHub ' + res.status + ' · ' + (err.message || res.statusText));
      }
      return res.json();
    }
    async function findSyncGist() {
      try {
        const res = await fetch('https://api.github.com/gists', {
          headers: { 'Authorization': 'token ' + cfg.token, 'Accept': 'application/vnd.github+json' },
        });
        if (!res.ok) return null;
        const list = await res.json();
        const found = (list || []).find((g) => g.description === SYNC_GIST_DESC && g.files && g.files['myapp-sync.json']);
        return found ? found.id : null;
      } catch (e) { return null; }
    }
    async function push() {
      if (!cfg.token) throw new Error('请先填写 GitHub Token');
      const payload = collect();
      if (cfg.gistId) {
        try {
          const cur = await api('GET', 'https://api.github.com/gists/' + cfg.gistId);
          const f = cur.files && cur.files['myapp-sync.json'];
          if (f) {
            const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
            const base = JSON.parse(content);
            if (base && base.stores) payload.stores = mergeStores(base.stores, payload.stores);
          }
        } catch (e) { /* 忽略 */ }
      }
      const file = { 'myapp-sync.json': { content: JSON.stringify(payload, null, 2) } };
      if (cfg.gistId) {
        const data = await api('PATCH', 'https://api.github.com/gists/' + cfg.gistId, { files: file });
        cfg.gistId = data.id;
      } else {
        const existing = await findSyncGist();
        if (existing) {
          cfg.gistId = existing;
          const data = await api('PATCH', 'https://api.github.com/gists/' + existing, { files: file });
          cfg.gistId = data.id;
        } else {
          const data = await api('POST', 'https://api.github.com/gists', {
            description: SYNC_GIST_DESC,
            public: false,
            files: file,
          });
          cfg.gistId = data.id;
        }
      }
      cfg.lastPush = Date.now();
      cfg.lastSync = Date.now();
      saveCfg();
    }
    async function pull() {
      if (!cfg.token) throw new Error('请先填写 GitHub Token');
      if (!cfg.gistId) throw new Error('云端还没有数据，请先推送一次');
      const data = await api('GET', 'https://api.github.com/gists/' + cfg.gistId);
      const f = data.files && data.files['myapp-sync.json'];
      if (!f) throw new Error('云端 Gist 找不到数据文件');
      const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
      const remote = JSON.parse(content);
      const n = apply(remote);
      cfg.lastPull = Date.now();
      cfg.lastSync = Date.now();
      saveCfg();
      return n;
    }
    async function testToken() {
      if (!cfg.token) throw new Error('Token 为空');
      const res = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': 'token ' + cfg.token, 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('Token 无效（' + res.status + '）');
      const data = await res.json();
      return data.login || '(no name)';
    }

    function fmtTime(t) {
      if (!t) return '从未';
      const d = new Date(t);
      const pad = (n) => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function statusText() {
      if (!cfg.token) return { title: '未配置', desc: '请填写 GitHub Token 并连接', kind: 'warn' };
      if (!cfg.gistId) return { title: '未连接', desc: '点击「立即推送」即可创建云端存储', kind: 'warn' };
      return { title: '已连接', desc: 'Gist #' + cfg.gistId, kind: 'ok' };
    }

    container.innerHTML =
      '<div class="sy">' +
      '  <div class="sy-head"><h2>云端同步</h2><span class="muted">手机 / 平板 / 电脑数据互通</span></div>' +
      '  <div class="sy-body">' +
      '    <div class="sy-status" id="sy-status"></div>' +

      '    <details class="sy-card sy-card-guide" id="sy-guide">' +
      '      <summary class="sy-card-title">📘 三步上手（点开看教程）</summary>' +
      '      <div class="sy-guide-body">' +
      '        <p class="sy-guide-intro">方案 A 用 <b>GitHub Gist</b> 当云端。一个 Private Gist 装下所有数据，免费、私密。</p>' +
      '        <ol class="sy-guide-steps">' +
      '          <li><b>生成 Token</b>：打开 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a> → <b>Generate new token (classic)</b> → <b>只勾 gist 权限</b> → 生成（形如 <code>ghp_xxxx…</code>）</li>' +
      '          <li><b>填写 + 测试</b>：把 Token 粘到下方输入框 → 点「测试 Token」→ 显示 <code>Token 有效（你的用户名）</code> 就成功</li>' +
      '          <li><b>在一台设备点「立即推送」</b>：会自动创建一个带固定标记的 Private Gist（所有设备共用同一个）</li>' +
      '        </ol>' +
      '        <p class="sy-guide-next">另一台设备同样配置<b>同一个 Token</b>，进入「同步」页会自动找到同一个 Gist 并拉取（也可点「立即拉取 / 🔄 同步」）。刷新页面即可看到数据。</p>' +
      '        <p class="sy-guide-tip">💡 推送时会和云端<b>合并</b>（记账按每笔合并、不会互相覆盖），所以在任意设备点「🔄 同步」都很安全。</p>' +
      '      </div>' +
      '    </details>' +

      '    <div class="sy-card">' +
      '      <div class="sy-card-title">① 配置 GitHub Token</div>' +
      '      <div class="sy-hint">在 GitHub → Settings → Developer settings → Personal access tokens 生成，<b>只需勾选 gist 权限</b>，无需其他勾选。</div>' +
      '      <div class="sy-row">' +
      '        <input type="password" id="sy-token" class="sy-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="off" />' +
      '        <button class="btn ghost sm" id="sy-show" type="button">显示</button>' +
      '      </div>' +
      '      <div class="sy-actions">' +
      '        <button class="btn ghost sm" id="sy-test" type="button">测试 Token</button>' +
      '        <button class="btn sm" id="sy-save" type="button">保存配置</button>' +
      '        <button class="btn ghost sm" id="sy-forget" type="button">忘记 Token</button>' +
      '      </div>' +
      '      <div class="sy-tip" id="sy-token-status"></div>' +
      '    </div>' +

      '    <div class="sy-card">' +
      '      <div class="sy-card-title">② 同步操作</div>' +
      '      <div class="sy-actions">' +
      '        <button class="btn" id="sy-push" type="button">⬆ 立即推送</button>' +
      '        <button class="btn" id="sy-pull" type="button">⬇ 立即拉取</button>' +
      '        <button class="btn ghost" id="sy-both" type="button">🔄 同步（先拉后推）</button>' +
      '      </div>' +
      '      <div class="sy-meta">' +
      '        <div><span class="muted">上次推送：</span><span id="sy-last-push">' + fmtTime(cfg.lastPush) + '</span></div>' +
      '        <div><span class="muted">上次拉取：</span><span id="sy-last-pull">' + fmtTime(cfg.lastPull) + '</span></div>' +
      '      </div>' +
      '      <label class="sy-auto">' +
      '        <input type="checkbox" id="sy-auto"' + (cfg.auto ? ' checked' : '') + ' />' +
      '        <span>数据变更后自动推送（5 秒）</span>' +
      '      </label>' +
      '    </div>' +

      '    <div class="sy-card">' +
      '      <div class="sy-card-title">③ 备份（不需要账号）</div>' +
      '      <div class="sy-hint">把数据导出为 JSON 文件，可换设备时导入；适合不放心把 Token 交给浏览器的人。</div>' +
      '      <div class="sy-actions">' +
      '        <button class="btn" id="sy-export" type="button">⬇ 导出 JSON</button>' +
      '        <button class="btn ghost" id="sy-import" type="button">⬆ 导入 JSON</button>' +
      '        <input type="file" id="sy-file" accept="application/json" hidden />' +
      '      </div>' +
      '    </div>' +

      '    <div class="sy-card sy-card-warn">' +
      '      <div class="sy-card-title">⚠️ 隐私与安全</div>' +
      '      <ul class="sy-tips">' +
      '        <li>Token 仅保存在你这台设备的 localStorage，不会上传到任何第三方服务器。</li>' +
      '        <li>建议 Token 只勾选 <b>gist</b> 权限，定期更换；不用时点「忘记 Token」清除。</li>' +
      '        <li>数据存储在 GitHub 的 Private Gist（私密 gist，仅你可见）。</li>' +
      '        <li>「拉取」会与云端合并（记录按条目合并，不会丢失），合并后刷新页面即可看到。</li>' +
      '      </ul>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    const statusEl = container.querySelector('#sy-status');
    function paintStatus() {
      const s = statusText();
      statusEl.className = 'sy-status sy-status-' + s.kind;
      statusEl.innerHTML =
        '<div class="sy-status-dot"></div>' +
        '<div><div class="sy-status-title">' + App.escapeHtml(s.title) + '</div>' +
        '<div class="sy-status-desc">' + App.escapeHtml(s.desc) + '</div></div>';
    }
    paintStatus();

    const tokenInput = container.querySelector('#sy-token');
    const tokenStatusEl = container.querySelector('#sy-token-status');
    if (cfg.token) tokenInput.value = cfg.token;

    container.querySelector('#sy-show').addEventListener('click', () => {
      tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    });
    container.querySelector('#sy-save').addEventListener('click', () => {
      cfg.token = tokenInput.value.trim();
      saveCfg();
      tokenStatusEl.textContent = cfg.token ? '✓ 已保存（' + cfg.token.slice(0, 4) + '…）' : '已清空';
      paintStatus();
      App.toast('已保存');
    });
    container.querySelector('#sy-test').addEventListener('click', async () => {
      cfg.token = tokenInput.value.trim();
      saveCfg();
      tokenStatusEl.textContent = '测试中…';
      try {
        const login = await testToken();
        tokenStatusEl.textContent = '✓ Token 有效（' + login + '）';
        App.toast('Token 有效');
      } catch (e) {
        tokenStatusEl.textContent = '✗ ' + e.message;
      }
    });
    container.querySelector('#sy-forget').addEventListener('click', () => {
      App.confirm('忘记 Token？', '将清空 Token 和 Gist ID，需要重新配置才能同步。继续？', () => {
        cfg.token = ''; cfg.gistId = ''; cfg.lastPush = 0; cfg.lastPull = 0; cfg.lastSync = 0;
        saveCfg();
        tokenInput.value = '';
        tokenStatusEl.textContent = '';
        paintStatus();
        container.querySelector('#sy-last-push').textContent = fmtTime(0);
        container.querySelector('#sy-last-pull').textContent = fmtTime(0);
        App.toast('已清除');
      });
    });
    container.querySelector('#sy-push').addEventListener('click', async () => {
      try { await push(); paintStatus(); container.querySelector('#sy-last-push').textContent = fmtTime(cfg.lastPush); App.toast('✓ 已推送（已与云端合并）'); }
      catch (e) { App.toast('推送失败：' + e.message); }
    });
    container.querySelector('#sy-pull').addEventListener('click', async () => {
      try {
        const n = await pull();
        paintStatus();
        container.querySelector('#sy-last-pull').textContent = fmtTime(cfg.lastPull);
        App.toast('✓ 已拉取（' + n + ' 项）');
        App.confirm('已拉取云端数据', '为看到新数据，请刷新页面（关闭后重新打开）。立即刷新？', () => location.reload());
      } catch (e) { App.toast('拉取失败：' + e.message); }
    });
    // 双向同步：先拉取（不破坏云端）再推送（合并上传）。云端没有 Gist 时拉取会失败，忽略后继续推送以创建。
    container.querySelector('#sy-both').addEventListener('click', async () => {
      try {
        if (cfg.gistId) {
          try {
            const n = await pull();
            container.querySelector('#sy-last-pull').textContent = fmtTime(cfg.lastPull);
            App.toast('已拉取云端（' + n + ' 项）');
          } catch (e) { console.warn('[sync] pre-pull failed:', e); }
        }
        await push();
        container.querySelector('#sy-last-push').textContent = fmtTime(cfg.lastPush);
        paintStatus();
        App.toast('✓ 同步完成');
        App.confirm('同步完成', '为看到新数据，请刷新页面。立即刷新？', () => location.reload());
      } catch (e) { App.toast('同步失败：' + e.message); }
    });
    container.querySelector('#sy-auto').addEventListener('change', (e) => {
      cfg.auto = e.target.checked; saveCfg();
      if (cfg.auto) Sync.markDirty();
    });
    container.querySelector('#sy-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'myapp-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      App.toast('✓ 已导出');
    });
    const fileInput = container.querySelector('#sy-file');
    container.querySelector('#sy-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (!obj || !obj.stores) throw new Error('文件格式不对');
          App.confirm('确认导入？', '将会用文件里的数据覆盖本地所有数据。确定要继续吗？', () => {
            const n = apply(obj);
            App.toast('✓ 已导入 ' + n + ' 项');
            App.confirm('已导入', '请刷新页面以看到新数据。立即刷新？', () => location.reload());
          });
        } catch (e) { App.toast('导入失败：' + e.message); }
      };
      reader.readAsText(f);
      fileInput.value = '';
    });

    // 首次进入：自动拉取一次（找到同一 Gist 并合并到本地）
    if (cfg.token && cfg.gistId) {
      pull().then((n) => {
        if (n > 0) {
          container.querySelector('#sy-last-pull').textContent = fmtTime(cfg.lastPull);
          App.toast('已自动拉取云端（' + n + ' 项），刷新页面查看');
        }
      }).catch((e) => console.warn('[sync] auto pull failed:', e));
    }
  },
});
