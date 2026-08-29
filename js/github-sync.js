/**
 * GitHub 同步层（设备流 / Device Flow）
 *
 * 纯前端实现，无需后端。适用于「单一数据源」场景：把应用数据存在仓库文件中，
 * 多端共用同一份数据，免导出导入。
 *
 * 用法（任意页面）：
 *   if (window.GitHubSync && GitHubSync.isConnected()) { ... }
 *   await GitHubSync.startDeviceFlow()  // 返回 { user_code, verification_uri, interval, device_code }
 *   await GitHubSync.pollToken(deviceCode, interval)  // 轮询换取 token
 *   await GitHubSync.sync(data)  // 读取 sha 后写回 data/ledger.json（自动处理 409 冲突）
 */
(function () {
  'use strict';

  const REPO = 'shvanten/my-mobile-app';
  const FILE_PATH = 'data/ledger.json';
  const CLIENT_ID = 'Ov23liBVAAmOju76LU2U';
  const TOKEN_KEY = 'gh_ledger_token';
  const SCOPE = 'public_repo';

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  const GitHubSync = {
    repo: REPO,
    file: FILE_PATH,
    clientId: CLIENT_ID,
    token: (function () {
      try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    })(),

    isConnected() { return !!this.token; },

    logout() {
      this.token = '';
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    },

    // 发起设备流，返回 { device_code, user_code, verification_uri, interval }
    async startDeviceFlow() {
      const r = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
      });
      if (!r.ok) throw new Error('发起设备码失败：HTTP ' + r.status);
      const d = await r.json();
      if (!d.device_code || !d.user_code) throw new Error('设备码响应异常');
      return {
        device_code: d.device_code,
        user_code: d.user_code,
        verification_uri: d.verification_uri || 'https://github.com/login/device',
        interval: d.interval || 5,
      };
    },

    // 轮询换取 token，直到用户授权或超时（默认 15 分钟）
    async pollToken(deviceCode, interval, onTick) {
      const deadline = Date.now() + 15 * 60 * 1000;
      let iv = interval || 5;
      while (Date.now() < deadline) {
        await sleep(iv * 1000);
        const r = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });
        const d = await r.json();
        if (d.access_token) {
          this.token = d.access_token;
          try { localStorage.setItem(TOKEN_KEY, d.access_token); } catch (e) {}
          return d.access_token;
        }
        if (d.error === 'authorization_pending') { if (onTick) onTick('pending'); continue; }
        if (d.error === 'slow_down') { iv += 5; if (onTick) onTick('slow_down'); continue; }
        if (d.error) throw new Error('授权失败：' + d.error);
      }
      throw new Error('授权超时，请重试');
    },

    // 读取目标文件，返回 { content, sha }；文件不存在返回 { content:null, sha:null }
    async readFile() {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + encodeURIComponent(FILE_PATH).replace(/%2F/g, '/'), {
        headers: { 'Authorization': 'Bearer ' + this.token, 'Accept': 'application/vnd.github+json' },
      });
      if (r.status === 404) return { content: null, sha: null };
      if (!r.ok) throw new Error('读取失败：HTTP ' + r.status);
      const d = await r.json();
      let content = null;
      try { content = JSON.parse(decodeURIComponent(escape(atob(d.content)))); } catch (e) { content = null; }
      return { content: content, sha: d.sha };
    },

    // 写入文件；sha 为 null 时新建
    async writeFile(data, sha) {
      const body = {
        message: 'update ledger data',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
      };
      if (sha) body.sha = sha;
      const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + encodeURIComponent(FILE_PATH).replace(/%2F/g, '/'), {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + this.token, 'Accept': 'application/vnd.github+json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = new Error('写入失败：HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    },

    // 安全写回：先读 sha，再写；遇到 409（并发冲突）则重读重试一次
    async sync(data) {
      try {
        const { sha } = await this.readFile();
        return await this.writeFile(data, sha);
      } catch (e) {
        if (e && e.status === 409) {
          const { sha } = await this.readFile();
          return await this.writeFile(data, sha);
        }
        throw e;
      }
    },
  };

  window.GitHubSync = GitHubSync;
})();
