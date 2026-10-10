# Protocole de test de rentabilité (une epoch complète)

Objectif : savoir, chiffres mesurés à l'appui, ce qu'un PC ordinaire gagne net par jour. C'est ce chiffre qui décide du positionnement (hiver / pays à électricité bon marché / gamers) et du message marketing.

## Matériel

- 2 à 3 machines représentatives : un Ryzen 7 (7700X ou 9700X), un Ryzen 9 (7950X), un Intel grand public (i5/i7 13-14e gen) avec une RTX 30/40.
- Un **wattmètre à la prise** par machine (Tapo P110, Shelly Plug S, Brennenstuhl PM 231 : 10-25 €). Pas d'estimation logicielle.
- Prix du kWh de ton contrat (TTC, heures pleines) : saisi dans l'app (carte « Estimation »).

## Déroulé

1. **Mercredi 14:00 UTC** (juste après le début de l'epoch) : noter le solde de chaque wallet (0 si nouveau), relever le wattmètre à 0 (ou noter le compteur), lancer Passive Mining en **mode « toujours », puissance Max**, et laisser tourner 7 jours sans interruption. Noter le modèle de CPU, la version du mineur et la ligne `CPU: Enabled with AVX512/AVX2` du journal technique.
2. **Chaque jour** : relever la vitesse affichée (it/s) et la température CPU (HWiNFO ou le BIOS). Si la machine throttle, noter l'heure.
3. **Mercredi suivant, après 13:00 UTC** (le pool paie dans les 24 h après la fin de l'epoch, en pratique le mercredi midi-soir) : attendre la notification « Paiement reçu », noter le solde et les kWh consommés.
4. Recommencer une 2e epoch en **mode inactif** sur une machine utilisée normalement, pour mesurer le gain réel d'un usage « bureau ».

## Calcul

| Donnée | Formule |
|---|---|
| QUBIC gagnés | solde final − solde initial |
| Brut (€) | QUBIC × cours moyen de la semaine (CoinGecko) |
| Électricité (€) | kWh mesurés × prix du kWh |
| **Net (€/jour)** | (brut − électricité) / 7 |
| Net « hiver » | brut / 7 (chauffage électrique : la chaleur du PC remplace celle du radiateur) |

Reporter les résultats dans la feuille `docs/rentabilite-template.csv`.

## Seuils de décision

- Net > 0,30 €/jour sur un Ryzen 7 : positionnement grand public France possible.
- Net entre 0 et 0,30 € : positionnement « hiver » + pays à kWh < 0,10 € (Québec, Paraguay, Kazakhstan, Argentine, Indonésie…) : les 15 langues de l'app servent là.
- Net < 0 hors hiver : ne pas lancer en France ; cibler les pays à électricité bon marché ou pivoter sur l'idée n°1 (gagner des QUBIC via sondages/pubs).
