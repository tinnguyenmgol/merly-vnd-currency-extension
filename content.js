(() => {
  if (window.__MERLY_CONVERT_LOADED__) return;
  window.__MERLY_CONVERT_LOADED__ = true;

  const MARKETS = [
    { code: 'MYR', short: 'MY', name: 'Malaysia', flag: '🇲🇾', symbol: 'RM', decimals: 2 },
    { code: 'SGD', short: 'SG', name: 'Singapore', flag: '🇸🇬', symbol: 'S$', decimals: 2 },
    { code: 'PHP', short: 'PH', name: 'Philippines', flag: '🇵🇭', symbol: '₱', decimals: 0 },
    { code: 'THB', short: 'TH', name: 'Thailand', flag: '🇹🇭', symbol: '฿', decimals: 0 },
    { code: 'TWD', short: 'TW', name: 'Taiwan', flag: '🇹🇼', symbol: 'NT$', decimals: 0 }
  ];

  const DEFAULTS = {
    adjustments: Object.fromEntries(MARKETS.map(m => [m.code, 0])),
    useAdjustment: false,
    lastVnd: 340000,
    autoSync: true,
    autoFill: true
  };

  let settings = structuredClone(DEFAULTS);
  let rates = null;
  let filling = false;
  let scanTimer = null;
  let lastFillKey = '';
  let panel, vndInput, resultsEl, rateStatusEl, sourceEl, autoSyncEl, autoFillEl, fillStatusEl;

  const num = value => Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0;
  const vndNum = value => Number(String(value ?? '').replace(/[^0-9]/g, '')) || 0;
  const fmtVnd = value => value ? new Intl.NumberFormat('vi-VN').format(value) : '';

  function converted(vnd, market) {
    if (!rates?.[market.code] || !vnd) return 0;
    const pct = settings.useAdjustment ? Number(settings.adjustments?.[market.code] || 0) : 0;
    return vnd * rates[market.code] * (1 + pct / 100);
  }

  function fmtMarket(value, market) {
    return `${market.symbol}${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: market.decimals,
      maximumFractionDigits: market.decimals
    }).format(value)}`;
  }

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function leafWithText(text) {
    return [...document.querySelectorAll('body *')].filter(el =>
      !el.closest('#merly-convert-root') &&
      visible(el) &&
      el.children.length === 0 &&
      el.textContent?.trim() === text
    );
  }

  function inputNear(label) {
    let node = label?.parentElement;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      const inputs = [...node.querySelectorAll('input')].filter(i =>
        i instanceof HTMLInputElement && !i.disabled && !i.readOnly && visible(i) &&
        !['checkbox', 'radio', 'hidden', 'file'].includes((i.type || 'text').toLowerCase())
      );
      if (inputs.length === 1) return inputs[0];
      if (inputs.length > 1 && depth <= 2) {
        const top = label.getBoundingClientRect().top;
        return inputs.sort((a, b) =>
          Math.abs(a.getBoundingClientRect().top - top) - Math.abs(b.getBoundingClientRect().top - top)
        )[0];
      }
    }
    return null;
  }

  function inputByLabel(text) {
    for (const label of leafWithText(text)) {
      const input = inputNear(label);
      if (input) return input;
    }
    return null;
  }

  const localPriceInput = () => inputByLabel('SKU Shop nội địa');
  const marketInput = market => inputByLabel(`${market.short} Giá`);

  function setReactInput(input, value) {
    const old = input.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, String(value));
    else input.value = String(value);
    if (input._valueTracker) input._valueTracker.setValue(old);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function render() {
    const vnd = vndNum(vndInput.value || settings.lastVnd);
    resultsEl.innerHTML = MARKETS.map(m => {
      const value = converted(vnd, m);
      const pct = Number(settings.adjustments?.[m.code] || 0);
      return `<div class="merly-result-row">
        <div class="merly-market"><span class="merly-flag">${m.flag}</span><div><strong>${m.short} Giá</strong><small>${m.name} · ${m.code}</small></div></div>
        <div class="merly-amount">${value ? fmtMarket(value, m) : '—'}${settings.useAdjustment && pct ? `<small>${pct > 0 ? '+' : ''}${pct}% Shopee</small>` : ''}</div>
      </div>`;
    }).join('');
    renderInlineHints();
  }

  function setFillStatus(text, type = '') {
    fillStatusEl.textContent = text;
    fillStatusEl.className = `merly-fill-status ${type}`.trim();
  }

  function fillMarkets(force = false) {
    if (filling || !rates) return;
    const vnd = vndNum(vndInput.value || settings.lastVnd);
    if (!vnd) return setFillStatus('Chưa có giá VND.', 'warn');

    const found = MARKETS.map(m => ({ market: m, input: marketInput(m) })).filter(x => x.input);
    if (!found.length) return setFillStatus('Chưa thấy ô giá MY/SG/PH/TH/TW.', 'warn');

    const key = `${location.pathname}|${vnd}|${settings.useAdjustment}|${MARKETS.map(m => settings.adjustments?.[m.code] || 0).join(',')}`;
    if (!force && key === lastFillKey) return;

    filling = true;
    let changed = 0;
    try {
      for (const { market, input } of found) {
        const value = converted(vnd, market);
        const next = market.decimals ? value.toFixed(market.decimals) : String(Math.round(value));
        if (Math.abs(num(input.value) - num(next)) > (market.decimals ? 0.0001 : 0.49)) {
          setReactInput(input, next);
          changed++;
        }
        input.classList.add('merly-autofilled-input');
        setTimeout(() => input.classList.remove('merly-autofilled-input'), 1000);
      }
      lastFillKey = key;
      setFillStatus(`Đã xử lý ${found.length}/5 thị trường${changed ? ` · cập nhật ${changed} ô` : ''}.`, 'ok');
    } finally {
      setTimeout(() => { filling = false; }, 30);
    }
    renderInlineHints();
  }

  function renderInlineHints() {
    document.querySelectorAll('.merly-inline-hint, .merly-inline-box').forEach(el => el.remove());
    const vnd = vndNum(vndInput.value || settings.lastVnd);
    if (!vnd || !rates) return;

    for (const m of MARKETS) {
      const value = converted(vnd, m);
      for (const label of leafWithText(`${m.short} Giá`)) {
        const chip = document.createElement('span');
        chip.className = 'merly-inline-hint';
        chip.textContent = fmtMarket(value, m);
        label.parentNode?.insertBefore(chip, label.nextSibling);
      }
    }

    for (const label of leafWithText('SKU Shop nội địa')) {
      const box = document.createElement('div');
      box.className = 'merly-inline-box';
      box.textContent = `Merly Convert: ${fmtVnd(vnd)}₫ → Autofill ${autoFillEl.checked ? 'BẬT' : 'TẮT'}`;
      label.parentNode?.insertBefore(box, label.nextSibling);
    }
  }

  async function persist() {
    settings.lastVnd = vndNum(vndInput.value);
    settings.autoSync = autoSyncEl.checked;
    settings.autoFill = autoFillEl.checked;
    await chrome.storage.sync.set({ merlyCurrencySettings: settings });
  }

  function syncFromShopee() {
    if (!autoSyncEl.checked || filling) return;
    const input = localPriceInput();
    const value = vndNum(input?.value);
    if (!input || value < 1000) return;
    if (vndNum(vndInput.value) !== value) {
      vndInput.value = fmtVnd(value);
      settings.lastVnd = value;
      lastFillKey = '';
      persist();
      render();
    }
    sourceEl.textContent = 'Nguồn: SKU Shop nội địa';
    panel.classList.remove('merly-hidden');
    if (autoFillEl.checked) fillMarkets();
  }

  function queueScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(syncFromShopee, 180);
  }

  async function loadRates(force = false) {
    rateStatusEl.textContent = force ? 'Đang cập nhật...' : 'Đang tải tỷ giá...';
    const response = await chrome.runtime.sendMessage({ type: 'GET_RATES', force });
    if (!response?.ok) {
      rateStatusEl.textContent = 'Lỗi tỷ giá';
      return setFillStatus('Không lấy được tỷ giá.', 'error');
    }
    rates = response.data.rates;
    const t = response.data.timestamp ? new Date(response.data.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
    rateStatusEl.textContent = `${response.data.stale ? 'Cache' : 'Live'} · ${t}`;
    render();
    syncFromShopee();
  }

  function createUI() {
    const root = document.createElement('div');
    root.id = 'merly-convert-root';
    root.innerHTML = `<button id="merly-convert-fab" type="button">💱 Merly Convert</button>
      <div id="merly-convert-panel" class="merly-hidden">
        <div class="merly-panel-head">
          <div class="merly-panel-title"><div class="merly-panel-badge">⇄</div><div><strong>Merly Currency Helper</strong><small>Quy đổi & tự điền giá Shopee</small></div></div>
          <div class="merly-head-actions"><button id="merly-refresh-btn" class="merly-icon-btn" type="button">↻</button><button id="merly-hide-btn" class="merly-icon-btn" type="button">✕</button></div>
        </div>
        <div class="merly-panel-body">
          <div class="merly-vnd-input"><input id="merly-vnd-input" type="text" inputmode="numeric" placeholder="Nhập giá VND"><span>₫</span></div>
          <div class="merly-auto-row"><label><input id="merly-auto-sync" type="checkbox"><span>Tự lấy giá VN</span></label><div id="merly-rate-status" class="merly-rate-status">Đang tải...</div></div>
          <div class="merly-auto-row merly-autofill-row"><label><input id="merly-auto-fill" type="checkbox"><span>Tự điền giá 5 thị trường</span></label><button id="merly-fill-now" class="merly-fill-btn" type="button">⚡ Điền ngay</button></div>
          <div id="merly-source" class="merly-source">Nguồn: nhập tay</div>
          <div id="merly-fill-status" class="merly-fill-status">Sẵn sàng.</div>
          <div id="merly-results" class="merly-results"></div>
        </div>
      </div>`;
    document.documentElement.appendChild(root);

    panel = root.querySelector('#merly-convert-panel');
    vndInput = root.querySelector('#merly-vnd-input');
    resultsEl = root.querySelector('#merly-results');
    rateStatusEl = root.querySelector('#merly-rate-status');
    sourceEl = root.querySelector('#merly-source');
    autoSyncEl = root.querySelector('#merly-auto-sync');
    autoFillEl = root.querySelector('#merly-auto-fill');
    fillStatusEl = root.querySelector('#merly-fill-status');

    root.querySelector('#merly-convert-fab').onclick = () => panel.classList.toggle('merly-hidden');
    root.querySelector('#merly-hide-btn').onclick = () => panel.classList.add('merly-hidden');
    root.querySelector('#merly-refresh-btn').onclick = () => loadRates(true);
    root.querySelector('#merly-fill-now').onclick = () => fillMarkets(true);

    vndInput.addEventListener('input', async () => {
      const value = vndNum(vndInput.value);
      vndInput.value = value ? fmtVnd(value) : '';
      settings.lastVnd = value;
      sourceEl.textContent = 'Nguồn: nhập tay';
      lastFillKey = '';
      render();
      await persist();
      if (autoFillEl.checked) setTimeout(() => fillMarkets(), 50);
    });

    autoSyncEl.addEventListener('change', persist);
    autoFillEl.addEventListener('change', async () => {
      lastFillKey = '';
      await persist();
      if (autoFillEl.checked) fillMarkets(true);
    });
  }

  async function init() {
    createUI();
    const saved = await chrome.storage.sync.get(['merlyCurrencySettings']);
    settings = {
      ...structuredClone(DEFAULTS),
      ...(saved.merlyCurrencySettings || {}),
      adjustments: { ...DEFAULTS.adjustments, ...(saved.merlyCurrencySettings?.adjustments || {}) }
    };
    autoSyncEl.checked = settings.autoSync !== false;
    autoFillEl.checked = settings.autoFill !== false;
    vndInput.value = fmtVnd(settings.lastVnd || DEFAULTS.lastVnd);
    render();
    await loadRates(false);

    document.addEventListener('input', event => {
      if (filling || !autoSyncEl.checked) return;
      if (event.target === localPriceInput()) setTimeout(syncFromShopee, 30);
    }, true);

    new MutationObserver(() => {
      renderInlineHints();
      queueScan();
    }).observe(document.body, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.merlyCurrencySettings?.newValue) return;
      const next = changes.merlyCurrencySettings.newValue;
      settings = { ...settings, ...next, adjustments: { ...settings.adjustments, ...(next.adjustments || {}) } };
      autoSyncEl.checked = settings.autoSync !== false;
      autoFillEl.checked = settings.autoFill !== false;
      lastFillKey = '';
      render();
      queueScan();
    });
  }

  init();
})();
