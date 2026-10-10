'use strict';
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, powerMonitor, safeStorage, clipboard, Notification } = require('electron');
const path = require('path');
const CFG = require('./config');
const { Store } = require('./store');
const wallet = require('./wallet');
const { MinerClient } = require('./client');
const { Scheduler } = require('./scheduler');
const chain = require('./chain');
const sysinfo = require('./sysinfo');
const updater = require('./updater');
const telemetry = require('./telemetry');
const { FullscreenWatcher } = require('./fullscreen');
const I18N = require('./renderer/i18n.js');

// Une seule instance : si l'utilisateur relance l'app, on ramène la fenêtre existante.
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
let tray = null;
let store, client, scheduler;
let quitting = false;
let sys = { cpuVersion: null };
let notifiedBalance = null;
let fullscreen = null;
const MOCK = process.argv.includes('--mock-miner'); // tests UI : client simulé

const LANGS = Object.keys(I18N).filter((k) => !k.startsWith('__'));
function lang() { const l = store.get('lang') || Store.detectLang(); return LANGS.includes(l) ? l : 'en'; }
function t(key, vars = {}) {
  const str = (I18N[lang()] && I18N[lang()][key]) || I18N.en[key] || key;
  return str.replace(/\{(\w+)\}/g, (_, v) => (v in vars ? vars[v] : `{${v}}`));
}

function iconPath(name = 'icon.png') { return path.join(__dirname, '..', 'assets', name); }

function createWindow() {
  win = new BrowserWindow({
    width: 440,
    height: 780,
    minWidth: 400,
    minHeight: 640,
    backgroundColor: '#16171b',
    title: 'Mine Qubic',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // QA : `electron . --screenshot=/chemin/capture.png` capture la fenêtre puis quitte
  const shot = process.argv.find((a) => a.startsWith('--screenshot='));
  if (shot) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(shot.slice('--screenshot='.length), img.toPNG());
      quitting = true; app.quit();
    }, 2500));
  }
  win.on('close', (e) => {
    // Fermer la fenêtre = réduire dans la zone de notification si on mine
    if (!quitting && scheduler && scheduler.wanted) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function showWindow() { if (win) { win.show(); win.focus(); } else createWindow(); }

function refreshTray() {
  if (!tray) return;
  const running = scheduler && scheduler.wanted;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mine Qubic', enabled: false },
    { type: 'separator' },
    { label: running ? t('tray_stop') : t('tray_start'), click: () => (running ? scheduler.stop() : scheduler.start()) },
    { label: t('tray_open'), click: showWindow },
    { type: 'separator' },
    { label: t('tray_quit'), click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(iconPath('tray.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('Mine Qubic');
    refreshTray();
    tray.on('click', showWindow);
    scheduler.on('state', refreshTray);
  } catch (_) { /* pas de tray (ex. Linux sans libappindicator) */ }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Notification "paiement reçu" quand le solde on-chain augmente. */
async function pollPayout() {
  const w = store.get('wallet');
  if (!w) return;
  try {
    const b = await chain.getBalance(w.id);
    if (notifiedBalance == null) notifiedBalance = store.get('lastBalance') != null ? store.get('lastBalance') : b.balance;
    if (b.balance > notifiedBalance) {
      const gained = b.balance - notifiedBalance;
      const hist = (store.get('balanceHistory') || []).slice(-60);
      if (!hist.length) hist.push({ at: Date.now() - 1, balance: notifiedBalance });
      hist.push({ at: Date.now(), balance: b.balance });
      store.set({ balanceHistory: hist });
      if (Notification.isSupported()) {
        new Notification({ title: t('notif_payout_title'), body: t('notif_payout_body', { n: gained.toLocaleString(lang()) }), icon: iconPath() }).show();
      }
      send('payout', { gained, balance: b.balance });
    }
    notifiedBalance = b.balance;
    store.set({ lastBalance: b.balance });
  } catch (_) { /* hors-ligne */ }
}

function publicConfig() {
  return {
    devFeePercent: scheduler.devFeePercent(),
    devFeeSlice: CFG.DEV_FEE_SLICE_MINUTES,
    referralShare: CFG.REFERRAL_SHARE || 0,
    poolDashboard: CFG.POOL_DASHBOARD,
    walletUrl: CFG.WALLET_URL || 'https://wallet.qubic.org',
    exchanges: CFG.EXCHANGES,
    clientVersion: client.spec.version,
    platform: process.platform,
    version: app.getVersion(),
    langs: I18N.__names,
    rtl: I18N.__rtl,
    appUpdate: updater.current(),
  };
}

function setupIpc() {
  ipcMain.handle('app:init', async () => ({
    settings: store.publicSettings(),
    status: scheduler.snapshot(),
    config: publicConfig(),
    sys: { ...sys },
    lines: client.lines.slice(-200),
  }));

  ipcMain.handle('miner:start', async () => {
    if (!store.get('wallet')) {
      const w = await wallet.createWallet(safeStorage);
      store.set({ wallet: w, firstRun: false });
      send('wallet:changed', store.publicSettings().wallet);
    }
    const w = store.get('wallet');
    if (store.get('startBalance') == null && w) {
      try { const b = await chain.getBalance(w.id); store.set({ startBalance: b.balance, startBalanceAt: Date.now() }); } catch (_) {}
    }
    await scheduler.start();
    return scheduler.snapshot();
  });
  ipcMain.handle('miner:stop', async () => { await scheduler.stop(); return scheduler.snapshot(); });

  ipcMain.handle('settings:set', async (_e, patch) => {
    const allowed = ['lang', 'intensity', 'idleOnly', 'idleMinutes', 'gpu', 'autoStart', 'launchAtLogin', 'kwhPrice', 'seedBackedUp', 'firstRun', 'pauseFullscreen', 'telemetry', 'termsAccepted', 'watts'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('intensity' in clean) clean.intensity = [25, 50, 100].includes(+clean.intensity) ? +clean.intensity : 50;
    if ('idleMinutes' in clean) clean.idleMinutes = Math.min(60, Math.max(1, +clean.idleMinutes || 3));
    if ('lang' in clean && !LANGS.includes(clean.lang)) delete clean.lang;
    if ('gpu' in clean && clean.gpu && sys.nvidia === false) clean.gpu = false;
    if ('kwhPrice' in clean) clean.kwhPrice = Math.min(2, Math.max(0, parseFloat(clean.kwhPrice) || 0));
    if ('watts' in clean) clean.watts = clean.watts == null || clean.watts === '' ? null : Math.min(2000, Math.max(5, parseInt(clean.watts, 10) || 0));
    store.set(clean);
    if ('launchAtLogin' in clean && process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: !!clean.launchAtLogin, args: ['--hidden'] });
    }
    if ('lang' in clean) refreshTray();
    if (['intensity', 'gpu'].some((k) => k in clean)) await scheduler.applySettings();
    return store.publicSettings();
  });

  ipcMain.handle('wallet:create', async () => {
    const w = await wallet.createWallet(safeStorage);
    store.set({ wallet: w, startBalance: 0, startBalanceAt: Date.now(), seedBackedUp: false, lastBalance: 0 });
    notifiedBalance = 0;
    await scheduler.applySettings();
    return store.publicSettings().wallet;
  });
  ipcMain.handle('wallet:import', async (_e, { address, seed }) => {
    const w = seed ? await wallet.importSeed(seed, safeStorage) : await wallet.importAddress(address);
    let bal = 0;
    try { bal = (await chain.getBalance(w.id)).balance; } catch (_) {}
    store.set({ wallet: w, startBalance: bal, startBalanceAt: Date.now(), seedBackedUp: !!w.external, lastBalance: bal });
    notifiedBalance = bal;
    await scheduler.applySettings();
    return store.publicSettings().wallet;
  });
  ipcMain.handle('wallet:reveal', async () => {
    const seed = wallet.revealSeed(store.get('wallet'), safeStorage);
    if (seed) store.set({ seedBackedUp: true });
    return seed;
  });
  ipcMain.handle('wallet:verify', async (_e, id) => wallet.verifyId(id));
  ipcMain.handle('referral:set', async (_e, id) => {
    if (!id) { store.set({ referrer: null }); return { ok: true, referrer: null }; }
    id = String(id).trim().toUpperCase();
    const w = store.get('wallet');
    if (!(await wallet.verifyId(id)) || (w && w.id === id)) return { ok: false };
    store.set({ referrer: id });
    return { ok: true, referrer: id };
  });
  ipcMain.handle('wallet:qr', async () => {
    const w = store.get('wallet');
    if (!w) return null;
    const QR = require('qrcode');
    return QR.toDataURL(w.id, { margin: 1, width: 220, color: { dark: '#16171bff', light: '#ffffffff' } });
  });

  ipcMain.handle('chain:balance', async () => {
    const w = store.get('wallet');
    if (!w) return null;
    const [b, price] = await Promise.all([chain.getBalance(w.id).catch(() => null), chain.getPrice()]);
    return {
      balance: b ? b.balance : null,
      earnedSinceStart: b && store.get('startBalance') != null ? Math.max(0, b.balance - store.get('startBalance')) : null,
      startBalanceAt: store.get('startBalanceAt'),
      numIn: b ? b.numIn : null,
      price,
      nextEpochEnd: chain.nextEpochEnd().toISOString(),
    };
  });

  ipcMain.handle('app:checkUpdate', async () => updater.check());
  ipcMain.handle('app:installUpdate', async () => updater.install());
  ipcMain.handle('app:openExternal', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  ipcMain.handle('app:copy', (_e, text) => { clipboard.writeText(String(text)); });
  ipcMain.handle('app:lines', () => client.lines.slice(-300));
  ipcMain.handle('app:quit', () => { quitting = true; app.quit(); });
}

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  client = MOCK ? new (require('../test/mock-client').MockClient)() : new MinerClient(app.getPath('userData'));
  fullscreen = new FullscreenWatcher();
  scheduler = new Scheduler({ client, store, getIdleSeconds: () => (MOCK ? 9999 : powerMonitor.getSystemIdleTime()), isFullscreen: () => fullscreen.check() });

  scheduler.on('state', (s) => send('status', s));
  scheduler.on('log', (l) => send('line', l));
  client.on('line', (l) => send('line', l));
  client.on('stats', () => send('status', scheduler.snapshot()));
  client.on('sysinfo', (i) => { Object.assign(sys, i); send('sys', { ...sys }); });
  updater.onChange((u) => send('appUpdate', u));

  setupIpc();
  if (!process.argv.includes('--hidden')) createWindow();
  createTray();
  updater.init(app);

  sysinfo.collect().then((i) => { Object.assign(sys, i); send('sys', { ...sys }); });
  setInterval(pollPayout, 10 * 60 * 1000);
  setTimeout(pollPayout, 15000);
  const tele = () => telemetry.ping({ store, version: app.getVersion(), sys, threads: scheduler.threads() }).catch(() => {});
  setTimeout(tele, 60000); setInterval(tele, 6 * 3600 * 1000);

  if (store.get('autoStart') && store.get('wallet')) scheduler.start().catch(() => {});
});

app.on('second-instance', showWindow);
app.on('activate', () => { if (!win) createWindow(); });
app.on('window-all-closed', () => { if (!(scheduler && scheduler.wanted)) app.quit(); });
app.on('before-quit', async (e) => {
  if (fullscreen) fullscreen.stop();
  if (client && client.running) { e.preventDefault(); quitting = true; await scheduler.stop(); app.exit(0); }
});
