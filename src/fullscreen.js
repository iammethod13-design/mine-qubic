'use strict';
/**
 * Détection "une application est en plein écran" (jeu, vidéo) pour mettre le minage en pause
 * même en mode « toujours ». Windows uniquement : on compare le rectangle de la fenêtre au
 * premier plan à celui de l'écran, en ignorant le bureau/la barre des tâches.
 * Un seul process PowerShell persistant, interrogé toutes les 10 s ; en cas d'échec on renvoie false.
 */
const { spawn } = require('child_process');

const PS_SCRIPT = `
$code = @"
using System; using System.Runtime.InteropServices; using System.Text;
public class FS {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cb; public RECT rcMonitor; public RECT rcWork; public uint flags; }
  public static string Check() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || h == GetDesktopWindow() || h == GetShellWindow()) return "0";
    StringBuilder sb = new StringBuilder(256); GetClassName(h, sb, 256); string cls = sb.ToString();
    if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Windows.UI.Core.CoreWindow") return "0";
    RECT r; if (!GetWindowRect(h, out r)) return "0";
    IntPtr m = MonitorFromWindow(h, 2); MONITORINFO mi = new MONITORINFO(); mi.cb = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(m, ref mi)) return "0";
    bool full = r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
    return full ? "1" : "0";
  }
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
while ($true) { $line = [Console]::In.ReadLine(); if ($line -eq $null) { break }; try { [Console]::Out.WriteLine([FS]::Check()) } catch { [Console]::Out.WriteLine("0") }; [Console]::Out.Flush() }
`;

class FullscreenWatcher {
  constructor() { this.proc = null; this.pending = []; this.last = false; this.supported = process.platform === 'win32'; }

  _ensure() {
    if (this.proc || !this.supported) return;
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      let buf = '';
      this.proc.stdout.on('data', (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          const cb = this.pending.shift();
          if (cb) cb(line === '1');
        }
      });
      this.proc.on('exit', () => { this.proc = null; this.pending.splice(0).forEach((cb) => cb(false)); });
      this.proc.on('error', () => { this.proc = null; });
    } catch (_) { this.proc = null; }
  }

  /** @returns {Promise<boolean>} true si une app est en plein écran (false si non supporté / erreur) */
  check() {
    if (!this.supported) return Promise.resolve(false);
    this._ensure();
    if (!this.proc) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { const i = this.pending.indexOf(cb); if (i >= 0) this.pending.splice(i, 1); resolve(this.last); }, 4000);
      const cb = (v) => { clearTimeout(timer); this.last = v; resolve(v); };
      this.pending.push(cb);
      try { this.proc.stdin.write('x\n'); } catch (_) { resolve(false); }
    });
  }

  stop() { if (this.proc) { try { this.proc.stdin.end(); this.proc.kill(); } catch (_) {} this.proc = null; } }
}

module.exports = { FullscreenWatcher };
