'use strict';
/**
 * Gestion du client officiel qubic.li :
 *  - téléchargement avec vérification SHA-256 (hash épinglé dans config.js)
 *  - extraction (zip Windows / tar.gz Linux)
 *  - lancement / arrêt du processus (et de son arbre : le "runner" est un sous-processus)
 *  - parsing des logs pour en tirer hashrate, solutions, état de connexion
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');
const CFG = require('./config');

const PLATFORM = process.platform === 'win32' ? 'win32' : 'linux';

function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too_many_redirects'));
    https.get(url, { headers: { 'User-Agent': 'MineQubic/0.1' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return download(next, dest, onProgress, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http_' + res.statusCode)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const hash = crypto.createHash('sha256');
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        hash.update(chunk);
        received += chunk.length;
        if (onProgress) onProgress(total ? received / total : 0, received, total);
      });
      res.on('error', reject);
      out.on('error', reject);
      res.pipe(out);
      out.on('finish', () => resolve(hash.digest('hex')));
    }).on('error', reject);
  });
}

async function fetchManifest() {
  if (!CFG.REMOTE_MANIFEST_URL) return null;
  try {
    const r = await fetch(CFG.REMOTE_MANIFEST_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const m = await r.json();
    if (m && m[PLATFORM] && /^[0-9a-f]{64}$/i.test(m[PLATFORM].sha256) && /^https:\/\//.test(m[PLATFORM].url)) return m;
  } catch (_) { /* on reste sur la config embarquée */ }
  return null;
}

class MinerClient extends EventEmitter {
  /**
   * @param {string} baseDir  dossier de données de l'app (userData)
   */
  constructor(baseDir) {
    super();
    this.dir = path.join(baseDir, 'qli');
    this.child = null;
    this.stats = { hashrate: 0, unit: 'it/s', sols: 0, shares: 0, connected: false, startedAt: null };
    this.lines = [];
    this.address = null;
  }

  get spec() {
    const m = this._manifest;
    const src = m || CFG.CLIENT;
    return { version: src.version || CFG.CLIENT.version, ...(src[PLATFORM] || CFG.CLIENT[PLATFORM]) };
  }

  get exePath() { return path.join(this.dir, this.spec.exe || CFG.CLIENT[PLATFORM].exe); }
  get versionFile() { return path.join(this.dir, 'VERSION'); }

  isInstalled() {
    try {
      return fs.existsSync(this.exePath) && fs.readFileSync(this.versionFile, 'utf8').trim() === this.spec.version;
    } catch (_) { return false; }
  }

  /** Version installée (fichier VERSION), ou null. */
  installedVersion() {
    try { return fs.readFileSync(this.versionFile, 'utf8').trim(); } catch (_) { return null; }
  }

  /** Re-lit le manifest distant ; renvoie true si une version différente de celle installée est publiée. */
  async checkUpdate() {
    const m = await fetchManifest();
    if (m) this._manifest = m;
    return !!this.installedVersion() && this.installedVersion() !== this.spec.version;
  }

  /** Supprime le client installé (le prochain ensureInstalled() le re-télécharge). */
  uninstall() {
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch (_) {}
  }

  /** Télécharge + vérifie + extrait le client si nécessaire. */
  async ensureInstalled() {
    if (!this._manifest) this._manifest = await fetchManifest();
    if (this.isInstalled()) return;
    if (this.installedVersion() && this.installedVersion() !== this.spec.version) this.uninstall();
    const spec = this.spec;
    fs.mkdirSync(this.dir, { recursive: true });
    const archive = path.join(this.dir, 'download.tmp');
    this.emit('status', { state: 'downloading', progress: 0 });
    const hash = await download(spec.url, archive, (p) => this.emit('status', { state: 'downloading', progress: p }));
    if (hash.toLowerCase() !== spec.sha256.toLowerCase()) {
      try { fs.unlinkSync(archive); } catch (_) {}
      throw new Error('checksum_mismatch');
    }
    this.emit('status', { state: 'extracting' });
    if (PLATFORM === 'win32') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(archive);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        // on aplatit : certains zips ont un dossier racine
        const name = path.basename(entry.entryName);
        fs.writeFileSync(path.join(this.dir, name), entry.getData());
      }
    } else {
      const tar = require('tar');
      await tar.x({ file: archive, cwd: this.dir, strip: 0 });
      try { fs.chmodSync(this.exePath, 0o755); } catch (_) {}
    }
    fs.unlinkSync(archive);
    this.writeSettings();
    fs.writeFileSync(this.versionFile, spec.version);
  }

  /** Le zip officiel contient un appsettings.json avec le token "anonyme" du pool :
   *  on le garde tel quel (tout le reste passe en arguments de ligne de commande).
   *  S'il manque, on en écrit un minimal. */
  writeSettings() {
    const file = path.join(this.dir, 'appsettings.json');
    if (fs.existsSync(file)) return;
    fs.writeFileSync(file, JSON.stringify({
      ClientSettings: { poolAddress: CFG.POOL_WS, pps: true, autoUpdate: false },
    }, null, 2));
  }

  get running() { return !!this.child; }

  /**
   * @param {{address:string, alias:string, threads:number, gpu:boolean}} opts
   */
  start(opts) {
    if (this.child) throw new Error('already_running');
    const args = [
      `--ClientSettings:QubicAddress=${opts.address}`,
      `--ClientSettings:Alias=${opts.alias}`,
      `--ClientSettings:PPS=true`,
      `--ClientSettings:Trainer:Cpu=true`,
      `--ClientSettings:Trainer:CpuThreads=${Math.max(1, opts.threads | 0)}`,
      `--ClientSettings:Trainer:Gpu=${opts.gpu ? 'true' : 'false'}`,
      // le client qubic.li sait se mettre à jour tout seul (nouvelle epoch, nouvel algo)
      `--ClientSettings:AutoUpdate=${CFG.CLIENT_AUTO_UPDATE === false ? 'false' : 'true'}`,
    ];
    this.address = opts.address;
    this.stats = { hashrate: 0, unit: 'it/s', sols: 0, shares: 0, connected: false, startedAt: Date.now(), cpuVersion: this.stats.cpuVersion || null };
    this.lines = [];
    const child = spawn(this.exePath, args, {
      cwd: this.dir,
      windowsHide: true,
      detached: PLATFORM !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    let buf = '';
    const onData = (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        this._onLine(line);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => { this.emit('line', `[app] spawn error: ${e.message}`); });
    child.on('exit', (code, signal) => {
      this.child = null;
      this.emit('exit', { code, signal, address: opts.address });
    });
    this.emit('status', { state: 'starting' });
  }

  _onLine(line) {
    if (!line.trim()) return;
    if (/^\s*@+\s*@*\s*$/.test(line)) return; // logo ASCII
    this.lines.push(line);
    if (this.lines.length > 400) this.lines.shift();
    this.emit('line', line);

    // Format qubic.li 3.9.x : "E:234 | SHARES: 3/5 (R:0) | [AVX512] 21 it/s | 22 avg it/s"
    //   (avec DisplayDetailedHashrates : "[AVX512] 21 it/s [CUDA] 500 it/s" → on additionne)
    let m = null;
    const rates = [...line.matchAll(/\[([A-Z0-9]+)\]\s*(\d+(?:[.,]\d+)?)\s*(k|M)?it\/s/gi)];
    if (rates.length) {
      let total = 0;
      for (const r of rates) { let v = parseFloat(r[2].replace(',', '.')); if (r[3]) v *= r[3].toLowerCase() === 'k' ? 1e3 : 1e6; total += v; }
      this.stats.hashrate = total; m = rates[0];
      const avg = line.match(/(\d+(?:[.,]\d+)?)\s*(k|M)?\s*avg it\/s/i);
      if (avg) { let v = parseFloat(avg[1].replace(',', '.')); if (avg[2]) v *= avg[2].toLowerCase() === 'k' ? 1e3 : 1e6; this.stats.avgHashrate = v; }
    } else {
      m = line.match(/(\d+(?:[.,]\d+)?)\s*(k|M)?it\/s/i);
      if (m && !/avg it\/s/i.test(line.slice(0, m.index + m[0].length)) ) {
        let v = parseFloat(m[1].replace(',', '.'));
        if (m[2]) v *= m[2].toLowerCase() === 'k' ? 1e3 : 1e6;
        this.stats.hashrate = v;
      }
    }
    const ep = line.match(/\bE:(\d+)\b/); if (ep) this.stats.epoch = parseInt(ep[1], 10);
    const cpu = line.match(/^CPU:\s*Enabled with (\w+)/i);
    if (cpu) { this.stats.cpuVersion = cpu[1].toUpperCase(); this.emit('sysinfo', { cpuVersion: this.stats.cpuVersion }); }
    if (/(outdated|update required|unsupported (client )?version|too old|please update)/i.test(line) && !/AutoUpdate/i.test(line)) this.emit('status', { state: 'outdated' });
    const sh = line.match(/SHARES:\s*(\d+)\/(\d+)/i);
    if (sh) { this.stats.shares = parseInt(sh[1], 10); this.stats.sharesTotal = parseInt(sh[2], 10); }
    const s = !sh && line.match(/\bsol(?:ution)?s?\b[^\d]{0,4}(\d+)/i);
    if (s) this.stats.sols = parseInt(s[1], 10);
    if (sh) this.stats.sols = this.stats.shares;
    if (/Pool connection established/i.test(line)) { this.stats.connected = true; this.emit('status', { state: 'running' }); }
    if (/AUTHENTICATION FAILED/i.test(line)) {
      // Avec un client trop ancien, le pool refuse l'authentification : on tente d'abord une mise à jour.
      this.stats.connected = false;
      this.emit('status', { state: 'outdated', error: 'auth_failed' });
    }
    if (/Connecting to pool/i.test(line) && !this.stats.connected) this.emit('status', { state: 'connecting' });
    if (/not running or has exited\. Starting the process|downloading|Downloading/i.test(line) && /worker|trainer|runner|download/i.test(line)) this.emit('status', { state: 'preparing' });
    if (m && this.stats.connected && this.stats.hashrate > 0) this.emit('status', { state: 'running' }); // fin de la préparation du trainer
    if (m || s || sh) this.emit('stats', { ...this.stats });
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    await new Promise((resolve) => {
      const done = () => resolve();
      child.once('exit', done);
      if (PLATFORM === 'win32') {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
      } else {
        try { process.kill(-child.pid, 'SIGINT'); } catch (_) { try { child.kill('SIGINT'); } catch (__) {} }
        setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {} }, 6000);
      }
      setTimeout(() => { if (this.child) { try { child.kill('SIGKILL'); } catch (_) {} } resolve(); }, 8000);
    });
    this.child = null;
  }
}

module.exports = { MinerClient, download, PLATFORM };
