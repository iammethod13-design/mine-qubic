'use strict';
/**
 * Portefeuille Qubic local, non-custodial.
 *  - La seed (55 lettres minuscules) est générée avec le CSPRNG de Node.
 *  - Elle est chiffrée au repos avec Electron safeStorage (DPAPI sur Windows,
 *    Keychain sur macOS, libsecret sur Linux) : seule la session Windows de
 *    l'utilisateur peut la déchiffrer.
 *  - L'ID public (60 lettres majuscules) est dérivé avec la librairie officielle
 *    @qubic-lib/qubic-ts-library (K12 + FourQ), identique à wallet.qubic.org.
 */
const crypto = require('crypto');
const { QubicHelper } = require('@qubic-lib/qubic-ts-library/dist/qubicHelper');

const helper = new QubicHelper();
const SEED_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const SEED_LEN = 55;
const ID_RE = /^[A-Z]{60}$/;

function generateSeed() {
  let s = '';
  for (let i = 0; i < SEED_LEN; i++) s += SEED_ALPHABET[crypto.randomInt(26)];
  return s;
}

async function idFromSeed(seed) {
  if (!/^[a-z]{55}$/.test(seed)) throw new Error('bad_seed');
  const pkg = await helper.createIdPackage(seed);
  return pkg.publicId;
}

async function verifyId(id) {
  if (typeof id !== 'string') return false;
  id = id.trim().toUpperCase();
  if (!ID_RE.test(id)) return false;
  try { return await helper.verifyIdentity(id); } catch (_) { return false; }
}

/**
 * safe = electron.safeStorage (injecté pour rester testable sans Electron)
 */
async function createWallet(safe) {
  const seed = generateSeed();
  const id = await idFromSeed(seed);
  const seedEnc = safe && safe.isEncryptionAvailable()
    ? safe.encryptString(seed).toString('base64')
    : Buffer.from(seed, 'utf8').toString('base64'); // fallback (dev/Linux sans keyring)
  return { id, seedEnc, external: false, plain: !(safe && safe.isEncryptionAvailable()) };
}

function revealSeed(wallet, safe) {
  if (!wallet || !wallet.seedEnc) return null;
  const buf = Buffer.from(wallet.seedEnc, 'base64');
  if (wallet.plain) return buf.toString('utf8');
  return safe.decryptString(buf);
}

async function importAddress(id) {
  id = String(id || '').trim().toUpperCase();
  if (!(await verifyId(id))) throw new Error('bad_id');
  return { id, seedEnc: null, external: true };
}

async function importSeed(seed, safe) {
  seed = String(seed || '').trim().toLowerCase();
  const id = await idFromSeed(seed);
  const seedEnc = safe && safe.isEncryptionAvailable()
    ? safe.encryptString(seed).toString('base64')
    : Buffer.from(seed, 'utf8').toString('base64');
  return { id, seedEnc, external: false, plain: !(safe && safe.isEncryptionAvailable()) };
}

module.exports = { generateSeed, idFromSeed, verifyId, createWallet, revealSeed, importAddress, importSeed, ID_RE };
