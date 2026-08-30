/**
 * GitHub 同步层（Personal Access Token 方式）
 *
 * 纯前端实现，无需后端、无需代理。
 * 说明：GitHub 的设备码端点（login/device/code）不返回 CORS 头，浏览器无法直连，
 * 因此改用 Personal Access Token（PAT）登录——数据读写走 api.github.com（带 CORS 头，可直连）。
 *
 * 用法（任意页面）：
 *   if (window.GitHubSync && GitHubSync.isConnected()) { ... }
 *   await GitHubSync.connect(pat)        // 校验并保存 token（localStorage）
 *   await GitHubSync.readFile()          // 读取 data/ledger.json -> { content, sha }
 *   await GitHubSync.sync(data)          // 读取 sha 后写回（自动处理 409 冲突）
 *   GitHubSync.logout()
 */
(function () {
  'use strict';

  const REPO = 'shvanten/my-mobile-app';
  const FILE_PATH = 'data/ledger.json';
  const TOKEN_KEY = 'gh_ledger_token';
  const API_BASE_KEY = 'gh_api_base';

  // API 基础地址：默认 api.github.com；在中国大陆常被防火墙拦截，
  // 可在此配置一个能转发到 api.github.com 的代理（需返回 CORS 头并透传 Authorization）。
  let API_BASE = (function () {
    try { return localStorage.getItem(API_BASE_KEY) || 'https://api.github.com'; } catch (e) { return 'https://api.github.com'; }
  })();

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  function contentsUrl() {
    return API_BASE + '/repos/' + REPO + '/contents/' + encodeURIComponent(FILE_PATH).replace(/%2F/g, '/');
  }

  // 统一 fetch：拦截「网络层失败」（GFW 拦截 / 离线 / DNS）→ 给出明确提示
  async function ghFetch(url, opts) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      const msg = (e && e.message) || '';
      if ((e && e.name === 'TypeError') || /Failed to fetch|NetworkError|network|abort/i.test(msg)) {
        throw new Error('无法连接 GitHub API（' + API_BASE + '）：网络被防火墙拦截或离线，可能需要通过代理访问');
      }
      throw e;
    }
    return r;
  }

  const GitHubSync = {
    repo: REPO,
    file: FILE_PATH,
    token: (function () {
      try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    })(),

    isConnected() { return !!this.token; },

    getApiBase() { return API_BASE; },
    setApiBase(url) {
      url = (url || '').trim().replace(/\/+$/, '');
      if (!url) url = 'https://api.github.com';
      API_BASE = url;
      try { localStorage.setItem(API_BASE_KEY, url); } catch (e) {}
    },

    logout() {
      this.token = '';
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    },

    // 校验并保存 PAT：用一次只读请求确认 token 有效、且对该仓库有 contents 权限
    async connect(pat) {
      pat = (pat || '').trim();
      if (!pat) throw new Error('请输入有效的 Token');
      const r = await ghFetch(contentsUrl(), {
        headers: { 'Authorization': 'Bearer ' + pat, 'Accept': 'application/vnd.github+json' },
      });
      if (r.status === 401) { this.token = ''; throw new Error('Token 无效或已过期'); }
      if (r.status === 403) {
        this.token = '';
        const tip = pat.indexOf('github_pat_') === 0
          ? '（细粒度 Token 需在创建时指定本仓库，并授予 Contents 读写权限）'
          : '（需 public_repo 或 repo 范围）';
        throw new Error('Token 无权限' + tip);
      }
      if (r.status !== 200 && r.status !== 404) {
        this.token = '';
        throw new Error('校验失败：HTTP ' + r.status);
      }
      this.token = pat;
      try { localStorage.setItem(TOKEN_KEY, pat); } catch (e) {}
      return true;
    },

    // 读取目标文件，返回 { content, sha }；文件不存在返回 { content:null, sha:null }
    async readFile() {
      const headers = { 'Accept': 'application/vnd.github+json' };
      if (this.token) headers['Authorization'] = 'Bearer ' + this.token; // 无 token 时公开读取（隐私浏览也能拉取）
      const r = await ghFetch(contentsUrl(), { headers });
      if (r.status === 404) return { content: null, sha: null };
      if (r.status === 401) { if (this.token) { this.token = ''; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} } throw new Error('Token 已失效，请重新连接'); }
      if (r.status === 403) {
        if (!this.token) throw new Error('GitHub 限流（未登录每小时 60 次），稍后再试或先连接 Token');
        throw new Error('Token 无权限（需 public_repo 或 repo 范围）');
      }
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
      const r = await ghFetch(contentsUrl(), {
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
