'use strict';
/* Client simulé pour les tests UI (`electron . --mock-miner`) : pas de téléchargement, pas de process. */
const EventEmitter = require('events');
class MockClient extends EventEmitter {
  constructor() { super(); this.running = false; this.stats = {}; this.lines = []; this.spec = { version: 'mock', sha256: '0'.repeat(64) }; }
  isInstalled() { return true; }
  installedVersion() { return 'mock'; }
  async checkUpdate() { return false; }
  uninstall() {}
  async ensureInstalled() {}
  start(o) {
    this.running = true; this.address = o.address;
    this.stats = { hashrate: 0, sols: 0, shares: 0, connected: false, startedAt: Date.now(), cpuVersion: 'AVX2' };
    this.emit('status', { state: 'starting' });
    this._t1 = setTimeout(() => { if (!this.running) return; this.stats.connected = true; this.emit('line', 'Pool connection established (mock)'); this.emit('status', { state: 'running' }); }, 300);
    this._t2 = setInterval(() => { if (!this.running) return; this.stats.hashrate = 1000 + Math.round(Math.random() * 100); this.stats.shares++; this.emit('line', `Trainer: ${this.stats.hashrate} it/s | SOLS: ${this.stats.sols} | shares: ${this.stats.shares}`); this.emit('stats', { ...this.stats }); }, 1000);
  }
  async stop() { if (!this.running) return; this.running = false; clearTimeout(this._t1); clearInterval(this._t2); this.emit('exit', { code: 0, address: this.address }); }
}
module.exports = { MockClient };
