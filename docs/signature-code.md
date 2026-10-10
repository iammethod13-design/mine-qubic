# Signature de code Windows : quoi, pourquoi, et ce qui est déjà prêt

## Est-ce obligatoire ?

Pour que l'app fonctionne : non. Pour qu'elle soit installée par des gens qui ne te connaissent pas : en pratique oui. Sans signature, Windows affiche l'écran bleu SmartScreen (« Windows a protégé votre ordinateur ») à **100 % des utilisateurs**, et Defender ou un antivirus tiers peut mettre l'exe en quarantaine. Les retours d'expérience des éditeurs de logiciels grand public convergent : sans signature, une bonne moitié des gens s'arrête là.

Ce que je ne peux pas faire : obtenir le certificat. Il faut une identité vérifiée (pièce d'identité pour un particulier, Kbis pour Cointribune) et un paiement. Tout le reste est préparé : dès que tu as les identifiants, la signature est automatique à chaque release.

## Le Microsoft Store n'est pas une option

Politique du Store, clause **10.2.6** : « Apps that enable the mining of crypto-currency on device are not allowed ». Les wallets et le pilotage à distance de mineurs sont acceptés, pas le minage sur l'appareil. Inutile d'y passer du temps.

## Option 1 (gratuite) : SignPath Foundation

Signature gratuite pour les projets open source. Mine Qubic remplit les critères vérifiables : licence MIT, dépôt public, builds automatisés depuis le dépôt (GitHub Actions), fonctionnalité décrite sur la page de téléchargement, désinstallation fournie. Un point d'incertitude : leurs conditions excluent les « programmes potentiellement indésirables », catégorie où certains antivirus rangent les mineurs. La réponse dépendra de leur lecture. Ça coûte 10 minutes d'essayer.

Ce qu'ils demandent, déjà en place dans le dépôt :
- une page « Code signing policy » (`docs/code-signing-policy.md`, et le paragraphe sur la landing page) ;
- des rôles d'équipe (auteur, relecteur, approbateur) ; pour un projet à une personne, tu tiens les trois ;
- l'authentification à deux facteurs sur ton compte GitHub (Settings → Password and authentication) et sur SignPath ;
- une politique de confidentialité (`docs/confidentialite.md`) et la mention des transferts de données (adresse → pool), affichée au premier lancement.

À faire : https://signpath.org → « Apply for OSS signing » → formulaire (nom du projet, dépôt, licence, description). Si accepté, ils fournissent une organisation SignPath et un token : je brancherai leur action GitHub dans le workflow (signature après build, puis régénération de `latest.yml` pour que les mises à jour automatiques vérifient le bon hash).

## Option 2 (≈ 10 $/mois) : Azure Trusted Signing

Service de Microsoft, réputation SmartScreen immédiate (l'émetteur est Microsoft). Validation « Individual » (pièce d'identité) ou « Organization » (Cointribune). Prérequis : un abonnement Azure (carte bancaire).

1. Portail Azure → créer une ressource **Trusted Signing** (région *West Europe*), puis **Identity validation** (1 à 5 jours) et un **Certificate profile** de type *Public Trust*.
2. Microsoft Entra → *App registration* (service principal) + un secret client ; sur la ressource Trusted Signing, rôle **Trusted Signing Certificate Profile Signer** pour ce service principal.
3. Dans le dépôt GitHub → Settings → Secrets and variables → Actions, ajouter :

| Secret | Valeur |
|---|---|
| `AZURE_TENANT_ID` | ID du tenant Entra |
| `AZURE_CLIENT_ID` | ID de l'app registration |
| `AZURE_CLIENT_SECRET` | son secret |
| `AZURE_CODESIGNING_ACCOUNT` | nom du compte Trusted Signing |
| `AZURE_CERT_PROFILE` | nom du profil de certificat |
| `AZURE_PUBLISHER_NAME` | le CN exact du certificat (ex. `Cointribune`) |
| `AZURE_CODESIGNING_ENDPOINT` | `https://weu.codesigning.azure.net` |

4. C'est tout : `electron-builder.config.js` active la signature quand ces secrets existent, et le prochain build GitHub produit un installateur signé. Rien à changer dans le code.

## Option 3 : certificat OV/EV classique (250-700 €/an)

Sectigo, DigiCert, GlobalSign… Depuis 2023 la clé doit être sur un jeton matériel ou un KMS cloud : plus compliqué à brancher en CI que les deux options ci-dessus. À ne considérer que si Azure est refusé.

## Après la signature : lever les faux positifs antivirus

Même signé, un mineur peut être classé *PUA* (programme potentiellement indésirable). Après chaque release, soumettre l'installateur signé en « faux positif / éditeur de logiciel » ; texte prêt à coller dans `docs/defender-submission.md`.

- Microsoft Defender : https://www.microsoft.com/wdsi/filesubmission (24-72 h)
- Avast / AVG : https://www.avast.com/false-positive-file-form.php
- Bitdefender : https://www.bitdefender.com/consumer/support/answer/29358/
- Kaspersky : https://opentip.kaspersky.com/
- ESET : samples@eset.com
- Malwarebytes : https://forums.malwarebytes.com/forum/42-false-positives/

## En attendant la signature

- `winget install Cointribune.MineQubic` : les manifests sont prêts dans `winget/`. Une fois le PR accepté sur microsoft/winget-pkgs, cette commande installe sans passer par SmartScreen. Soumission : fork de https://github.com/microsoft/winget-pkgs, copier les 3 fichiers dans `manifests/c/Cointribune/MineQubic/0.2.3/`, ouvrir un pull request (validation automatique, 1 à 3 jours).
- La FAQ de la landing page explique en deux clics comment passer l'écran SmartScreen.
- Le mineur qubic.li n'est pas dans l'installateur (téléchargé à la demande, hash vérifié) : l'installateur lui-même a peu de raisons d'être flaggé.
