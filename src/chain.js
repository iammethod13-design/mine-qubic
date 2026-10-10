'use strict';
/** Données publiques : balance on-chain (rpc.qubic.org), epoch, prix (CoinGecko). */
const CFG = require('./config');

const cache = { price: { at: 0, value: null }, balance: new Map() };

async function getJson(url, timeoutMs = 8000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'MineQubic/0.1' } });
  if (!r.ok) throw new Error('http_' + r.status);
  return r.json();
}

async function getBalance(id) {
  const c = cache.balance.get(id);
  if (c && Date.now() - c.at < 30000) return c.value;
  const j = await getJson(`${CFG.RPC_BASE}/v1/balances/${id}`);
  const b = j.balance || {};
  const value = {
    balance: Number(b.balance || 0),
    incoming: Number(b.incomingAmount || 0),
    outgoing: Number(b.outgoingAmount || 0),
    numIn: b.numberOfIncomingTransfers || 0,
    tick: b.validForTick,
  };
  cache.balance.set(id, { at: Date.now(), value });
  return value;
}

async function getTickInfo() {
  const j = await getJson(`${CFG.RPC_BASE}/v1/tick-info`);
  return j.tickInfo || {};
}

/** Prix en EUR/USD, mis en cache 10 min (CoinGecko limite fortement les appels). */
async function getPrice() {
  if (cache.price.value && Date.now() - cache.price.at < 10 * 60 * 1000) return cache.price.value;
  try {
    const j = await getJson(CFG.PRICE_URL);
    const p = j['qubic-network'] || {};
    cache.price = { at: Date.now(), value: { eur: p.eur || null, usd: p.usd || null } };
  } catch (_) {
    if (!cache.price.value) cache.price = { at: Date.now() - 9 * 60 * 1000, value: { eur: null, usd: null } };
  }
  return cache.price.value;
}

/** Prochaine fin d'epoch : mercredi 12:00 UTC */
function nextEpochEnd(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const day = d.getUTCDay(); // 0 = dimanche, 3 = mercredi
  let delta = (3 - day + 7) % 7;
  if (delta === 0 && d <= now) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/**
 * Estimation €/jour à partir des paiements réels du pool.
 * history : [{at, balance}] (un point par observation d'augmentation du solde).
 * Le pool paie une fois par epoch (semaine) : le dernier gain ÷ 7 = brut/jour.
 * Électricité : watts estimés (threads actifs) × 24 h × prix du kWh.
 */
function estimate({ history = [], priceEur, threads = 0, gpu = false, kwhPrice = 0.2, wattsOverride = null }) {
  const gains = [];
  for (let i = 1; i < history.length; i++) {
    const d = history[i].balance - history[i - 1].balance;
    if (d > 0) gains.push({ at: history[i].at, qubic: d });
  }
  const last = gains[gains.length - 1] || null;
  const watts = wattsOverride != null ? wattsOverride : Math.round(25 + threads * 9 + (gpu ? 150 : 0));
  const elecDay = watts / 1000 * 24 * kwhPrice;
  if (!last || !priceEur) return { lastPayout: last, watts, elecDay, grossDay: null, netDay: null };
  // moyenne des 4 derniers paiements si disponibles
  const recent = gains.slice(-4);
  const avg = recent.reduce((a, g) => a + g.qubic, 0) / recent.length;
  const grossDay = avg / 7 * priceEur;
  return { lastPayout: last, watts, elecDay, grossDay, netDay: grossDay - elecDay, payouts: gains.length };
}

module.exports = { getBalance, getTickInfo, getPrice, nextEpochEnd, estimate };
