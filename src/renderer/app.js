/* global I18N */
(() => {
  const $ = (id) => document.getElementById(id);
  let S = {};          // settings
  let C = {};          // config
  let SYS = {};        // infos système
  let status = {};     // scheduler snapshot
  let lang = 'en';
  let uptimeTimer = null;
  let logLines = [];
  const LANGS = Object.keys(I18N).filter((k) => !k.startsWith('__'));

  const t = (k, vars = {}) => {
    const str = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
    return str.replace(/\{(\w+)\}/g, (_, v) => (v in vars ? vars[v] : `{${v}}`));
  };
  const locale = () => ({ fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR', de: 'de-DE', it: 'it-IT', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', tr: 'tr-TR', id: 'id-ID', vi: 'vi-VN', ar: 'ar', hi: 'hi-IN' }[lang] || 'en-US');

  function applyI18n() {
    document.documentElement.lang = lang;
    document.documentElement.dir = (I18N.__rtl || []).includes(lang) ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $('change-input').placeholder = t('change_placeholder');
    $('onboard-fee').textContent = C.devFeePercent ? t('onboard_fee', { pct: C.devFeePercent }) : t('onboard_nofee');
    $('fee-line').textContent = C.devFeePercent
      ? t('fee_line', { pct: C.devFeePercent, v: C.clientVersion })
      : t('fee_line_nofee', { v: C.clientVersion });
    $('terms-text').textContent = t('terms_text', { pct: C.devFeePercent || 0 });
    $('ref-hint').textContent = t('referral_hint', { pct: Math.round((C.referralShare || 0) * 100) });
    renderSettings();
    renderStatus();
    renderSys();
    renderUpdate(C.appUpdate);
    renderEstimate();
  }

  function fillLangSelects() {
    [$('sel-lang'), $('onboard-lang')].forEach((sel) => {
      sel.innerHTML = '';
      LANGS.forEach((code) => {
        const o = document.createElement('option');
        o.value = code; o.textContent = (I18N.__names || {})[code] || code;
        sel.appendChild(o);
      });
      sel.value = lang;
      sel.onchange = async (e) => { lang = e.target.value; await setSettings({ lang }); fillLangSelects(); applyI18n(); };
    });
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function fmtNum(n, d = 0) {
    return Number(n || 0).toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function fmtRate(v) {
    if (!v) return '—';
    if (v >= 1e6) return fmtNum(v / 1e6, 2) + ' M';
    if (v >= 1e3) return fmtNum(v / 1e3, 1) + ' k';
    return fmtNum(v, 0);
  }
  function fmtDur(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
  }
  function fmtDate(d) {
    return new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  }

  /* ---------- rendu ---------- */
  function renderStatus() {
    const st = status.state || 'stopped';
    const big = $('bigbtn');
    big.className = 'bigbtn';
    const icon = big.querySelector('.icon');
    const pill = $('pill');
    pill.className = 'pill';
    let label = t('st_' + st), detail = '';
    if (st === 'downloading') label = t('st_downloading', { pct: Math.round((status.progress || 0) * 100) });
    if (st === 'paused' && status.pausedReason === 'fullscreen') label = t('st_paused_game');
    if (st === 'error') {
      const key = 'err_' + (status.error || 'generic');
      detail = (I18N[lang] && I18N[lang][key]) || I18N.en[key] ? t(key) : t('err_generic', { e: status.error });
      big.classList.add('error'); pill.classList.add('err');
    } else if (st === 'running' || st === 'devfee') {
      big.classList.add('running'); pill.classList.add('on');
    } else if (st === 'paused') {
      big.classList.add('paused'); pill.classList.add('warn');
    } else if (st !== 'stopped') {
      big.classList.add('busy');
    }
    icon.className = 'icon ' + (status.wanted ? 'stop' : 'play');
    big.setAttribute('aria-label', status.wanted ? t('a11y_bigbtn_stop') : t('a11y_bigbtn_start'));
    big.setAttribute('aria-pressed', status.wanted ? 'true' : 'false');
    pill.textContent = label;
    $('state-label').textContent = label;
    $('state-detail').textContent = detail;
    const pr = $('progress');
    if (st === 'downloading') { pr.classList.remove('hidden'); pr.firstElementChild.style.width = Math.round((status.progress || 0) * 100) + '%'; }
    else pr.classList.add('hidden');

    $('s-speed').textContent = fmtRate(status.hashrate) + (status.hashrate ? ' it/s' : '');
    $('s-threads').textContent = status.cpuThreads ? `${status.threads}/${status.cpuThreads}` : '—';
    $('s-sols').textContent = status.connected ? fmtNum(status.sols) : '—';
    renderUptime();
    if (status.wanted && !uptimeTimer) uptimeTimer = setInterval(renderUptime, 30000);
    if (!status.wanted && uptimeTimer) { clearInterval(uptimeTimer); uptimeTimer = null; }
  }
  function renderUptime() {
    $('s-uptime').textContent = status.startedAt && (status.state === 'running' || status.state === 'devfee') ? fmtDur(Date.now() - status.startedAt) : '—';
  }

  function renderSettings() {
    document.querySelectorAll('#seg-int button').forEach((b) => b.classList.toggle('on', +b.dataset.v === +S.intensity));
    $('int-hint').textContent = status.cpuThreads ? t('int_hint', { t: status.threads, n: status.cpuThreads }) : '';
    $('t-idle').checked = !!S.idleOnly;
    $('idle-row').style.display = S.idleOnly ? '' : 'none';
    $('r-idle').value = S.idleMinutes || 3;
    $('idle-after-label').textContent = t('idle_after', { m: S.idleMinutes || 3 });
    $('t-gpu').checked = !!S.gpu;
    $('t-gpu').disabled = SYS.nvidia === false;
    $('gpu-hint').textContent = SYS.nvidia === false ? t('gpu_none') : t('gpu_hint');
    $('t-auto').checked = !!S.autoStart;
    $('t-login').checked = !!S.launchAtLogin;
    $('t-fullscreen').checked = S.pauseFullscreen !== false;
    $('t-telemetry').checked = !!S.telemetry;
    $('row-login').style.display = C.platform === 'linux' ? 'none' : '';
    if (document.activeElement !== $('i-kwh')) $('i-kwh').value = S.kwhPrice != null ? S.kwhPrice : 0.2;
    if (document.activeElement !== $('i-watts')) $('i-watts').value = S.watts != null ? S.watts : '';
    renderWallet();
    renderReferral();
  }

  function renderReferral() {
    $('ref-code').textContent = S.wallet ? S.wallet.id : '—';
    $('ref-status').textContent = S.referrer ? t('referral_set', { id: S.referrer.slice(0, 8) + '…' + S.referrer.slice(-6) }) : '';
    $('b-ref-remove').classList.toggle('hidden', !S.referrer);
    if (document.activeElement !== $('i-ref')) $('i-ref').value = S.referrer || '';
  }

  async function renderEstimate() {
    try {
      const e = await window.mq.estimate();
      const has = e && e.netDay != null;
      $('est-none').classList.toggle('hidden', !!has);
      $('est-lines').classList.toggle('hidden', !has);
      if (!has) return;
      const price = e.lastPayout && e.grossDay != null ? (e.grossDay * 7 / (e.lastPayout.qubic || 1)) : 0;
      $('est-last').textContent = t('est_last', { n: fmtNum(e.lastPayout.qubic), eur: fmtNum(e.lastPayout.qubic * price, 2) });
      $('est-gross').textContent = t('est_gross', { eur: fmtNum(e.grossDay, 2) });
      $('est-elec').textContent = t('est_elec', { eur: fmtNum(e.elecDay, 2), w: e.watts, p: fmtNum(S.kwhPrice != null ? S.kwhPrice : 0.2, 2) });
      $('est-net').textContent = t('est_net', { eur: fmtNum(e.netDay, 2) });
    } catch (_) {}
  }

  function renderSys() {
    const warns = [];
    if (SYS.cpuVersion) $('cpu-hint').textContent = t('sys_cpu', { v: SYS.cpuVersion + (SYS.cpuModel ? ' · ' + SYS.cpuModel : '') });
    if (SYS.cpuVersion === 'GENERIC') warns.push(t('sys_cpu_generic'));
    if (SYS.ramLow) warns.push(t('sys_ram_low'));
    const el = $('sys-warn');
    el.textContent = warns.join(' ');
    el.classList.toggle('hidden', !warns.length);
  }

  function renderUpdate(u) {
    const el = $('upd-hint');
    if (!u || u.status === 'off') { el.textContent = t('upd_client', { v: C.clientVersion }) + ' ' + t('upd_off'); $('b-update').disabled = true; return; }
    $('b-update').disabled = false;
    if (u.status === 'none' || u.status === 'idle') el.textContent = t('upd_none') + ' ' + t('upd_client', { v: C.clientVersion });
    else if (u.status === 'downloading') el.textContent = t('upd_avail', { v: u.version });
    else if (u.status === 'ready') { el.textContent = ''; $('b-update').textContent = t('upd_ready'); }
    else if (u.status === 'error') el.textContent = u.error || '';
    else el.textContent = '…';
    C.appUpdate = u;
  }

  function renderWallet() {
    const w = S.wallet;
    $('addr').textContent = w ? w.id : '—';
    $('addr-external').classList.toggle('hidden', !(w && w.external));
    $('b-backup').classList.toggle('hidden', !(w && w.hasSeed));
    $('connect-backup').classList.toggle('hidden', !(w && w.hasSeed));
  }

  async function refreshBalance() {
    try {
      const b = await window.mq.balance();
      if (!b) return;
      $('bal-qubic').textContent = b.balance == null ? '—' : fmtNum(b.balance);
      const price = b.price && b.price.eur;
      $('bal-eur').textContent = price && b.balance != null ? `≈ ${fmtNum(b.balance * price, 2)} €` : t('price_na');
      $('earned-since').textContent = b.earnedSinceStart != null && b.startBalanceAt
        ? `+ ${fmtNum(b.earnedSinceStart)} QUBIC ${t('earned_since', { date: fmtDate(b.startBalanceAt) })}` : '';
      $('next-payout').textContent = t('next_payout', { date: fmtDate(b.nextEpochEnd) });
      $('backup-nag').classList.toggle('hidden', !(S.wallet && S.wallet.hasSeed && !S.seedBackedUp && b.balance > 0));
    } catch (_) { /* hors-ligne */ }
  }

  function appendLog(line) {
    logLines.push(line);
    if (logLines.length > 300) logLines.shift();
    const el = $('log');
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    el.textContent = logLines.join('\n');
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  function showScreen(id) {
    ['onboard', 'main'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
  }

  /* ---------- actions ---------- */
  async function toggle() {
    if (status.wanted) status = await window.mq.stop();
    else status = await window.mq.start();
    renderStatus();
    S = (await window.mq.init()).settings; renderWallet();
  }

  async function setSettings(patch) {
    S = await window.mq.setSettings(patch);
    renderSettings();
  }

  function openChange() {
    $('change-input').value = '';
    $('change-err').classList.add('hidden');
    $('modal-change').classList.remove('hidden');
    $('change-input').focus();
  }

  async function openConnect() {
    try { const d = await window.mq.walletQr(); if (d) $('qr').src = d; } catch (_) {}
    $('modal-connect').classList.remove('hidden');
  }

  async function openBackup() {
    const seed = await window.mq.revealSeed();
    if (!seed) return;
    $('seed').textContent = seed;
    $('modal-backup').classList.remove('hidden');
  }

  async function doChange() {
    const v = $('change-input').value.trim();
    try {
      if (/^[a-z]{55}$/.test(v)) await window.mq.importWallet({ seed: v });
      else if (/^[A-Za-z]{60}$/.test(v)) await window.mq.importWallet({ address: v.toUpperCase() });
      else throw new Error('bad');
      $('modal-change').classList.add('hidden');
      S = (await window.mq.init()).settings;
      renderWallet();
      refreshBalance();
      toast('✓');
    } catch (_) {
      $('change-err').classList.remove('hidden');
    }
  }

  /* ---------- wiring ---------- */
  async function boot() {
    const init = await window.mq.init();
    S = init.settings; C = init.config; status = init.status; SYS = init.sys || {};
    lang = LANGS.includes(S.lang) ? S.lang : 'en';
    logLines = init.lines || [];
    $('log').textContent = logLines.join('\n');
    fillLangSelects();
    applyI18n();
    showScreen(S.firstRun && !S.wallet ? 'onboard' : 'main');
    if (!S.termsAccepted) $('modal-terms').classList.remove('hidden');
    refreshBalance();
    setInterval(refreshBalance, 60000);
    setInterval(renderEstimate, 10 * 60000);

    $('onboard-start').onclick = async () => {
      $('onboard-start').disabled = true;
      await setSettings({ firstRun: false });
      showScreen('main');
      await toggle();
    };
    $('onboard-have').onclick = async () => { await setSettings({ firstRun: false }); showScreen('main'); openChange(); };
    $('onboard-terms').onclick = () => $('modal-terms').classList.remove('hidden');
    $('b-terms').onclick = () => $('modal-terms').classList.remove('hidden');
    $('terms-ok').onclick = async () => { $('modal-terms').classList.add('hidden'); if (!S.termsAccepted) await setSettings({ termsAccepted: true }); };
    $('t-fullscreen').onchange = (e) => setSettings({ pauseFullscreen: e.target.checked });
    $('t-telemetry').onchange = (e) => setSettings({ telemetry: e.target.checked });
    $('i-kwh').onchange = async (e) => { await setSettings({ kwhPrice: parseFloat(e.target.value) }); renderEstimate(); };
    $('i-watts').onchange = async (e) => { await setSettings({ watts: e.target.value === '' ? null : parseInt(e.target.value, 10) }); renderEstimate(); };
    $('b-ref-copy').onclick = () => { if (S.wallet) { window.mq.copy(S.wallet.id); toast(t('copied')); } };
    $('b-ref-save').onclick = async () => {
      const r = await window.mq.setReferral($('i-ref').value.trim());
      $('ref-err').classList.toggle('hidden', r.ok);
      if (r.ok) { S.referrer = r.referrer; renderReferral(); toast('✓'); }
    };
    $('b-ref-remove').onclick = async () => { await window.mq.setReferral(''); S.referrer = null; renderReferral(); };
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal:not(.hidden)').forEach((m) => { if (m.id !== 'modal-terms' || S.termsAccepted) m.classList.add('hidden'); });
    });
    $('bigbtn').onclick = toggle;

    document.querySelectorAll('#seg-int button').forEach((b) => { b.onclick = () => setSettings({ intensity: +b.dataset.v }); });
    $('t-idle').onchange = (e) => setSettings({ idleOnly: e.target.checked });
    $('r-idle').oninput = (e) => { $('idle-after-label').textContent = t('idle_after', { m: e.target.value }); };
    $('r-idle').onchange = (e) => setSettings({ idleMinutes: +e.target.value });
    $('t-gpu').onchange = (e) => setSettings({ gpu: e.target.checked });
    $('t-auto').onchange = (e) => setSettings({ autoStart: e.target.checked });
    $('t-login').onchange = (e) => setSettings({ launchAtLogin: e.target.checked });
    $('b-update').onclick = async () => {
      if (C.appUpdate && C.appUpdate.status === 'ready') return window.mq.installUpdate();
      $('upd-hint').textContent = '…';
      renderUpdate(await window.mq.checkUpdate());
    };

    $('b-copy').onclick = () => { if (S.wallet) { window.mq.copy(S.wallet.id); toast(t('copied')); } };
    $('b-pool').onclick = () => window.mq.openExternal(C.poolDashboard);
    $('b-connect').onclick = openConnect;
    $('connect-wallet').onclick = () => window.mq.openExternal(C.walletUrl);
    $('connect-backup').onclick = () => { $('modal-connect').classList.add('hidden'); openBackup(); };
    $('connect-other').onclick = () => { $('modal-connect').classList.add('hidden'); openChange(); };
    $('connect-close').onclick = () => $('modal-connect').classList.add('hidden');
    $('change-cancel').onclick = () => $('modal-change').classList.add('hidden');
    $('change-ok').onclick = doChange;
    $('change-input').onkeydown = (e) => { if (e.key === 'Enter') doChange(); };

    $('b-backup').onclick = openBackup;
    $('seed-copy').onclick = () => { window.mq.copy($('seed').textContent); toast(t('copied')); };
    $('seed-done').onclick = async () => { $('modal-backup').classList.add('hidden'); $('seed').textContent = '…'; await setSettings({ seedBackedUp: true }); refreshBalance(); };

    $('b-sell').onclick = () => {
      const box = $('sell-links'); box.innerHTML = '';
      (C.exchanges || []).forEach((x) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = x.name; b.onclick = () => window.mq.openExternal(x.url); box.appendChild(b); });
      $('modal-sell').classList.remove('hidden');
    };
    $('sell-close').onclick = () => $('modal-sell').classList.add('hidden');
    $('b-quit').onclick = () => window.mq.quit();

    window.mq.onStatus((s) => { status = s; renderStatus(); $('int-hint').textContent = t('int_hint', { t: s.threads, n: s.cpuThreads }); });
    window.mq.onLine(appendLog);
    window.mq.onWallet((w) => { S.wallet = w; renderWallet(); refreshBalance(); });
    if (window.mq.onSys) window.mq.onSys((s) => { SYS = s; renderSys(); renderSettings(); });
    if (window.mq.onAppUpdate) window.mq.onAppUpdate(renderUpdate);
    if (window.mq.onPayout) window.mq.onPayout((p) => { toast(`+${fmtNum(p.gained)} QUBIC`); refreshBalance(); });
  }

  boot();
})();
