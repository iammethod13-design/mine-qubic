'use strict';
/* Tests sans Electron : wallet, store, parsing des logs, scheduler, epoch. `npm test` */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const wallet = require('../src/wallet');
const { Store } = require('../src/store');
const { MinerClient } = require('../src/client');
const { Scheduler } = require('../src/scheduler');
const chain = require('../src/chain');
const CFG = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-test-'));
const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('ENC:' + s), decryptString: (b) => b.toString().replace(/^ENC:/, '') };
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

(async () => {
  console.log('wallet');
  const seed = wallet.generateSeed();
  assert.match(seed, /^[a-z]{55}$/); ok('seed = 55 lettres minuscules');
  assert.notStrictEqual(wallet.generateSeed(), seed); ok('seeds aléatoires');
  const known = 'dkryfmtahovcjqxelszgnubipwdkryfmtahovcjqxelszgnubipwdkr';
  assert.strictEqual(await wallet.idFromSeed(known), 'PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF'); ok('dérivation seed → ID identique à la lib officielle');
  assert.strictEqual(await wallet.verifyId('PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF'), true); ok('verifyId valide');
  assert.strictEqual(await wallet.verifyId('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false); ok('verifyId rejette un checksum faux');
  assert.strictEqual(await wallet.verifyId('pahukx'), false); ok('verifyId rejette un format faux');
  const w = await wallet.createWallet(fakeSafe);
  assert.match(w.id, /^[A-Z]{60}$/); assert.strictEqual(w.external, false);
  assert.strictEqual(wallet.revealSeed(w, fakeSafe).length, 55); ok('createWallet + revealSeed (chiffré via safeStorage)');
  const imp = await wallet.importAddress(' pahukxsrnrtmndzhizwhrhhbxlzbhwlnnaqzlzyrjdlqxfmdasjlkhaestdf ');
  assert.strictEqual(imp.external, true); ok('importAddress normalise (trim + majuscules)');
  await assert.rejects(wallet.importAddress('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')); ok('importAddress rejette une adresse invalide');
  const imp2 = await wallet.importSeed(known, fakeSafe);
  assert.strictEqual(imp2.id, 'PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF'); ok('importSeed');

  console.log('store');
  const store = new Store(tmp);
  assert.match(store.get('alias'), new RegExp('^' + CFG.ALIAS_PREFIX + '-[0-9a-f]{6}$')); ok('alias worker généré');
  store.set({ wallet: w, intensity: 100 });
  const pub = store.publicSettings();
  assert.strictEqual(pub.wallet.hasSeed, true); assert.strictEqual(pub.wallet.seedEnc, undefined); ok('publicSettings ne fuit jamais la seed');
  const store2 = new Store(tmp);
  assert.strictEqual(store2.get('intensity'), 100); assert.strictEqual(store2.get('wallet').id, w.id); ok('persistance');

  console.log('client (parsing des logs)');
  const client = new MinerClient(tmp);
  client._onLine('2026-10-10 08:07:53.897 [INFO]  Pool connection established (wss://wps.qubic.li/ws)');
  assert.strictEqual(client.stats.connected, true); ok('détecte la connexion au pool');
  client._onLine('2026-10-10 11:03:19.242 [INFO]  E:234 | SHARES: 3/5 (R:0) | [AVX512] 22 it/s | 21 avg it/s');
  assert.strictEqual(client.stats.hashrate, 22); assert.strictEqual(client.stats.avgHashrate, 21); assert.strictEqual(client.stats.shares, 3); assert.strictEqual(client.stats.sharesTotal, 5); assert.strictEqual(client.stats.epoch, 234); ok('parse le format qubic.li 3.9 (E:, SHARES, [AVX512] it/s, avg)');
  client._onLine('2026-10-10 11:03:19.242 [INFO]  E:234 | SHARES: 3/5 (R:0) | [AVX512] 1.5 kit/s [CUDA] 400 it/s | 1900 avg it/s');
  assert.strictEqual(client.stats.hashrate, 1900); ok('CPU + GPU additionnés, kit/s');
  client._onLine('2026-10-10 08:08:00.000 [INFO]  Trainer: 1234.5 it/s | SOLS: 3');
  assert.strictEqual(client.stats.hashrate, 1234.5); assert.strictEqual(client.stats.sols, 3); ok('ancien format toujours accepté');
  let errSeen = null; client.on('status', (s) => { if (s.state === 'outdated') errSeen = s.error; });
  client._onLine('2026-10-10 08:07:54.530 [ERRO] [] AUTHENTICATION FAILED');
  assert.strictEqual(errSeen, 'auth_failed'); ok('AUTHENTICATION FAILED → tentative de mise à jour du mineur');
  let sysSeen = null; client.on('sysinfo', (i) => { sysSeen = i; });
  client._onLine('CPU:\t\tEnabled with AVX512 and 1 threads');
  assert.strictEqual(sysSeen && sysSeen.cpuVersion, 'AVX512'); ok('lit la version CPU dans la bannière');
  let outdated = false; client.on('status', (s) => { if (s.state === 'outdated') outdated = true; });
  client._onLine('2026-10-10 08:08:05.000 [ERRO] Client version too old, update required');
  assert.strictEqual(outdated, true); ok('détecte un client obsolète rejeté par le pool');
  assert.strictEqual(client.spec.sha256.length, 64); assert.ok(client.exePath.endsWith(CFG.CLIENT[process.platform === 'win32' ? 'win32' : 'linux'].exe)); ok('spec client');
  // régression 10/10/2026 : le zip officiel contient un accessToken de démo ; s'il reste, le pool
  // n'attribue rien à l'adresse → on doit toujours réécrire appsettings.json sans token.
  fs.mkdirSync(client.dir, { recursive: true });
  fs.writeFileSync(path.join(client.dir, 'appsettings.json'), JSON.stringify({ ClientSettings: { accessToken: 'eyJhbGciOi.demo.token' } }));
  assert.strictEqual(client.settingsClean(), false);
  client.writeSettings();
  const cs = JSON.parse(fs.readFileSync(path.join(client.dir, 'appsettings.json'), 'utf8')).ClientSettings;
  assert.strictEqual(client.settingsClean(), true); assert.strictEqual(cs.accessToken, undefined); assert.strictEqual(cs.poolAddress, CFG.POOL_WS); assert.strictEqual(cs.pps, true); ok('appsettings.json réécrit SANS le token de démo du zip officiel (sinon le pool n\'attribue rien à l\'adresse)');

  console.log('scheduler (client simulé)');
  class FakeClient extends EventEmitter {
    constructor() { super(); this.running = false; this.stats = {}; this.lines = []; this.starts = []; }
    isInstalled() { return true; }
    async ensureInstalled() {}
    start(o) { this.running = true; this.starts.push(o); this.stats = { connected: true, hashrate: 1, startedAt: Date.now() }; this.emit('status', { state: 'running' }); }
    async stop() { if (!this.running) return; this.running = false; this.emit('exit', { code: 0 }); }
  }
  const fc = new FakeClient();
  const st = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'mq-sched-')));
  st.set({ wallet: w, idleOnly: true, idleMinutes: 3, intensity: 50 });
  let idle = 0;
  const sch = new Scheduler({ client: fc, store: st, getIdleSeconds: () => idle });
  await sch.start();
  assert.strictEqual(fc.running, false); assert.strictEqual(sch.state, 'paused'); ok('idleOnly : ne démarre pas si le PC est utilisé');
  idle = 200; await sch._tick();
  assert.strictEqual(fc.running, true); assert.strictEqual(fc.starts[0].address, w.id); assert.strictEqual(fc.starts[0].threads, sch.threads()); ok('idleOnly : démarre après 3 min d\'inactivité, avec l\'adresse utilisateur');
  idle = 0; await sch._tick();
  assert.strictEqual(fc.running, false); assert.strictEqual(sch.state, 'paused'); ok('idleOnly : s\'arrête dès que l\'utilisateur revient');
  st.set({ idleOnly: false }); await sch._tick();
  assert.strictEqual(fc.running, true); ok('mode "toujours" : mine même si le PC est utilisé');
  await sch.stop(); assert.strictEqual(fc.running, false); assert.strictEqual(sch.state, 'stopped'); ok('stop');

  // dev fee (on force une adresse opérateur de test si la config est vide)
  if (!CFG.OPERATOR_ADDRESS) { CFG.OPERATOR_ADDRESS = 'PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF'; CFG.DEV_FEE_PERCENT = CFG.DEV_FEE_PERCENT || 3; }
  if (sch.devFeePercent()) {
    await sch.start();
    st.set({ devFeeUserSeconds: sch.devFeeCycleMinutes() * 60 + 1 });
    await sch._tick(); // bascule → stop
    assert.strictEqual(sch.slice, 'operator');
    await sch._tick(); // relance avec l'adresse opérateur
    assert.strictEqual(fc.starts[fc.starts.length - 1].address, CFG.OPERATOR_ADDRESS); ok('dev fee : bascule sur l\'adresse opérateur après le cycle');
    sch.sliceStartedAt = Date.now() - 20000; await sch._tick();
    assert.strictEqual(sch.slice, 'operator'); assert.strictEqual(fc.running, true); ok('dev fee : la tranche opérateur dure bien plus que 20 s (ms vs s)');
    sch.sliceStartedAt = Date.now() - CFG.DEV_FEE_SLICE_MINUTES * 60000 - 1;
    await sch._tick(); await sch._tick();
    assert.strictEqual(sch.slice, 'user'); assert.strictEqual(fc.starts[fc.starts.length - 1].address, w.id); assert.strictEqual(st.get('devFeeUserSeconds'), 0); ok('dev fee : revient à l\'utilisateur après la tranche, compteur remis à zéro');
    await sch.stop();
  } else {
    console.log('  (dev fee désactivée : OPERATOR_ADDRESS vide — test ignoré)');
    const fakeCfg = Object.assign({}, CFG, { OPERATOR_ADDRESS: 'PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF', DEV_FEE_PERCENT: 3 });
    assert.ok(Math.abs(fakeCfg.DEV_FEE_SLICE_MINUTES * (100 - 3) / 3 - 161.67) < 0.1); ok('dev fee : 5 min toutes les 161,7 min = 3 %');
  }

  console.log('i18n');
  const I18N = require('../src/renderer/i18n.js');
  const langs = Object.keys(I18N).filter((k) => !k.startsWith('__'));
  assert.strictEqual(langs.length, 15); ok('15 langues');
  const ref = Object.keys(I18N.fr);
  for (const l of langs) assert.deepStrictEqual(Object.keys(I18N[l]).sort(), [...ref].sort(), 'clés ' + l);
  ok('mêmes clés dans toutes les langues');
  for (const l of langs) for (const k of ref) for (const ph of (I18N.fr[k].match(/\{\w+\}/g) || [])) assert.ok(I18N[l][k].includes(ph), `${l}.${k} ${ph}`);
  ok('placeholders présents partout');
  assert.ok(I18N.__rtl.includes('ar')); ok('arabe en RTL');

  console.log('estimation + plein écran + parrainage');
  const est = chain.estimate({ history: [{ at: 1, balance: 0 }, { at: 2, balance: 700000 }], priceEur: 0.000002, threads: 8, gpu: false, kwhPrice: 0.2 });
  assert.strictEqual(est.watts, 25 + 8 * 9); assert.ok(Math.abs(est.grossDay - 0.2) < 1e-9); assert.ok(est.netDay < est.grossDay); ok('estimation €/jour à partir du dernier paiement');
  assert.strictEqual(chain.estimate({ history: [], priceEur: 0.000002 }).netDay, null); ok('pas d\'estimation sans paiement');
  let fsOn = false;
  const st2 = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'mq-fs-')));
  st2.set({ wallet: w, idleOnly: false, pauseFullscreen: true });
  const fc2 = new FakeClient();
  const sch2 = new Scheduler({ client: fc2, store: st2, getIdleSeconds: () => 0, isFullscreen: async () => fsOn });
  await sch2.start(); assert.strictEqual(fc2.running, true);
  fsOn = true; await sch2._tick(); assert.strictEqual(fc2.running, false); assert.strictEqual(sch2.snapshot().pausedReason, 'fullscreen'); ok('pause quand une app est en plein écran (mode toujours)');
  fsOn = false; await sch2._tick(); assert.strictEqual(fc2.running, true); ok('reprise quand le plein écran se termine');
  st2.set({ pauseFullscreen: false }); fsOn = true; await sch2._tick(); assert.strictEqual(fc2.running, true); ok('option désactivée : on continue');
  // parrainage : tranche opérateur puis parrain
  st2.set({ referrer: 'PAHUKXSRNRTMNDZHIZWHRHHBXLZBHWLNNAQZLZYRJDLQXFMDASJLKHAESTDF', devFeeUserSeconds: sch2.devFeeCycleMinutes() * 60 + 1 });
  await sch2._tick(); assert.strictEqual(sch2.slice, 'operator'); await sch2._tick();
  assert.strictEqual(fc2.starts[fc2.starts.length - 1].address, CFG.OPERATOR_ADDRESS); ok('parrainage : tranche opérateur d\'abord');
  sch2.sliceStartedAt = Date.now() - sch2._feeSliceSeconds().operator * 1000 - 1; await sch2._tick(); assert.strictEqual(sch2.slice, 'referrer'); await sch2._tick();
  assert.strictEqual(fc2.starts[fc2.starts.length - 1].address, st2.get('referrer')); ok('parrainage : puis tranche parrain (' + Math.round(CFG.REFERRAL_SHARE * 100) + ' % des frais)');
  sch2.sliceStartedAt = Date.now() - sch2._feeSliceSeconds().referrer * 1000 - 1; await sch2._tick(); assert.strictEqual(sch2.slice, 'user'); ok('parrainage : retour utilisateur');
  await sch2.stop();

  console.log('chain');
  const d = chain.nextEpochEnd(new Date('2026-10-10T09:00:00Z'));
  assert.strictEqual(d.toISOString(), '2026-10-14T12:00:00.000Z'); ok('prochaine fin d\'epoch = mercredi 12:00 UTC');
  assert.strictEqual(chain.nextEpochEnd(new Date('2026-10-14T12:00:01Z')).toISOString(), '2026-10-21T12:00:00.000Z'); ok('après mercredi midi → mercredi suivant');

  console.log(`\n${passed} tests OK`);
})().catch((e) => { console.error('\n✗ ÉCHEC :', e); process.exit(1); });
