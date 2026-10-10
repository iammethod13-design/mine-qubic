'use strict';
/**
 * Configuration OPÉRATEUR — c'est le seul fichier à remplir avant de builder l'app.
 *
 * Modèle économique : "dev fee" non-custodial, comme XMRig / T-Rex / lolMiner.
 * L'app mine pour l'utilisateur, et une petite fraction du temps pour l'adresse
 * de l'opérateur. Le pool paie chacun directement : aucun fonds ne transite par toi,
 * aucun backend de paiement à maintenir, rien de custodial.
 */
module.exports = {
  // Adresse Qubic (60 lettres majuscules) qui reçoit les frais de l'app.
  // Laisse vide pour désactiver complètement les frais.
  OPERATOR_ADDRESS: 'SBZRXJGRXJXXBGFWPEBRVEFAPWDBUGNUEBDNLLKCIGERNGUFMNVWRSNGKSIB',

  // Pourcentage de temps de minage reversé à l'opérateur (3 = 3 %).
  DEV_FEE_PERCENT: 3,

  // Durée d'une tranche "opérateur", en minutes. L'app accumule le temps de
  // minage utilisateur et, tous les (slice * (100 - pct) / pct) minutes, mine
  // `slice` minutes pour l'opérateur. Avec 3 % et 5 min : 5 min toutes les 161,7 min.
  DEV_FEE_SLICE_MINUTES: 5,

  // Parrainage non-custodial : part de la tranche opérateur reversée au parrain
  // (0.2 = 20 % des frais, soit 1 min sur 5). Le pool paie le parrain directement.
  REFERRAL_SHARE: 0.2,

  // Télémétrie opt-in (désactivée par défaut côté utilisateur). Vide = jamais envoyée.
  // Reçoit un POST JSON {v, lang, os, cpu, threads, gpu, days} une fois par jour, sans identifiant.
  TELEMETRY_URL: '',

  // Client de minage officiel qubic.li (https://github.com/qubic-li/client).
  // Les hashes SHA-256 sont vérifiés avant extraction : si qubic.li publie une
  // nouvelle version, mets à jour url + sha256 ici (ou via REMOTE_MANIFEST_URL).
  CLIENT: {
    version: '3.9.1',
    win32: {
      url: 'https://dl.qubic.li/downloads/qli-Client-3.9.1-Windows-x64.zip',
      sha256: '0c6cc3ec5ecb2cffb910f3fe61f4031da09d89676ef6bdd2caa0da61d49ab09a',
      exe: 'qli-Client.exe',
    },
    linux: {
      url: 'https://dl.qubic.li/downloads/qli-Client-3.9.1-Linux-x64.tar.gz',
      sha256: '127101cdf726cc0116bb981c78260b8583b377fec0ded54acafebd6174f1c340',
      exe: 'qli-Client',
    },
  },

  // Laisser le client qubic.li se mettre à jour lui-même (recommandé : les clients
  // obsolètes sont rejetés par le pool à chaque changement d'algorithme).
  CLIENT_AUTO_UPDATE: true,

  // Vérification du manifest distant pendant le minage (heures). 0 = jamais.
  CLIENT_UPDATE_CHECK_HOURS: 6,

  // Mise à jour automatique de l'app elle-même via electron-updater + GitHub Releases.
  // Remplis owner/repo (dépôt public avec les releases) pour l'activer.
  APP_UPDATE: { provider: 'github', owner: 'iammethod13-design', repo: 'mine-qubic' },

  // Optionnel : URL d'un manifest JSON {version, win32:{url,sha256}, linux:{...}}
  // hébergé par toi, pour pousser une mise à jour du client sans rebuilder l'app.
  // Laisse vide pour utiliser uniquement CLIENT ci-dessus.
  REMOTE_MANIFEST_URL: 'https://raw.githubusercontent.com/iammethod13-design/mine-qubic/main/manifest.json',

  // Pool
  POOL_WS: 'wss://wps.qubic.li/ws',
  // pool.qubic.li est déprécié (bandeau sur le site) → platform.qubic.li. Page publique par adresse :
  // POOL_PUBLIC_PAGE + <adresse>. Stats JSON indépendantes du client : POOL_STATS_API/api/pool/address/<adresse>
  POOL_DASHBOARD: 'https://platform.qubic.li',
  POOL_PUBLIC_PAGE: 'https://platform.qubic.li/public/id/',
  POOL_STATS_API: 'https://stats.service.qubic.li',
  WALLET_URL: 'https://wallet.qubic.org',

  // Données on-chain et prix
  RPC_BASE: 'https://rpc.qubic.org',
  PRICE_URL: 'https://api.coingecko.com/api/v3/simple/price?ids=qubic-network&vs_currencies=eur,usd',

  // Liens "Vendre mes QUBIC" (mets tes liens d'affiliation)
  EXCHANGES: [
    { name: 'MEXC', url: 'https://www.mexc.com/exchange/QUBIC_USDT' },
    { name: 'Bitget', url: 'https://www.bitget.com/spot/QUBICUSDT' },
    { name: 'Gate', url: 'https://www.gate.io/trade/QUBIC_USDT' },
  ],

  // Préfixe du nom de worker visible sur pool.qubic.li
  ALIAS_PREFIX: 'PM',

  // Mode "seulement quand le PC est inactif" : délai avant de démarrer (minutes)
  IDLE_MINUTES_DEFAULT: 3,
};
