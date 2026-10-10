# Signature de code Windows et réputation SmartScreen

Sans signature, Windows affiche « Windows a protégé votre ordinateur » (SmartScreen) et certains antivirus mettent l'exe en quarantaine : c'est le premier frein à l'installation d'un mineur grand public. Trois options, de la moins chère à la plus solide.

## Option A : Azure Trusted Signing (recommandée, ~10 $/mois)

Service de Microsoft. Certificat à courte durée, réputation SmartScreen immédiate parce que l'émetteur est Microsoft lui-même. Validation d'identité « Individual » ou « Organization » (Cointribune / Frekaz). Prérequis : un abonnement Azure.

1. Portail Azure → créer une ressource **Trusted Signing** (région EU), puis une **Identity validation** (pièces justificatives, 1 à 5 jours) et un **Certificate profile** de type *Public Trust*.
2. Créer un *App registration* (service principal) avec le rôle **Trusted Signing Certificate Profile Signer** sur la ressource.
3. Dans `package.json` → `build.win`, ajouter :
   ```json
   "azureSignOptions": {
     "endpoint": "https://weu.codesigning.azure.net",
     "codeSigningAccountName": "<nom du compte>",
     "certificateProfileName": "<nom du profil>"
   }
   ```
   et passer electron-builder en v26 (`npm i -D electron-builder@^26`).
4. Secrets GitHub : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. electron-builder les lit automatiquement sur le runner Windows.

## Option B : certificat OV classique (~250-400 €/an)

Sectigo, DigiCert, GlobalSign, Certum… Depuis juin 2023 la clé privée doit être sur un jeton matériel (HSM/USB) ou dans un KMS cloud : plus de simple `.pfx`. Sur GitHub Actions il faut donc un fournisseur « cloud signing » (SSL.com eSigner, DigiCert KeyLocker) : variables `CSC_LINK`/`CSC_KEY_PASSWORD` ne suffisent plus pour un vrai OV. La réputation SmartScreen se construit avec le volume de téléchargements (quelques semaines).

## Option C : certificat EV (~500-700 €/an)

Réputation SmartScreen immédiate, mais mêmes contraintes matérielles que l'OV. Intéressant seulement si tu refuses Azure.

## Dans tous les cas

- **Soumettre le binaire à Microsoft Defender** après chaque release : https://www.microsoft.com/wdsi/filesubmission (« Software developer », faux positif). Les mineurs sont souvent classés *PUA:Win32/CoinMiner* : la soumission avec explication (logiciel opt-in, non-custodial, client open source qubic.li) lève le drapeau en 24-72 h.
- Idem pour les autres antivirus utilisés en France : Avast/AVG (https://www.avast.com/false-positive-file-form.php), Bitdefender, Kaspersky, ESET, Malwarebytes.
- Ne jamais empaqueter le `qli-Client.exe` dans l'installateur : l'app le télécharge à la demande (hash vérifié), ce qui évite que l'installateur lui-même soit flaggé.
- La page « Pourquoi Windows affiche un avertissement » du site (`site/index.html`, section FAQ) explique à l'utilisateur comment passer SmartScreen en attendant la réputation.
