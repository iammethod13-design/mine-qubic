'use strict';
/** Vérifications système légères : RAM, présence d'une carte NVIDIA, version CPU (fournie par le client). */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function hasNvidia() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const smi = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe');
      if (fs.existsSync(smi)) return resolve(true);
      // fallback : nvidia-smi dans le dossier du pilote
      const alt = 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe';
      return resolve(fs.existsSync(alt));
    }
    execFile('nvidia-smi', ['-L'], { timeout: 3000 }, (err, out) => resolve(!err && /GPU 0/.test(String(out))));
  });
}

async function collect() {
  const ramGb = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  return {
    ramGb,
    ramLow: ramGb < 8,
    cpuModel: (os.cpus()[0] || {}).model || '',
    cpuThreads: os.cpus().length,
    nvidia: await hasNvidia(),
    platform: process.platform,
  };
}

module.exports = { collect, hasNvidia };
