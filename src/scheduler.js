'use strict';
/**
 * Orchestre le minage :
 *  - mode "seulement quand le PC est inactif" (powerMonitor.getSystemIdleTime)
 *  - intensité (nombre de threads = % des threads CPU)
 *  - "dev fee" par tranches de temps : après N minutes de minage utilisateur,
 *    on mine quelques minutes pour l'adresse opérateur, puis on repasse à l'utilisateur.
 *    Le compteur est persistant (store), donc redémarrer l'app ne l'évite pas.
 *  - redémarrage automatique si le client plante
 */
const os = require('os');
const EventEmitter = require('events');
const CFG = require('./config');

const TICK_MS = 5000;

class Scheduler extends EventEmitter {
  /**
   * @param {object} deps { client: MinerClient, store: Store, getIdleSeconds: () => number }
   */
  constructor({ client, store, getIdleSeconds, isFullscreen }) {
    super();
    this.client = client;
    this.store = store;
    this.getIdleSeconds = getIdleSeconds || (() => 0);
    this.isFullscreen = isFullscreen || (async () => false);
    this.fullscreenNow = false;
    this.wanted = false;           // l'utilisateur veut miner
    this.slice = 'user';           // 'user' | 'operator' | 'referrer'
    this.sliceStartedAt = 0;
    this.state = 'stopped';        // stopped|downloading|extracting|preparing|starting|connecting|running|paused|devfee|error|restarting
    this.error = null;
    this.progress = 0;
    this.lastTick = Date.now();
    this.crashes = 0;
    this.timer = null;
    this._busy = false;

    client.on('status', (s) => {
      if (s.state === 'outdated') { this.updateClient(s.error === 'auth_failed' ? 'auth_failed' : 'pool_rejected_version'); return; }
      if (s.state === 'running' && this.slice !== 'user') this._setState('devfee');
      else if (s.state === 'error') { this.error = s.error; this._setState('error'); }
      else if (s.state === 'downloading') { this.progress = s.progress; this._setState('downloading'); }
      else if (['extracting', 'preparing', 'starting', 'connecting', 'running'].includes(s.state)) this._setState(s.state);
    });
    client.on('exit', ({ code }) => {
      if (!this.wanted) { this._setState('stopped'); return; }
      if (this._switching) return; // arrêt volontaire pour changer de tranche/paramètres
      if (this.state === 'error') { this.wanted = false; return; }
      this.crashes++;
      this._setState('restarting');
      this.emit('log', `[app] le client s'est arrêté (code ${code}), redémarrage dans 10 s`);
      setTimeout(() => this._tick(), 10000);
    });
  }

  _setState(s) {
    if (this.state === s && s !== 'downloading') return;
    this.state = s;
    this.emit('state', this.snapshot());
  }

  snapshot() {
    const st = this.client.stats || {};
    const feeMins = this.devFeeCycleMinutes();
    return {
      state: this.state,
      wanted: this.wanted,
      slice: this.slice,
      error: this.error,
      progress: this.progress,
      hashrate: st.hashrate || 0,
      sols: st.sols || 0,
      shares: st.shares || 0,
      connected: !!st.connected,
      startedAt: st.startedAt,
      threads: this.threads(),
      cpuThreads: os.cpus().length,
      devFee: { percent: this.devFeePercent(), userSeconds: this.store.get('devFeeUserSeconds') || 0, cycleMinutes: feeMins, referrer: !!this.store.get('referrer') },
      pausedReason: this.pausedReason || null,
      crashes: this.crashes,
    };
  }

  devFeePercent() {
    return CFG.OPERATOR_ADDRESS && CFG.DEV_FEE_PERCENT > 0 ? CFG.DEV_FEE_PERCENT : 0;
  }

  /** minutes de minage utilisateur avant une tranche opérateur */
  devFeeCycleMinutes() {
    const p = this.devFeePercent();
    if (!p) return 0;
    return CFG.DEV_FEE_SLICE_MINUTES * (100 - p) / p;
  }

  threads() {
    const n = os.cpus().length;
    const pct = this.store.get('intensity') || 50;
    return Math.max(1, Math.min(n, Math.round(n * pct / 100)));
  }

  /** Démarrer (bouton START) */
  async start() {
    this.wanted = true;
    this.error = null;
    this.crashes = 0;
    if (!this.timer) this.timer = setInterval(() => this._tick(), TICK_MS);
    this._scheduleUpdateCheck();
    await this._tick();
  }

  /** Vérifie le manifest distant toutes les CLIENT_UPDATE_CHECK_HOURS heures pendant le minage. */
  _scheduleUpdateCheck() {
    if (this.updateTimer || !CFG.CLIENT_UPDATE_CHECK_HOURS) return;
    this.updateTimer = setInterval(async () => {
      if (!this.wanted || this._updating) return;
      try { if (await this.client.checkUpdate()) await this.updateClient('manifest'); } catch (_) {}
    }, CFG.CLIENT_UPDATE_CHECK_HOURS * 3600 * 1000);
  }

  /**
   * Mise à jour du mineur : on l'arrête, on supprime l'ancien, le prochain tick
   * re-télécharge la version du manifest (hash vérifié) et relance.
   * Appelé quand le pool rejette la version, ou quand le manifest change.
   */
  async updateClient(reason) {
    if (this._updating) return;
    this._updating = true;
    try {
      this.emit('log', `[app] mise à jour du mineur (${reason})`);
      this._setState('updating');
      await this._stopForSwitch();
      try { if (await this.client.checkUpdate()) this.client.uninstall(); } catch (_) {}
      if (!this.wanted) return;
      // si le manifest n'a rien de neuf et que le pool rejette quand même la version :
      // on réinstalle la version épinglée (le client se mettra à jour tout seul via AutoUpdate)
      if ((reason === 'pool_rejected_version' || reason === 'auth_failed') && this.client.isInstalled()) {
        this.pendingReinstalls = (this.pendingReinstalls || 0) + 1;
        if (this.pendingReinstalls <= 2) this.client.uninstall();
        else { this.error = reason === 'auth_failed' ? 'auth_failed' : 'client_outdated'; this._setState('error'); this.wanted = false; return; }
      }
      await this._tick();
    } finally { this._updating = false; }
  }

  /** Arrêter (bouton STOP) */
  async stop() {
    this.wanted = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.updateTimer) { clearInterval(this.updateTimer); this.updateTimer = null; }
    this._switching = true;
    await this.client.stop();
    this._switching = false;
    this._setState('stopped');
  }

  /** Les paramètres ont changé (intensité, GPU, adresse...) : on redémarre si besoin */
  async applySettings() {
    if (!this.wanted || !this.client.running) return;
    await this._restartClient();
  }

  async _restartClient() {
    await this._stopForSwitch();
    await this._tick();
  }

  /** Arrêt volontaire (changement de tranche ou de paramètres) : pas compté comme crash */
  async _stopForSwitch() {
    this._switching = true;
    try { await this.client.stop(); } finally { this._switching = false; }
  }

  _shouldRunNow() {
    if (!this.wanted) return false;
    this.pausedReason = null;
    if (this.fullscreenNow && this.store.get('pauseFullscreen') !== false) { this.pausedReason = 'fullscreen'; return false; }
    if (!this.store.get('idleOnly')) return true;
    const idle = this.getIdleSeconds();
    const threshold = (this.store.get('idleMinutes') || CFG.IDLE_MINUTES_DEFAULT) * 60;
    const ok = this.client.running ? idle >= 2 : idle >= threshold; // en cours : on coupe dès que l'utilisateur touche au PC
    if (!ok) this.pausedReason = 'idle';
    return ok;
  }

  _currentAddress() {
    const w = this.store.get('wallet');
    if (this.slice === 'operator') return CFG.OPERATOR_ADDRESS;
    if (this.slice === 'referrer') return this.store.get('referrer') || CFG.OPERATOR_ADDRESS;
    return w && w.id;
  }

  /** Durée (s) de la tranche frais, découpée opérateur / parrain si un code de parrainage est enregistré. */
  _feeSliceSeconds() {
    const total = CFG.DEV_FEE_SLICE_MINUTES * 60;
    const ref = this.store.get('referrer');
    const share = ref && CFG.REFERRAL_SHARE > 0 ? Math.min(0.9, CFG.REFERRAL_SHARE) : 0;
    return { operator: Math.round(total * (1 - share)), referrer: Math.round(total * share) };
  }

  async _tick() {
    if (this._busy) return;
    this._busy = true;
    try {
      const now = Date.now();
      const dt = Math.min(60, (now - this.lastTick) / 1000);
      this.lastTick = now;
      if (this.wanted && this.store.get('pauseFullscreen') !== false) {
        // en mode inactif, inutile de vérifier le plein écran si l'utilisateur est de toute façon actif
        try { this.fullscreenNow = await this.isFullscreen(); } catch (_) { this.fullscreenNow = false; }
      } else this.fullscreenNow = false;

      // comptabilité dev-fee
      if (this.client.running && this.client.stats.connected) {
        if (this.slice === 'user') {
          this.store.set({ devFeeUserSeconds: (this.store.get('devFeeUserSeconds') || 0) + dt });
        }
      }
      const pct = this.devFeePercent();
      if (pct && this.wanted) {
        const cycleSec = this.devFeeCycleMinutes() * 60;
        const fee = this._feeSliceSeconds();
        if (this.slice === 'user' && (this.store.get('devFeeUserSeconds') || 0) >= cycleSec && this.client.running) {
          this.slice = 'operator';
          this.sliceStartedAt = now;
          this.emit('log', `[app] tranche opérateur (${pct} %) pendant ${CFG.DEV_FEE_SLICE_MINUTES} min${fee.referrer ? ' (dont parrain)' : ''}`);
          await this._stopForSwitch();
          return; // le prochain tick relance avec l'adresse opérateur
        }
        if (this.slice === 'operator' && now - this.sliceStartedAt >= fee.operator) {
          if (fee.referrer > 0) {
            this.slice = 'referrer';
            this.sliceStartedAt = now;
            this.emit('log', '[app] tranche parrain');
          } else {
            this.slice = 'user';
            this.store.set({ devFeeUserSeconds: 0 });
            this.emit('log', '[app] retour au minage utilisateur');
          }
          await this._stopForSwitch();
          return;
        }
        if (this.slice === 'referrer' && now - this.sliceStartedAt >= fee.referrer) {
          this.slice = 'user';
          this.store.set({ devFeeUserSeconds: 0 });
          this.emit('log', '[app] retour au minage utilisateur');
          await this._stopForSwitch();
          return;
        }
      } else {
        this.slice = 'user';
      }

      const should = this._shouldRunNow();
      if (should && !this.client.running) {
        if (this.state === 'error') return;
        const address = this._currentAddress();
        if (!address) { this.error = 'no_wallet'; this._setState('error'); this.wanted = false; return; }
        if (!this.client.isInstalled()) {
          try { await this.client.ensureInstalled(); }
          catch (e) { this.error = e.message; this._setState('error'); this.wanted = false; return; }
        }
        this.client.start({ address, alias: this.store.get('alias'), threads: this.threads(), gpu: !!this.store.get('gpu') });
      } else if (!should && this.client.running) {
        await this._stopForSwitch();
        this._setState('paused');
      } else if (!should && !this.client.running && this.wanted) {
        this._setState('paused');
      } else if (this.client.running) {
        this.emit('state', this.snapshot());
      }
    } finally {
      this._busy = false;
    }
  }

}

module.exports = { Scheduler };
