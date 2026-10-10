# Texte prêt à coller : soumission « faux positif » aux antivirus

Formulaire Microsoft : https://www.microsoft.com/wdsi/filesubmission → « Software developer » → joindre `PassiveMining-<version>-win-x64.exe` (signé de préférence).

---

**Product name:** Passive Mining
**Publisher:** Passive Mining
**Website:** https://github.com/iammethod13-design/mine-qubic
**Detection to review:** PUA:Win32/CoinMiner (or similar) on PassiveMining-x.y.z-win-x64.exe

**Description:**
Passive Mining is a free, open-source (MIT) desktop application that lets a user voluntarily contribute their own computer's CPU to the Qubic network through the public qubic.li mining pool, in exchange for QUBIC rewards paid by the pool directly to the user's own wallet.

Key facts relevant to the PUA assessment:
- Installed and started only by explicit user action (one-click installer, visible window, Start/Stop button). It never runs hidden, never installs silently with other software, and is never bundled.
- Mines only when the user clicks Start, and by default only while the PC is idle; it pauses when the user returns or when an application goes full screen.
- Full disclosure in the UI: terms of use shown before first start, fee percentage displayed, live CPU usage and speed displayed, uninstaller provided.
- Non-custodial: the user's keys stay on their device; the publisher has no access to funds.
- The mining engine is the official open-source qubic.li client (https://github.com/qubic-li/client), downloaded on demand from dl.qubic.li and verified by SHA-256 before execution. It is not embedded in the installer.
- No data collection beyond the user's public wallet address sent to the pool; anonymous statistics only with explicit opt-in.
- Source code, build pipeline (GitHub Actions) and privacy policy are public in the repository above.

We request reclassification as a legitimate, user-consented application.

**Contact:** [e-mail à compléter]
