'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const CFG = require('./config');

const DEFAULTS = {
  lang: 'en',                 // anglais par défaut (langue n°1) ; l'utilisateur peut changer dans l'app
  firstRun: true,
  wallet: null,               // { id, seedEnc|null, external }
  alias: null,                // nom du worker sur le pool
  intensity: 50,              // 25 | 50 | 100 (% des threads CPU)
  idleOnly: true,             // ne miner que si le PC est inactif
  idleMinutes: CFG.IDLE_MINUTES_DEFAULT,
  gpu: false,                 // activer la carte graphique
  autoStart: true,            // lancer le minage à l'ouverture de l'app (install and forget)
  launchAtLogin: false,       // lancer l'app au démarrage de Windows
  kwhPrice: 0.20,             // €/kWh, pour l'estimation
  devFeeUserSeconds: 0,       // compteur persistant pour la tranche opérateur
  seedBackedUp: false,
  startBalance: null,         // balance au premier lancement (pour "gagné depuis")
  startBalanceAt: null,
  lastBalance: null,          // dernier solde vu (notification de paiement)
  balanceHistory: [],         // [{at, balance}] à chaque hausse du solde (estimation €/jour)
  pauseFullscreen: true,      // pause si une app est en plein écran (jeu)
  referrer: null,             // adresse Qubic du parrain (reçoit une part des frais)
  telemetry: false,           // télémétrie opt-in
  telemetryLastAt: 0,
  installedAt: null,
  termsAccepted: false,
  watts: null,                // conso estimée (W) saisie par l'utilisateur, sinon estimation
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...DEFAULTS, ...raw };
    } catch (_) {
      this.data = { ...DEFAULTS };
    }
    if (!this.data.alias) {
      this.data.alias = `${CFG.ALIAS_PREFIX}-${crypto.randomBytes(3).toString('hex')}`;
      this.save();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(key) { return this.data[key]; }

  set(patch) {
    Object.assign(this.data, patch);
    this.save();
    return this.data;
  }

  /** Paramètres sûrs à exposer au renderer (jamais la seed chiffrée). */
  publicSettings() {
    const { wallet, ...rest } = this.data;
    return {
      ...rest,
      lang: rest.lang || Store.detectLang(),
      wallet: wallet ? { id: wallet.id, external: !!wallet.external, hasSeed: !!wallet.seedEnc } : null,
    };
  }

  static detectLang() { return 'en'; }
}

module.exports = { Store, DEFAULTS, homeDir: os.homedir };
