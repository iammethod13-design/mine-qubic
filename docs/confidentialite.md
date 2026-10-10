# Politique de confidentialité — Passive Mining

*Version 1.0, octobre 2026. À faire relire par un conseil juridique (RGPD).*

## Ce que l'Application ne fait pas

- Pas de compte, pas d'e-mail, pas de mot de passe, pas d'inscription.
- Pas de collecte de données personnelles par l'Éditeur, pas de cookies, pas de publicité, pas de revente de données.
- La phrase secrète (seed) est générée sur votre ordinateur, chiffrée par Windows (DPAPI) et n'en sort jamais.

## Données traitées, et par qui

| Donnée | Destinataire | Finalité | Base |
|---|---|---|---|
| Adresse Qubic publique + nom de worker (ex. `MQ-7f3a1c`) | Pool qubic.li (tiers, responsable de son propre traitement) | Attribuer et verser vos récompenses de minage | Exécution du service demandé |
| Adresse IP | Pool qubic.li, serveur de téléchargement `dl.qubic.li`, `rpc.qubic.org` (solde), CoinGecko (prix) | Connexion technique | Intérêt légitime (fonctionnement) |
| Réglages (langue, puissance, prix du kWh, code parrain) | Votre ordinateur uniquement (`%APPDATA%\Passive Mining\settings.json`) | Mémoriser vos préférences | — |
| Statistiques anonymes : version de l'app, langue, système, type de CPU (AVX2/AVX512), nombre de cœurs, GPU oui/non, ancienneté de l'installation | Éditeur, **seulement si vous activez l'option** « Envoyer des statistiques anonymes » | Savoir sur quelles machines l'app fonctionne | Consentement (révocable dans les réglages) |

Aucune de ces statistiques ne contient votre adresse Qubic, vos gains, votre nom de worker ni un identifiant unique.

## Durée de conservation

Les réglages restent sur votre ordinateur jusqu'à désinstallation (le dossier `%APPDATA%\Passive Mining` peut être supprimé à tout moment ; attention, il contient la seed chiffrée : sauvegardez votre phrase secrète avant). Les statistiques anonymes, si activées, sont conservées 24 mois sous forme agrégée.

## Vos droits

Comme l'Éditeur ne détient aucune donnée vous identifiant, les droits d'accès, de rectification et d'effacement s'exercent principalement auprès du pool qubic.li pour ce qui concerne votre adresse. Pour toute question : **[adresse e-mail de contact à préciser]**.

## Mineurs

L'Application est réservée aux personnes majeures.

---

# Privacy Policy — Passive Mining (English)

- **No account, no email, no password, no personal data collected by the Publisher, no cookies, no ads, no data resale.** Your seed is generated on your computer, encrypted by Windows (DPAPI) and never leaves it.
- **Data processed:** your public Qubic address and worker name go to the qubic.li pool (an independent controller) to pay your rewards; your IP address is seen by the pool, the download server, `rpc.qubic.org` and CoinGecko for technical connections; your settings stay on your computer; **anonymous statistics** (app version, language, OS, CPU type, core count, GPU yes/no, install age) are sent to the Publisher **only if you turn the option on**, and never include your address, earnings, worker name or any unique identifier.
- **Retention:** settings until you delete `%APPDATA%\Passive Mining` (back up your seed first); anonymous statistics 24 months, aggregated.
- **Rights:** contact **[email TBD]**; address-related rights are exercised with the pool.
- Adults only.
