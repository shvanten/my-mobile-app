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
        sticky:     { ts: Date.now(), data: read('sticky.v1') },
        checkin: {
          ts: Date.now(),
          habits:   read('checkin.habits.v1'),
          records:  read('checkin.records.v1'),
          archived: read('checkin.archived.v1'),
        },
      },
    };
  }

  // 按 id 合并两个数组：保留 a 的全部，补入 b 中 a 没有的（按 id 去重）；无 id 的项补到末尾。
  function unionById(a, b) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const ids = new Set(arrA.filter((x) => x && x.id).map((x) => x.id));
    const add = arrB.filter((x) => x && x.id && !ids.has(x.id));
    const noId = arrB.filter((x) => x && !x.id).map((x) => Object.assign({}, x, { id: 'm' + Math.random().toString(36).slice(2, 8) }));
    return arrA.concat(add).concat(noId);
  }

  // 单模块数据合并（云端 cloud 与本地 local 取并集，绝不互相覆盖/清空）
  function mergeModule(key, local, cloud) {
    if (cloud == null) return local;
    if (local == null) return cloud;
    if (key === 'ledger') {
      const li = typeof local.init === 'number' ? local.init : 0;
      const ci = typeof cloud.init === 'number' ? cloud.init : 0;
      return { init: Math.max(li, ci), records: unionById(local.records, cloud.records) };
    }
    if (key === 'novelnotes') return { books: unionById(local.books, cloud.books) };
    if (key === 'mood') {
      const out = Object.assign({}, local);
      Object.keys(cloud).forEach((d) => {
        if (!out[d]) { out[d] = cloud[d]; return; }
        out[d] = Object.assign({}, out[d]);
        out[d].items = unionById(out[d].items, cloud[d].items);
      });
      return out;
    }
    if (key === 'sticky') return unionById(local, cloud);
    return local; // 兜底：保留本地，绝不丢
  }

  // 把云端 stores 安全合并到本地 localStorage（并集：云端有就用云端补本地，云端无则保留本地）
  function apply(remote) {
    if (!remote || !remote.stores) return 0;
    let n = 0;
    const s = remote.stores;
    [['mood', 'mood.v1'], ['ledger', 'ledger.v1'], ['novelnotes', 'novelnotes.v1'], ['sticky', 'sticky.v1']].forEach(([k, key]) => {
      const cloudData = (s[k] && s[k].data != null) ? s[k].data : null;
      const merged = mergeModule(k, read(key), cloudData);
      if (merged != null) { write(key, merged); n++; }
    });
    if (s.checkin) {
      const c = s.checkin;
      if (c.habits != null) { write('checkin.habits.v1', unionById(read('checkin.habits.v1'), c.habits)); n++; }
      if (c.records != null) {
        const m = Object.assign({}, read('checkin.records.v1') || {});
        Object.keys(c.records || {}).forEach((d) => { m[d] = Object.assign({}, m[d] || {}, c.records[d]); });
        write('checkin.records.v1', m); n++;
      }
      if (c.archived != null) { write('checkin.archived.v1', unionById(read('checkin.archived.v1'), c.archived)); n++; }
    }
    return n;
  }

  // 推送时：以本地为基底，把云端独有的数据并进来（相加合并，云端不会覆盖掉本地）
  function mergeStores(base, local) {
    const out = JSON.parse(JSON.stringify(local));
    ['mood', 'ledger', 'novelnotes', 'sticky'].forEach((k) => {
      const cloudData = (base[k] && base[k].data != null) ? base[k].data : null;
      const localData = (out[k] && out[k].data != null) ? out[k].data : null;
      out[k] = { ts: Date.now(), data: mergeModule(k, localData, cloudData) };
    });
    if (base.checkin && out.checkin) {
      ['habits', 'records', 'archived'].forEach((k) => {
        if (base.checkin[k] == null) return;
        if (k === 'records') {
          const m = Object.assign({}, out.checkin[k] || {});
          Object.keys(base.checkin[k] || {}).forEach((d) => { m[d] = Object.assign({}, m[d] || {}, base.checkin[k][d]); });
          out.checkin[k] = m;
        } else {
          out.checkin[k] = unionById(out.checkin[k], base.checkin[k]);
        }
      });
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
    collect,
    read,
    write,
    unionById,
    mergeModule,
    mergeStores,
    apply,
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
    function collect() { return window.Sync.collect(); }
    // 合并云端 base 与本地 local（相加合并，见 window.Sync.mergeStores）
    function mergeStores(base, local) { return window.Sync.mergeStores(base, local); }
    // 把云端安全合并到本地（并集，绝不把本地覆盖成 null）—— 见 window.Sync.apply
    function apply(remote) { return window.Sync.apply(remote); }
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
      if (!cfg.gistId) {
        // 自动找同 Token 下的同步 Gist（其它设备可能已建过）
        const found = await findSyncGist();
        if (!found) throw new Error('云端还没有数据，请先在有数据的设备上点「立即推送」');
        cfg.gistId = found; saveCfg();
      }
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
      if (!cfg.token) return { title: '未配置 Token', desc: '从第 ① 步开始', kind: 'warn', step: 1 };
      if (!cfg.gistId) return { title: 'Token 已保存', desc: '下一步：测试连接', kind: 'warn', step: 2 };
      return { title: '已连接', desc: '云端 Gist #' + cfg.gistId.slice(0, 8) + '…', kind: 'ok', step: 3 };
    }

    container.innerHTML =
      '<div class="sy">' +
      '  <div class="sy-head"><h2>云端同步</h2><span class="muted">手机 / 平板 / 电脑数据互通</span></div>' +
      '  <div class="sy-body">' +
      '    <div class="sy-status" id="sy-status"></div>' +
      '    <div class="sy-progress" id="sy-progress">' +
      '      <div class="sy-pg-step" data-step="1"><span class="sy-pg-num">①</span><span class="sy-pg-label">填 Token</span></div>' +
      '      <div class="sy-pg-line"></div>' +
      '      <div class="sy-pg-step" data-step="2"><span class="sy-pg-num">②</span><span class="sy-pg-label">连接</span></div>' +
      '      <div class="sy-pg-line"></div>' +
      '      <div class="sy-pg-step" data-step="3"><span class="sy-pg-num">③</span><span class="sy-pg-label">推送</span></div>' +
      '    </div>' +

      '    <div class="sy-card sy-card-step" id="sy-step-1">' +
      '      <div class="sy-card-title">① 填 GitHub Token</div>' +
      '      <div class="sy-hint">在你的 GitHub 账号生成一个 Token，<b>只勾选 gist 权限</b>就够用：</div>' +
      '      <ol class="sy-ol">' +
      '        <li>点 <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener">打开页面</a>（建议保留标签页）</li>' +
      '        <li>Note 随便填（如「我的 App」）</li>' +
      '        <li>Expiration 选 90 天或更长</li>' +
      '        <li>下方权限 <b>只勾 gist</b>，其它一律不勾</li>' +
      '        <li>点底部绿色 <b>Generate token</b> → 复制 <code>ghp_…</code> 开头的字符串</li>' +
      '      </ol>' +
      '      <div class="sy-row">' +
      '        <input type="password" id="sy-token" class="sy-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="off" />' +
      '        <button class="btn ghost sm" id="sy-show" type="button">显示</button>' +
      '      </div>' +
      '      <div class="sy-actions">' +
      '        <button class="btn" id="sy-save" type="button">保存 Token →</button>' +
      '      </div>' +
      '      <div class="sy-tip" id="sy-token-status">还没填 Token</div>' +
      '    </div>' +

      '    <div class="sy-card sy-card-step" id="sy-step-2">' +
      '      <div class="sy-card-title">② 测试 + 连接</div>' +
      '      <div class="sy-hint">点下面按钮会自动：验证 Token → 在你的账号下查找是否已有同步 Gist（多端会自动复用同一个）</div>' +
      '      <div class="sy-actions">' +
      '        <button class="btn" id="sy-test" type="button">🔍 测试 Token 并查找云端</button>' +
      '      </div>' +
      '      <div class="sy-tip" id="sy-test-status">等待测试</div>' +
      '    </div>' +

      '    <div class="sy-card sy-card-step" id="sy-step-3">' +
      '      <div class="sy-card-title">③ 推送 / 拉取</div>' +
      '      <div class="sy-hint">连接成功后，<b>首次必须在一台设备上点「立即推送」</b>创建云端数据。其它设备再点「立即拉取」就能拿到。</div>' +
      '      <div class="sy-actions">' +
      '        <button class="btn" id="sy-push" type="button">⬆ 立即推送（创建/更新云端）</button>' +
      '        <button class="btn" id="sy-pull" type="button">⬇ 立即拉取（从云端下载）</button>' +
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
      '      <div class="sy-tip" id="sy-sync-status"></div>' +
      '    </div>' +

      '    <details class="sy-card sy-card-guide">' +
      '      <summary class="sy-card-title">📘 多端怎么用？（点开看）</summary>' +
      '      <div class="sy-guide-body">' +
      '        <p><b>设备 A（有数据）</b>：同步页 → 填 Token → 测试 → 「立即推送」（云端建好仓库）</p>' +
      '        <p><b>设备 B / C / 平板 / 电脑（空的）</b>：同样填<b>同一个 Token</b> → 测试 → 「立即拉取」或「🔄 同步」→ 弹窗点「立即刷新」</p>' +
      '        <p class="sy-guide-tip">💡 Token 一样就共用同一个 Gist，不用记 Gist ID。「同步」按钮是「先拉后推」，最安全；每次写完数据 5 秒后会自动推。</p>' +
      '      </div>' +
      '    </details>' +

      '    <details class="sy-card">' +
      '      <summary class="sy-card-title">📂 备份（无需账号）</summary>' +
      '      <div class="sy-guide-body">' +
      '        <p>不放心把 Token 给浏览器？把数据导出成 JSON 文件，换设备时再导入：</p>' +
      '        <div class="sy-actions">' +
      '          <button class="btn" id="sy-export" type="button">⬇ 导出 JSON</button>' +
      '          <button class="btn ghost" id="sy-import" type="button">⬆ 导入 JSON</button>' +
      '          <input type="file" id="sy-file" accept="application/json" hidden />' +
      '        </div>' +
      '      </div>' +
      '    </details>' +

      '    <details class="sy-card sy-card-warn">' +
      '      <summary class="sy-card-title">⚠️ 隐私 & 退出</summary>' +
      '      <div class="sy-guide-body">' +
      '        <ul class="sy-tips">' +
      '          <li>Token 只存在本机 localStorage，不上传第三方。</li>' +
      '          <li>建议 Token <b>只勾 gist</b> 权限，定期换。</li>' +
      '          <li>数据存在 GitHub Private Gist（只有你能看）。</li>' +
      '        </ul>' +
      '        <div class="sy-actions">' +
      '          <button class="btn ghost sm" id="sy-forget" type="button">🚪 忘记 Token（清空配置）</button>' +
      '        </div>' +
      '      </div>' +
      '    </details>' +
      '  </div>' +
      '</div>';

    const statusEl = container.querySelector('#sy-status');
    const progressEl = container.querySelector('#sy-progress');
    function paintStatus() {
      const s = statusText();
      statusEl.className = 'sy-status sy-status-' + s.kind;
      statusEl.innerHTML =
        '<div class="sy-status-dot"></div>' +
        '<div><div class="sy-status-title">' + App.escapeHtml(s.title) + '</div>' +
        '<div class="sy-status-desc">' + App.escapeHtml(s.desc) + '</div></div>';
      // 高亮进度条对应步骤
      progressEl.querySelectorAll('.sy-pg-step').forEach((el) => {
        el.classList.toggle('on', Number(el.dataset.step) <= s.step);
      });
      progressEl.querySelectorAll('.sy-pg-line').forEach((el) => {
        // 第一条线对应 1→2，第二条 2→3
        const before = Number(progressEl.querySelector('.sy-pg-step:nth-child(3)').dataset.step); // 2
        const idx = Array.from(progressEl.querySelectorAll('.sy-pg-line')).indexOf(el);
        el.classList.toggle('on', s.step >= (idx + 2));
      });
      // 把当前步骤对应的卡片置顶、其它折叠（简化：只高亮）
      container.querySelectorAll('.sy-card-step').forEach((c) => c.classList.remove('sy-card-active'));
      const cur = container.querySelector('#sy-step-' + s.step);
      if (cur) cur.classList.add('sy-card-active');
    }
    paintStatus();

    const tokenInput = container.querySelector('#sy-token');
    const tokenStatusEl = container.querySelector('#sy-token-status');
    const testStatusEl = container.querySelector('#sy-test-status');
    const syncStatusEl = container.querySelector('#sy-sync-status');
    if (cfg.token) tokenInput.value = cfg.token;

    container.querySelector('#sy-show').addEventListener('click', () => {
      tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    });
    container.querySelector('#sy-save').addEventListener('click', () => {
      cfg.token = tokenInput.value.trim();
      saveCfg();
      tokenStatusEl.textContent = cfg.token ? '✓ 已保存（' + cfg.token.slice(0, 4) + '…） · 下一步：点 ② 的测试按钮' : '已清空';
      paintStatus();
      App.toast('已保存');
    });
    container.querySelector('#sy-test').addEventListener('click', async () => {
      cfg.token = tokenInput.value.trim();
      saveCfg();
      if (!cfg.token) { testStatusEl.textContent = '✗ Token 为空，请先填入'; return; }
      testStatusEl.textContent = '🔍 验证 Token…';
      try {
        const login = await testToken();
        testStatusEl.textContent = '✓ Token 有效（' + login + '）· 正在查找云端…';
        const found = await findSyncGist();
        if (found) {
          cfg.gistId = found; saveCfg();
          testStatusEl.textContent = '✓ 已连接 · 找到你账号下的同步 Gist';
          App.toast('已连接云端');
        } else {
          testStatusEl.textContent = '✓ Token 有效（' + login + '）· 云端还没有数据，下一步点「立即推送」创建';
        }
        paintStatus();
      } catch (e) {
        testStatusEl.textContent = '✗ ' + e.message;
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
      try {
        await push();
        paintStatus();
        container.querySelector('#sy-last-push').textContent = fmtTime(cfg.lastPush);
        if (syncStatusEl) syncStatusEl.textContent = '✓ 已推送（云端 Gist #' + cfg.gistId.slice(0, 8) + '…）';
        App.toast('✓ 已推送（已与云端合并）');
      } catch (e) { App.toast('推送失败：' + e.message); }
    });
    container.querySelector('#sy-pull').addEventListener('click', async () => {
      try {
        const n = await pull();
        paintStatus();
        container.querySelector('#sy-last-pull').textContent = fmtTime(cfg.lastPull);
        if (syncStatusEl) syncStatusEl.textContent = '✓ 已拉取（' + n + ' 项），刷新页面后生效';
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
        if (syncStatusEl) syncStatusEl.textContent = '✓ 同步完成（云端 Gist #' + cfg.gistId.slice(0, 8) + '…）';
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
