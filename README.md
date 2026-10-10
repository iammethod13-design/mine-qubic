# Mine Qubic — « je clique et ça mine »

Application Windows (Electron) qui fait miner du QUBIC à un PC ordinaire sur le pool **qubic.li**, sans compte, sans configuration. Non-custodial : chaque utilisateur a son propre wallet Qubic, créé dans l'app, et le pool le paie directement chaque semaine. Interface en **15 langues** (FR, EN, ES, PT-BR, DE, IT, RU, ZH, JA, KO, TR, ID, VI, AR, HI), marque Qubic officielle (brand kit).

```
Utilisateur ──clic──▶ Mine Qubic ──lance──▶ qli-Client (officiel) ──▶ pool qubic.li ──paie──▶ wallet de l'utilisateur
                                                                                    └──paie──▶ ton wallet (3 % du temps)
```

## Comment ça marche

1. **Premier lancement** : un écran, un bouton « Démarrer ». L'app génère un wallet Qubic (seed de 55 lettres, chiffrée avec Windows DPAPI via Electron `safeStorage`, dérivation d'ID avec la lib officielle `@qubic-lib/qubic-ts-library`), télécharge le client officiel `qli-Client` depuis `dl.qubic.li`, **vérifie son SHA-256** contre le hash épinglé dans `src/config.js`, puis le lance avec :
   ```
   qli-Client.exe --ClientSettings:QubicAddress=<ID utilisateur> --ClientSettings:Alias=MQ-xxxxxx
                  --ClientSettings:Trainer:CpuThreads=<n> --ClientSettings:Trainer:Gpu=false --ClientSettings:AutoUpdate=true
   ```
   C'est le mode « registerless » documenté par qubic.li : l'adresse Qubic sert d'identifiant, l'utilisateur voit ses stats sur pool.qubic.li en se connectant avec son adresse.
2. **Mode inactif (par défaut)** : ne mine que si le PC est inactif depuis 3 min (réglable) et coupe dans les 5 s dès que l'utilisateur touche au clavier ou à la souris. Mode « toujours » disponible, avec 3 niveaux de puissance (25 / 50 / 100 % des cœurs). GPU NVIDIA en option (désactivé si aucune carte détectée).
3. **Gains** : solde on-chain du wallet (`rpc.qubic.org`), valeur en € (CoinGecko), date du prochain paiement du pool (mercredi 12:00 UTC), notification Windows « Paiement reçu » quand le solde augmente.
4. **Frais de l'app (ton revenu)** : modèle « dev fee » comme XMRig / T-Rex. Après 161,7 min de minage utilisateur, le client est relancé **5 min sur ton adresse**, puis revient à l'utilisateur. 5 / (161,7 + 5) = **3 %**. Compteur persistant, pourcentage affiché à l'utilisateur. Aucun fonds ne transite par toi : pas de backend, rien de custodial.
5. **Wallet** : bouton « Connecter mon wallet » → QR code de l'adresse (lecture seule dans Qubic Wallet mobile), lien wallet.qubic.org, export de la phrase secrète (c'est le même wallet dans l'app officielle), ou import d'une adresse externe / d'une seed existante.

## Que se passe-t-il quand le pool ou le mineur change ?

Trois mécanismes, du plus automatique au plus manuel :

| Cas | Ce qui se passe |
|---|---|
| **Nouvelle epoch / nouvel algo (hebdo)** | Le client qubic.li télécharge lui-même ses « runners » (trainers IA) : rien à faire. |
| **Nouvelle version du client** | `AutoUpdate=true` : le client se met à jour seul. En plus, l'app relit toutes les 6 h le manifest distant (`REMOTE_MANIFEST_URL`, JSON `{version, win32:{url,sha256}}` que tu héberges) ; si la version change, elle arrête, supprime l'ancien client, re-télécharge la nouvelle (hash vérifié) et relance. |
| **Le pool rejette la version** (« outdated / update required » dans les logs) | L'app passe en « Mise à jour du mineur… », force le manifest puis une réinstallation (2 tentatives max), sinon affiche l'erreur `client_outdated`. |
| **Nouvelle version de l'app** | `electron-updater` + GitHub Releases : renseigne `APP_UPDATE.owner/repo` dans `config.js` et `build.publish` dans `package.json`, publie avec `npx electron-builder --win --publish always`. L'app vérifie 30 s après le lancement puis toutes les 6 h, télécharge en arrière-plan et propose « Redémarrer pour installer ». |
| **Changement d'adresse du pool** | `POOL_WS` dans `config.js` (et dans le manifest distant si tu veux le changer sans rebuild). |

## À remplir avant de builder (`src/config.js`)

| Clé | Quoi |
|---|---|
| `OPERATOR_ADDRESS` | Ton adresse Qubic (60 lettres). Vide = aucun frais. |
| `DEV_FEE_PERCENT` / `DEV_FEE_SLICE_MINUTES` | 3 % et 5 min par défaut. |
| `CLIENT.win32.url / sha256` | Renseignés pour qli-Client 3.9.1. À mettre à jour à chaque release (hash : `certutil -hashfile x SHA256`). |
| `REMOTE_MANIFEST_URL` | URL d'un JSON que tu héberges, pour pousser une version du client sans rebuilder. |
| `APP_UPDATE` | `owner` + `repo` GitHub pour les mises à jour automatiques de l'app. |
| `EXCHANGES` | Tes liens d'affiliation pour « Vendre mes QUBIC ». |

## Builder

```
npm install
npm run test:all          # 41 tests unitaires + 17 tests UI (Linux : xvfb-run -a npm run test:ui)
npm run build:win         # Windows : installateur NSIS un clic + portable (dist/)
npm run build:linux       # AppImage
```
Depuis Linux/macOS, seul le zip se construit (`npx electron-builder --win zip`) ; l'installateur demande Wine. Les traductions se régénèrent avec `python3 scripts/i18n_src.py`, l'icône avec `python3 scripts/make_icon.py`.

## État (v0.2.0)

### Fait
- Onboarding 1 clic, wallet local chiffré, téléchargement vérifié du client, lancement/arrêt propre, redémarrage auto.
- Mode inactif, 3 niveaux de puissance, GPU optionnel (détection NVIDIA), **pause automatique quand un jeu ou une vidéo est en plein écran** (Windows), démarrage avec Windows, tray traduit.
- Dev fee 3 % par tranches, persistant et affiché. **Parrainage non-custodial** : le code de parrainage est l'adresse Qubic ; 20 % des frais (1 min sur 5) sont minés pour le parrain, payés par le pool. Aucun backend.
- Gains on-chain + € + notification de paiement + **estimation €/jour nette** (dernier(s) paiement(s) du pool ÷ 7 − électricité, avec prix du kWh et watts réglables).
- Mises à jour : client (AutoUpdate + manifest distant + rejet du pool) et app (electron-updater + GitHub Releases, workflow fourni).
- Connexion wallet : QR, wallet.qubic.org, export seed, import adresse/seed.
- 15 langues, RTL, détection de la langue de Windows. CGU + confidentialité affichées au premier lancement et dans l'app.
- Télémétrie **opt-in** anonyme (désactivée par défaut, URL à renseigner).
- Accessibilité : focus visible, aria, Échap ferme les fenêtres, réduction des animations. **41 tests unitaires + 17 tests UI** (`npm run test:all`).
- Logo et couleurs du brand kit Qubic. Landing page FR/EN (`site/`). Docs : CGU, confidentialité, protocole de test de rentabilité, guide de signature.

### Reste à faire (et par qui)
| # | Quoi | Qui | Doc |
|---|---|---|---|
| 2 | Créer le dépôt GitHub, remplir `owner`, pousser, taguer `v0.2.0` | toi, 5 min | `docs/publier-sur-github.md` |
| 3 | Certificat de signature (Azure Trusted Signing ~10 $/mois) + soumission Defender | toi, 1-5 jours de délai | `docs/signature-code.md` |
| 4 | Faire relire CGU/confidentialité par un juriste, remplir l'entité et l'e-mail de contact | toi | `docs/cgu.md`, `docs/confidentialite.md` |
| 5 | Test de rentabilité sur une epoch (wattmètre) | toi, 1 semaine | `docs/test-rentabilite.md` |
| 6 | Endpoint de télémétrie (optionnel : un simple webhook/Google Sheet) → `TELEMETRY_URL` | toi, 30 min | |
| 7 | Relecture des 13 traductions non FR/EN par des natifs (le ton, pas le sens) | ton réseau Cointribune | `scripts/i18n_src.py` |
| 8 | Accord écrit de Qubic pour l'usage du logo dans une app tierce | toi | |
| 9 | macOS : pas de client qubic.li macOS, à attendre | — | |

## Validé sur ton PC (10 oct. 2026)

- Le client **3.8.10** était refusé par le pool (`AUTHENTICATION FAILED`) : version trop ancienne. Avec **3.9.1**, le mode sans compte fonctionne : connexion, authentification, téléchargement du trainer, minage (≈ 10 it/s par thread AVX-512 sur la machine de test). L'app épingle désormais 3.9.1, et traite un refus d'authentification comme un signal de mise à jour du mineur.
- Format des lignes de vitesse (3.9.x) : `E:234 | SHARES: 3/5 (R:0) | [AVX512] 22 it/s | 21 avg it/s` — parsé (CPU + GPU additionnés, epoch, shares).
- Ta machine de test : Ryzen 7 7435HS (AVX2 seulement, pas d'AVX-512), 16 Go, RTX 3050 Laptop. Les Ryzen 7000 "HS" (Zen 3+) n'ont pas l'AVX-512 : attends-toi à une vitesse nettement inférieure à un Ryzen 7000 de bureau.

## Structure

```
src/config.js        ← réglages opérateur (adresse, frais, hash du client, updates)
src/main.js          ← process principal Electron : fenêtre, tray (traduit), IPC, notifications
src/client.js        ← téléchargement + SHA-256 + extraction + spawn/kill + parsing des logs + updates
src/scheduler.js     ← mode inactif, intensité, dev fee par tranches, redémarrage auto, mise à jour du mineur
src/wallet.js        ← seed → ID Qubic, chiffrement safeStorage, import/export
src/chain.js         ← solde on-chain, prix, prochaine epoch
src/sysinfo.js       ← RAM, NVIDIA, modèle CPU
src/updater.js       ← electron-updater (mises à jour de l'app)
src/store.js         ← settings.json (dans %APPDATA%\Mine Qubic)
src/renderer/        ← UI (HTML/CSS/JS), i18n.js généré (15 langues)
scripts/i18n_src.py  ← source des traductions ; scripts/make_icon.py ← icône depuis la marque Qubic
test/run.js          ← 41 tests unitaires ; test/ui.js ← 17 tests UI (app réelle + mineur simulé)
src/fullscreen.js    ← détection plein écran (PowerShell/WinAPI) ; src/telemetry.js ← stats opt-in
site/index.html      ← landing page FR/EN ; docs/ ← CGU, confidentialité, signature, rentabilité, GitHub
.github/workflows/   ← release.yml : tests + build Windows/Linux + publication
```

## Notes légales (à faire valider)

- Non-custodial + frais sous forme de temps de calcul : pas de service sur crypto-actifs au sens MiCA, mais fais-le confirmer par ton conseil.
- Les gains de minage sont imposables (BNC en France) : l'app l'indique dans chaque langue.
- Le client qubic.li télécharge lui-même des « runners » : documenté par qubic.li, à mentionner dans tes CGU.
- Le logo Qubic vient du brand kit public (qubic.org/brand-kit) : vérifie les conditions d'usage pour une app tierce, ou obtiens un accord écrit de Qubic (tu as le contact).
