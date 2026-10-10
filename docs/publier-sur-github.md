# Publier sur GitHub en 5 minutes (active les mises à jour automatiques et les builds signés)

Le dépôt local est déjà initialisé avec un premier commit. Il reste à le pousser.

1. Crée un dépôt **public** vide sur https://github.com/new, nommé `mine-qubic` (sans README).
2. Dans `src/config.js`, remplis `APP_UPDATE: { provider: 'github', owner: '<ton-compte>', repo: 'mine-qubic' }` et `REMOTE_MANIFEST_URL: 'https://raw.githubusercontent.com/<ton-compte>/mine-qubic/main/manifest.json'`.
   Dans `package.json` → `build.publish[0].owner`, et dans `site/index.html`, remplace `CHANGE_ME` / `__OWNER__` par ton compte.
3. Depuis le dossier du projet :
   ```
   git remote add origin https://github.com/<ton-compte>/mine-qubic.git
   git add -A && git commit -m "config: owner GitHub"
   git push -u origin main
   git tag v0.2.0 && git push origin v0.2.0
   ```
4. Le tag déclenche `.github/workflows/release.yml` : tests, build Windows (installateur NSIS + portable) et Linux (AppImage), puis publication sur **Releases**. Dix minutes plus tard, le lien « Télécharger pour Windows » du site fonctionne, et les apps installées se mettront à jour toutes seules aux prochains tags.
5. Signature (optionnel mais recommandé avant diffusion large) : voir `docs/signature-code.md`, puis ajouter les secrets dans Settings → Secrets and variables → Actions.
6. Site : active GitHub Pages (Settings → Pages → branche `main`, dossier `/site`) ou héberge `site/index.html` sur cointribune.com.

Pour chaque nouvelle version : `npm version minor` (ou patch), `git push && git push --tags`. Pour une nouvelle version du mineur qubic.li sans rebuild de l'app : `./scripts/update-manifest.sh 3.9.0` puis commit + push.
