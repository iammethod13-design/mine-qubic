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
| `CLIENT.win32.url / sha256` | Renseignés pour qli-Client 3.8.10. À mettre à jour à chaque release (hash : `certutil -hashfile x SHA256`). |
| `REMOTE_MANIFEST_URL` | URL d'un JSON que tu héberges, pour pousser une version du client sans rebuilder. |
| `APP_UPDATE` | `owner` + `repo` GitHub pour les mises à jour automatiques de l'app. |
| `EXCHANGES` | Tes liens d'affiliation pour « Vendre mes QUBIC ». |

## Builder

```
npm install
npm test                  # 33 tests
npm run build:win         # Windows : installateur NSIS un clic + portable (dist/)
```
Depuis Linux/macOS, seul le zip se construit (`npx electron-builder --win zip`) ; l'installateur demande Wine. Les traductions se régénèrent avec `python3 scripts/i18n_src.py`, l'icône avec `python3 scripts/make_icon.py`.

## État : ce qui est fait, ce qui manque

### Fait (dans ce dépôt)
- Onboarding 1 clic, wallet local chiffré, téléchargement vérifié du client, lancement/arrêt propre (arbre de processus), redémarrage auto en cas de plantage.
- Mode inactif, 3 niveaux de puissance, GPU optionnel avec détection NVIDIA, démarrage avec Windows, tray.
- Dev fee 3 % par tranches, persistant et affiché.
- Gains on-chain + € + notification de paiement.
- Mises à jour : client (AutoUpdate + manifest + rejet du pool) et app (electron-updater).
- Connexion wallet : QR, wallet.qubic.org, export seed, import adresse/seed.
- 15 langues, RTL pour l'arabe, détection de la langue de Windows.
- Vérifications système : version CPU (AVX512/AVX2/GENERIC via le client), RAM < 8 Go, carte NVIDIA.
- Logo et couleurs du brand kit Qubic.

### À faire pour une sortie publique
| # | Quoi | Effort | Pourquoi |
|---|---|---|---|
| 1 | **Tester sur ton PC l'authentification registerless au pool** (voir ci-dessous) | 10 min | Bloquant : si qubic.li n'accepte plus l'adresse seule, il faut un mode token. |
| 2 | **Vérifier le format des lignes de hashrate** du client et ajuster la regex (`src/client.js`, `_onLine`) | 30 min | La vitesse affichée en dépend. |
| 3 | **Certificat de signature de code** (OV ~300 €/an, EV ~500 €/an) + soumission Microsoft Defender | 1-2 jours de délais | Sans ça : SmartScreen bleu, antivirus qui bloquent, taux d'installation divisé par 3. |
| 4 | **Dépôt GitHub public + premier release** (active les mises à jour auto) | 1 h | |
| 5 | **Manifest distant** hébergé (`manifest.json` sur ton site) | 30 min | Pour pousser une version du client sans rebuild. |
| 6 | **Pause jeu plein écran** en mode « toujours » (détection de la fenêtre au premier plan via PowerShell/WinAPI) | 1 jour | Les gamers l'attendent. |
| 7 | **Estimation €/jour nette** (hashrate × part du pool × prix − kWh) | 1 jour | Demande d'accéder aux stats du pool par adresse (API qubic.li à négocier) ou d'estimer à partir du solde. |
| 8 | **Test de rentabilité réel** : une epoch complète sur 2-3 machines avec wattmètre | 1 semaine | Décide du positionnement (hiver / pays à électricité bon marché). |
| 9 | **CGU + politique de confidentialité + mention des runners téléchargés par le client** | 2 h + relecture juridique | |
| 10 | **Site de téléchargement** (landing + FAQ + page « pourquoi Windows affiche un avertissement ») | 1 jour | |
| 11 | **Télémétrie opt-in** (nombre d'installs, version, langue) | ½ jour | Pour piloter l'adoption. |
| 12 | **Parrainage** (code dans l'alias du worker, bonus) | 1-2 jours | Levier de croissance. |
| 13 | Linux (packaging seulement) et macOS (pas de client qubic.li macOS : à attendre) | ½ jour / — | |
| 14 | Relecture des 13 traductions non FR/EN par des natifs | 1 jour | Les textes sont corrects mais le ton mérite une relecture. |
| 15 | Accessibilité clavier/lecteur d'écran, et tests automatisés de l'UI | 1 jour | |

## À vérifier en premier sur ton PC

1. **Authentification au pool.** Depuis mon environnement, le client se connecte à `wss://wps.qubic.li` mais reçoit `AUTHENTICATION FAILED` (« no AuthenticateResponse ») — très probablement le proxy du bac à sable qui ne laisse pas passer les trames WebSocket. Ouvre le « Journal technique » : tu dois voir `Pool connection established` puis des lignes de hashrate. Si l'erreur apparaît aussi chez toi, qubic.li a durci le mode registerless ; on passera alors sur un mode « token » (compte qubic.li de l'opérateur + alias par utilisateur, mais ça devient custodial).
2. **Lignes de hashrate** : envoie-moi 20 lignes du journal, j'ajuste le parseur.
3. **Rentabilité** : une epoch complète (mercredi → mercredi), solde gagné vs conso mesurée.

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
test/run.js          ← 33 tests
```

## Notes légales (à faire valider)

- Non-custodial + frais sous forme de temps de calcul : pas de service sur crypto-actifs au sens MiCA, mais fais-le confirmer par ton conseil.
- Les gains de minage sont imposables (BNC en France) : l'app l'indique dans chaque langue.
- Le client qubic.li télécharge lui-même des « runners » : documenté par qubic.li, à mentionner dans tes CGU.
- Le logo Qubic vient du brand kit public (qubic.org/brand-kit) : vérifie les conditions d'usage pour une app tierce, ou obtiens un accord écrit de Qubic (tu as le contact).
