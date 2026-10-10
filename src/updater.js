'use strict';
/**
 * Mise à jour de l'app elle-même (pas du mineur) via electron-updater + GitHub Releases.
 * Activée seulement si config.APP_UPDATE.owner/repo sont renseignés ET que l'app est packagée.
 * Flux : check → download en arrière-plan → "Redémarrer pour installer" dans l'UI.
 */
const CFG = require('./config');

let autoUpdater = null;
let state = { status: 'off', version: null, error: null };
let listeners = [];

function emit() { listeners.forEach((f) => f({ ...state })); }

function init(app) {
  const u = CFG.APP_UPDATE || {};
  if (!u.owner || !u.repo || !app.isPackaged) { state.status = 'off'; return; }
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.setFeedURL({ provider: u.provider || 'github', owner: u.owner, repo: u.repo });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => { state = { status: 'checking', version: null, error: null }; emit(); });
    autoUpdater.on('update-available', (i) => { state = { status: 'downloading', version: i.version, error: null }; emit(); });
    autoUpdater.on('update-not-available', () => { state = { status: 'none', version: null, error: null }; emit(); });
    autoUpdater.on('update-downloaded', (i) => { state = { status: 'ready', version: i.version, error: null }; emit(); });
    autoUpdater.on('error', (e) => { state = { status: 'error', version: null, error: String(e && e.message || e) }; emit(); });
    state.status = 'idle';
    // premier check 30 s après le lancement, puis toutes les 6 h
    setTimeout(() => check(), 30000);
    setInterval(() => check(), 6 * 3600 * 1000);
  } catch (e) {
    state = { status: 'off', version: null, error: String(e.message || e) };
  }
}

async function check() {
  if (!autoUpdater) return state;
  try { await autoUpdater.checkForUpdates(); } catch (e) { state = { status: 'error', version: null, error: String(e.message || e) }; emit(); }
  return state;
}

function install() { if (autoUpdater && state.status === 'ready') autoUpdater.quitAndInstall(); }
function onChange(f) { listeners.push(f); }
function current() { return { ...state }; }

module.exports = { init, check, install, onChange, current };
