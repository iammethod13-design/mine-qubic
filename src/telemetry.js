'use strict';
/** Télémétrie opt-in, anonyme : un POST JSON par jour, seulement si l'utilisateur a coché l'option et si TELEMETRY_URL est renseignée. */
const CFG = require('./config');

async function ping({ store, version, sys, threads }) {
  if (!CFG.TELEMETRY_URL || !store.get('telemetry')) return false;
  const last = store.get('telemetryLastAt') || 0;
  if (Date.now() - last < 24 * 3600 * 1000) return false;
  const installedAt = store.get('installedAt') || Date.now();
  if (!store.get('installedAt')) store.set({ installedAt });
  const body = {
    v: version,
    lang: store.get('lang') || null,
    os: process.platform + ' ' + require('os').release(),
    cpu: sys.cpuVersion || null,
    threads,
    gpu: !!store.get('gpu'),
    days: Math.floor((Date.now() - installedAt) / 86400000),
  };
  try {
    await fetch(CFG.TELEMETRY_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    store.set({ telemetryLastAt: Date.now() });
    return true;
  } catch (_) { return false; }
}

module.exports = { ping };
