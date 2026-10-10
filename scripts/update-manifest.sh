#!/usr/bin/env bash
# Met à jour manifest.json et src/config.js pour une nouvelle version du client qubic.li.
#   ./scripts/update-manifest.sh 3.9.0
set -euo pipefail
V="${1:?version, ex. 3.9.0}"
W="https://dl.qubic.li/downloads/qli-Client-$V-Windows-x64.zip"
L="https://dl.qubic.li/downloads/qli-Client-$V-Linux-x64.tar.gz"
tmp=$(mktemp -d)
curl -sSL "$W" -o "$tmp/w.zip"; curl -sSL "$L" -o "$tmp/l.tgz"
WS=$(sha256sum "$tmp/w.zip" | cut -d' ' -f1); LS=$(sha256sum "$tmp/l.tgz" | cut -d' ' -f1)
node -e "
const fs=require('fs'); const m=JSON.parse(fs.readFileSync('manifest.json'));
m.version='$V'; m.win32.url='$W'; m.win32.sha256='$WS'; m.linux.url='$L'; m.linux.sha256='$LS';
fs.writeFileSync('manifest.json', JSON.stringify(m,null,2)+'\n');
let c=fs.readFileSync('src/config.js','utf8');
c=c.replace(/version: '[^']+'/, \"version: '$V'\").replace(/qli-Client-[0-9.]+-Windows-x64\.zip',\n(\s*)sha256: '[0-9a-f]+'/, \"qli-Client-$V-Windows-x64.zip',\n\$1sha256: '$WS'\").replace(/qli-Client-[0-9.]+-Linux-x64\.tar\.gz',\n(\s*)sha256: '[0-9a-f]+'/, \"qli-Client-$V-Linux-x64.tar.gz',\n\$1sha256: '$LS'\");
fs.writeFileSync('src/config.js', c);"
echo "manifest.json + src/config.js → $V (win $WS, linux $LS). Commit + push sur main : les apps installées se mettront à jour sous 6 h."
