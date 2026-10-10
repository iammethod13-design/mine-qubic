'use strict';
/* Exécuté DANS Electron par test/ui.js : charge src/main.js en mode mock et pilote la fenêtre. */
const { app, BrowserWindow } = require('electron');
const assert = require('assert');

const ud = process.argv.find((a) => a.startsWith('--user-data='));
if (ud) app.setPath('userData', ud.slice('--user-data='.length));
process.argv.push('--mock-miner');
require('../src/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (n) => { passed++; console.log('  ✓', n); };

async function run() {
  await sleep(1500);
  const win = BrowserWindow.getAllWindows()[0];
  assert.ok(win, 'fenêtre ouverte');
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('  [renderer]', msg); });
  const js = (code) => win.webContents.executeJavaScript(code);
  const visible = (id) => js(`!document.getElementById('${id}').classList.contains('hidden')`);

  console.log('ui');
  assert.strictEqual(await visible('onboard'), true); ok('écran d\'accueil au premier lancement');
  assert.strictEqual(await visible('modal-terms'), false); ok('pas de fenêtre bloquante au premier lancement');
  assert.ok((await js(`document.getElementById('onboard-consent').textContent`)).length > 10); ok('consentement affiché sous le bouton');
  await js(`document.getElementById('onboard-consent').querySelector('button').click()`); await sleep(200);
  assert.strictEqual(await visible('modal-terms'), true); ok('lien vers les conditions');
  await js(`document.getElementById('terms-ok').click()`); await sleep(200);

  await js(`document.getElementById('onboard-start').click()`); await sleep(2500);
  assert.strictEqual(await visible('main'), true); ok('passage à l\'écran principal');
  const addr = await js(`document.getElementById('addr').textContent`);
  assert.match(addr, /^[A-Z]{60}$/); ok('wallet créé : ' + addr.slice(0, 8) + '…');
  const label = await js(`document.getElementById('state-label').textContent`);
  assert.ok(/Minage en cours|Mining/.test(label), 'état = ' + label); ok('minage démarré (mock) : ' + label);
  const speed = await js(`document.getElementById('s-speed').textContent`);
  assert.ok(/it\/s/.test(speed)); ok('vitesse affichée : ' + speed);
  assert.strictEqual(await js(`document.getElementById('bigbtn').getAttribute('aria-pressed')`), 'true'); ok('aria-pressed');

  // réglages
  await js(`document.querySelector('#seg-int button[data-v="100"]').click()`); await sleep(800);
  const threads = await js(`document.getElementById('s-threads').textContent`);
  assert.ok(/^(\d+)\/\1$/.test(threads), threads); ok('puissance Max = tous les cœurs (' + threads + ')');

  // langue
  await js(`(() => { const s=document.getElementById('sel-lang'); s.value='de'; s.dispatchEvent(new Event('change')); })()`); await sleep(500);
  assert.strictEqual(await js(`document.querySelector('[data-i18n="settings"]').textContent`), 'Einstellungen'); ok('changement de langue → DE');
  await js(`(() => { const s=document.getElementById('sel-lang'); s.value='ar'; s.dispatchEvent(new Event('change')); })()`); await sleep(500);
  assert.strictEqual(await js(`document.documentElement.dir`), 'rtl'); ok('arabe → RTL');
  await js(`(() => { const s=document.getElementById('sel-lang'); s.value='fr'; s.dispatchEvent(new Event('change')); })()`); await sleep(500);

  // wallet : QR + modale connexion
  await js(`document.getElementById('b-connect').click()`); await sleep(800);
  assert.strictEqual(await visible('modal-connect'), true);
  const qr = await js(`document.getElementById('qr').src`);
  assert.ok(qr.startsWith('data:image/png'), 'QR généré'); ok('QR code de l\'adresse généré');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(300);
  assert.strictEqual(await visible('modal-connect'), false); ok('Échap ferme la modale');

  // seed backup
  await js(`document.getElementById('b-backup').click()`); await sleep(500);
  const seed = await js(`document.getElementById('seed').textContent`);
  assert.match(seed, /^[a-z]{55}$/); ok('phrase secrète révélée (55 lettres)');
  await js(`document.getElementById('seed-done').click()`); await sleep(300);

  // parrainage
  await js(`document.getElementById('i-ref').value='PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF'; document.getElementById('b-ref-save').click()`); await sleep(800);
  assert.ok(/PAHUKXSR/.test(await js(`document.getElementById('ref-status').textContent`))); ok('code parrain enregistré');
  await js(`document.getElementById('i-ref').value='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; document.getElementById('b-ref-save').click()`); await sleep(800);
  assert.strictEqual(await visible('ref-err'), true); ok('code parrain invalide refusé');

  // stop
  await js(`document.getElementById('bigbtn').click()`); await sleep(1000);
  assert.strictEqual(await js(`document.getElementById('bigbtn').getAttribute('aria-pressed')`), 'false'); ok('arrêt');

  console.log(`\n${passed} tests UI OK`);
  app.exit(0);
}

app.whenReady().then(() => run().catch((e) => { console.error('\n✗ ÉCHEC UI :', e); app.exit(1); }));
setTimeout(() => { console.error('timeout'); app.exit(2); }, 60000);
