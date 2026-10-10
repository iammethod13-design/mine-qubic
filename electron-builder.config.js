// Configuration electron-builder. La signature Windows (Azure Trusted Signing) ne s'active
// que si les variables AZURE_* sont présentes (secrets GitHub) : sans elles, build non signé.
const build = {
  "appId": "com.cointribune.minequbic",
  "productName": "Mine Qubic",
  "artifactName": "MineQubic-${version}-${os}-${arch}.${ext}",
  "directories": {
    "output": "dist"
  },
  "files": [
    "src/**/*",
    "assets/**/*",
    "test/mock-client.js",
    "package.json"
  ],
  "asar": true,
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": [
          "x64"
        ]
      },
      {
        "target": "portable",
        "arch": [
          "x64"
        ]
      }
    ],
    "icon": "assets/icon.png",
    "signAndEditExecutable": false
  },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "allowToChangeInstallationDirectory": false,
    "deleteAppDataOnUninstall": false,
    "shortcutName": "Mine Qubic"
  },
  "portable": {
    "artifactName": "MineQubic-${version}-portable.exe"
  },
  "linux": {
    "target": [
      "AppImage"
    ],
    "category": "Utility",
    "icon": "assets/icon.png",
    "artifactName": "MineQubic-${version}-linux-${arch}.${ext}"
  },
  "publish": [
    {
      "provider": "github",
      "owner": "iammethod13-design",
      "repo": "mine-qubic"
    }
  ]
};

if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CODESIGNING_ACCOUNT && process.env.AZURE_CERT_PROFILE) {
  build.win.azureSignOptions = {
    publisherName: process.env.AZURE_PUBLISHER_NAME || 'Cointribune',
    endpoint: process.env.AZURE_CODESIGNING_ENDPOINT || 'https://weu.codesigning.azure.net',
    codeSigningAccountName: process.env.AZURE_CODESIGNING_ACCOUNT,
    certificateProfileName: process.env.AZURE_CERT_PROFILE,
  };
  build.win.signAndEditExecutable = true;
}

module.exports = build;
