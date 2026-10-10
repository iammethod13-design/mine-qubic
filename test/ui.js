'use strict';
/**
 * Test UI de bout en bout : lance la vraie app Electron avec `--mock-miner` (client simulé),
 * un dossier de données temporaire, et pilote l'interface via executeJavaScript.
 *   npm run test:ui            (Linux : xvfb-run -a npm run test:ui)
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const electron = require('electron');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-ui-'));
const script = path.join(__dirname, 'ui-driver.js');
const child = spawn(electron, [script, '--no-sandbox', `--user-data=${userData}`], { stdio: 'inherit', env: { ...process.env, MQ_UI_TEST: '1' } });
child.on('exit', (code) => { fs.rmSync(userData, { recursive: true, force: true }); process.exit(code); });
