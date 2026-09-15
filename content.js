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

  const DEFAULT_SETTINGS = {
    adjustments: Object.fromEntries(MARKETS.map(m => [m.code, 0])),
    useAdjustment: false,
    lastVnd: 340000,
    autoSync: true,
    autoFill: true
  };

  let rates = null;
  let settings = structuredClone(DEFAULT_SETTINGS);
  let trackedInput = null;
  let root, fab, panel, vndInput, resultsEl, statusEl, sourceEl, autoSyncEl, autoFillEl, fillStatusEl;
  let hintTimer = null;
  let scanTimer = null;
  let internalFill = false;
  let lastAutoFillKey = '';

  function normalizeVnd(value) {
    return Number(String(value ?? '').replace(/[^0-9]/g, '')) || 0;
  }

  function normalizeNumber(value) {
    const cleaned = String(value ?? '').trim().replace(/\s/g, '').replace(/,/g, '');
    return Number(cleaned) || 0;
  }

  function formatVnd(value) {
    if (!value) return '';
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  function formatMoney(value, market) {
    return `${market.symbol}${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: market.decimals,
      maximumFractionDigits: market.decimals
    }).format(value)}`;
  }

  function inputValueForMarket(value, market) {
    return Number(value).toFixed(market.decimals);
  }

  function getConverted(vnd, market) {
    if (!rates?.[market.code] || !vnd) return 0;
    const base = vnd * rates[market.code];
    const adjustment = settings.useAdjustment ? Number(settings.adjustments[market.code] || 0) : 0;
    return base * (1 + adjustment / 100);
  }

  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function findLabelsByExactText(text) {
    const all = Array.from(document.querySelectorAll('body *'));
    return all.filter(el => {
      if (el.closest('#merly-convert-root')) return false;
      if (!isVisible(el)) return false;
      if (el.children.length > 0) return false;
      return el.textContent?.trim() === text;
    });
  }

  function findInputNearLabel(label) {
    if (!label) return null;

    let node = label.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      const inputs = Array.from(node.querySelectorAll('input')).filter(input => {
        if (!(input instanceof HTMLInputElement)) return false;
        if (input.disabled || input.readOnly) return false;
        if (!isVisible(input)) return false;
        const type = (input.type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'hidden', 'file'].includes(type);
      });
      if (inputs.length === 1) return inputs[0];
      if (inputs.length > 1 && depth <= 2) {
        const labelRect = label.getBoundingClientRect();
        return inputs
          .map(input => ({ input, rect: input.getBoundingClientRect() }))
          .sort((a, b) => Math.abs(a.rect.top - labelRect.top) - Math.abs(b.rect.top - labelRect.top))[0]?.input || null;
      }
    }
    return null;
  }

  function findInputByLabelText(text) {
    const labels = findLabelsByExactText(text);
    for (const label of labels) {
      const input = findInputNearLabel(label);
      if (input) return input;
    }
    return null;
  }

  function findMarketInput(market) {
    return findInputByLabelText(`${market.short} Giá`);
  }

  function findLocalPriceInput() {
    return findInputByLabelText('SKU Shop nội địa');
  }

  function isMarketPriceInput(el) {
    return MARKETS.some(market => findMarketInput(market) === el);
  }

  function isTrackableInput(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    if (el.readOnly || el.disabled) return false;
    if (!isVisible(el)) return false;
    if (el.closest('#merly-convert-root')) return false;
    if (isMarketPriceInput(el)) return false;

    const type = (el.type || 'text').toLowerCase();
    if (['checkbox', 'radio', 'file', 'hidden', 'date', 'email', 'password'].includes(type)) return false;
    const placeholder = `${el.placeholder || ''} ${el.ariaLabel || ''}`.toLowerCase();
    if (placeholder.includes('sku')) return false;

    const localInput = findLocalPriceInput();
    if (localInput === el) return true;

    const nearText = (el.parentElement?.parentElement?.innerText || el.parentElement?.innerText || '').toLowerCase();
    if (nearText.includes('kho hàng') && !nearText.includes('giá')) return false;
    if (nearText.includes('giá') || nearText.includes('vnd') || nearText.includes('shop nội địa') || nearText.includes('đ')) return true;

    const num = normalizeVnd(el.value);
    return num >= 1000;
  }

  function renderResults() {
    const vnd = normalizeVnd(vndInput.value || settings.lastVnd);
    resultsEl.innerHTML = MARKETS.map(m => {
      const amount = getConverted(vnd, m);
      const adj = Number(settings.adjustments[m.code] || 0);
      const note = settings.useAdjustment && adj !== 0 ? `<small>${adj > 0 ? '+' : ''}${adj}% Shopee</small>` : '';
      return `
        <div class="merly-result-row">
          <div class="merly-market">
            <span class="merly-flag">${m.flag}</span>
            <div>
              <strong>${m.short} Giá</strong>
              <small>${m.name} · ${m.code}</small>
            </div>
          </div>
          <div class="merly-amount">
            ${amount ? formatMoney(amount, m) : '—'}
            ${note}
          </div>
        </div>
      `;
    }).join('');
    queueInlineHints();
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setSource(text) {
    if (sourceEl) sourceEl.textContent = text;
  }

  function setFillStatus(text, type = '') {
    if (!fillStatusEl) return;
    fillStatusEl.textContent = text;
    fillStatusEl.className = `merly-fill-status ${type}`.trim();
  }

  function setNativeInputValue(input, value) {
    const nextValue = String(value);
    const previousValue = input.value;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    input.focus({ preventScroll: true });
    if (descriptor?.set) descriptor.set.call(input, nextValue);
    else input.value = nextValue;

    if (input._valueTracker) input._valueTracker.setValue(previousValue);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '0' }));
    input.blur();
  }

  function fillMarketInputs({ force = false } = {}) {
    const vnd = normalizeVnd(vndInput.value || settings.lastVnd);
    if (!vnd || !rates) {
      setFillStatus('Chưa có giá VND hoặc tỷ giá.', 'error');
      return { found: 0, filled: 0 };
    }

    const inputs = MARKETS.map(market => ({ market, input: findMarketInput(market) })).filter(item => item.input);
    if (!inputs.length) {
      setFillStatus('Chưa thấy oô giá MY/SG/PH/TH/TW trên trang.', 'warn');
      return { found: 0, filled: 0 };
    }

    const fillKey = `${location.pathname}|${vnd}|${settings.useAdjustment}|${MARKETS.map(m => settings.adjustments[m.code] || 0).join(',')}`;
    if (!force && fillKey === lastAutoFillKey) return { found: inputs.length, filled: 0 };

    internalFill = true;
    let filled = 0;

    try {
      for (const { market, input } of inputs) {
        const amount = getConverted(vnd, market);
        if (!amount) continue;
        const nextValue = inputValueForMarket(amount, market);
        const currentValue = normalizeNumber(input.value);
        const nextNumber = normalizeNumber(nextValue);

        if (Math.abs(currentValue - nextNumber) > (market.decimals ? 0.0001 : 0.49)) {
          setNativeInputValue(input, nextValue);
          filled += 1;
        }

        input.classList.add('merly-autofilled-input');
        setTimeout(() => input.classList.remove('merly-autofilled-input'), 1200);
      }
    } finally {
      setTimeout(() => { internalFill = false; }, 50);
    }

    lastAutoFillKey = fillKey;
    const missing = MARKETS.length - inputs.length;
    const detail = missing > 0 ? ` · thiếu ${missing}/ô`: '';
    setFillStatus(`Đan xử lý ${inputs.length}/5 thị trường${detail}.`, filled ? 'ok' : 'info');
    queueInlineHints();
    return { found: inputs.length, filled };
  }

  function createUI() {
    root = document.createElement('div');
    root.id = 'merly-convert-root';
    root.innerHTML = `
      <button id="merly-convert-fab" type="button">💹 Merly Convert</button>
      <div id="merly-convert-panel" class="merly-hidden">
        <div class="merly-panel-head">
          <div class="merly-panel-title">
            <div class="merly-panel-badge">⇄</div>
            <div>
              <strong>Merly Currency Helper</strong>
              <small>Quy đổi & tự điền giá Shopee</small>
            </div>
          </div>
          <div class="merly-head-actions">
            <button id="merly-refresh-btn" class="merly-icon-btn" type="button" title="Cập nhật tỷ giá">⇻</button>
            <button id="merly-hide-btn" class="merly-icon-btn" type="button" title="Thu gọn">✕</button>
          </div>
        </div>
        <div class="merly-panel-body">
          <div class="merly-vnd-input">
            <input id="merly-vnd-input" type="text" inputmode="numeric" placeholder="Nhập giá VND" />
            <span>₫</span>
          </div>
          <div class="merly-auto-row">
            <label>
              <input id="merly-auto-sync" type="checkbox" />
              <span>Tự lấy giá VN</span>
            </label>
            <div class="merly-rate-status" id="merly-rate-status">Đang tải tỷ giá...</div>
          </div>
          <div class="merly-auto-row merly-autofill-row">
            <label>
              <input id="merly-auto-fill" type="checkbox" />
              <span>Tự điền giá 5 thị trường</span>
            </label>
            <button id="merly-fill-now" type="button" class="merly-fill-btn">⚡ Điền ngay</button>
          </div>
          <div class="merly-source" id="merly-source">Nguồn: hand input</div>
          <div class="merly-fill-status" id="merly-fill-status">Sẵn sàng.</div>
          <div class="merly-results" id="merly-results"></div>
        </div>
      </div>
    `;
    document.documentElement.appendChild(root);

    fab = root.querySelector('#merly-convert-fab');
    panel = root.querySelector('#merly-convert-panel');
    vndInput = root.querySelector('#merly-vnd-input');
    resultsEl = root.querySelector('#merly-results');
    statusEl = root.querySelector('#merly-rate-status');
    sourceEl = root.querySelector('#merly-source');
    autoSyncEl = root.querySelector('#merly-auto-sync');
    autoFillEl = root.querySelector('#merly-auto-fill');
    fillStatusEl = root.querySelector('#merly-fill-status');

    fab.addEventListener('click', () => panel.classList.toggle('merly-hidden'));
    root.querySelector('#merly-hide-btn').addEventListener('click', () => panel.classList.add('merly-hidden'));
    root.querySelector('#merly-refresh-btn').addEventListener('click', () => loadRates(true));
    root.querySelector('#merly-fill-now').addEventListener('click', () => fillMarketInputs({ force: true }));

    vndInput.addEventListener('input', async () => {
      const v = normalizeVnd(vndInput.value);
      vndInput.value = v ? formatVnd(v) : '';
      settings.lastVnd = v;
      trackedInput = null;
      lastAutoFillKey = '';
      setSource('Nguồn: nhập tay');
      renderResults();
      await persistSettings();
      if (autoFillEl.checked) setTimeout(() => fillMarketInputs(), 80);
    });

    autoSyncEl.addEventListener('change', async () => {
      settings.autoSync = autoSyncEl.checked;
      await persistSettings();
    });

    autoFillEl.addEventListener('change', async () => {
      settings.autoFill = autoFillEl.checked;
      lastAutoFillKey = '';
      await persistSettings();
      if (settings.autoFill) setTimeout(() => scanShopeeForm({ forceFill: true }), 80);
    });
  }

  async function loadSettings() {
    const saved = await chrome.storage.sync.get(['merlyCurrencySettings']);
    settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...(saved.merlyCurrencySettings || {}),
      adjustments: {
        ...DEFAULT_SETTINGS.adjustments,
        ...(saved.merlyCurrencySettings?.adjustments || {})
      }
    };
    autoSyncEl.checked = settings.autoSync !== false;
    autoFillEl.checked = settings.autoFill !== false;
    vndInput.value = formatVnd(settings.lastVnd || DEFAULT_SETTINGS.lastVnd);
  }

  async function persistSettings() {
    settings.lastVnd = normalizeVnd(vndInput.value);
    settings.autoSync = autoSyncEl.checked;
    settings.autoFill = autoFillEl.checked;
    await chrome.storage.sync.set({ merlyCurrencySettings: settings });
  }

  async function loadRates(force = false) {
    setStatus(force ? 'Đang cập nhật...' : 'Đang tải tỷ giá...');
    const response = await chrome.runtime.sendMessage({ type: 'GET_RATES', force });
    if (!response?.ok) {
      setStatus('Lỗi tỷ giá');
      setFillStatus('Không lấy được tỷ giá.', 'error');
      return;
    }
    rates = response.data.rates;
    const time = response.data?.timestamp ? new Date(response.data.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
    setStatus(response.data?.stale ? `Cache cũ · ${time}` : `Live · ${time}`);
    renderResults();
    scanShopeeForm({ forceFill: true });
  }

  function syncFromInput(el) {
    if (!autoSyncEl.checked || internalFill) return;
    if (!isTrackableInput(el)) return;
    const v = normalizeVnd(el.value);
    if (!v) return;
    trackedInput = el;
    if (normalizeVnd(vndInput.value) !== v) {
      vndInput.value = formatVnd(v);
      settings.lastVnd = v;
      lastAutoFillKey = '';
      persistSettings();
    }
    setSource('Nguồn: giá SKU Shop nội địa / ô giá VN đang chọn');
    renderResults();
    if (autoFillEl.checked) setTimeout(() => fillMarketInputs(), 80);
  }

  function handleFocusIn(e) {
    if (internalFill) return;
    const el = e.target;
    if (el instanceof HTMLInputElement && isTrackableInput(el)) {
      syncFromInput(el);
      panel.classList.remove('merly-hidden');
    }
  }

  function handleInput(e) {
    if (internalFill) return;
    const el = e.target;
    if (el instanceof HTMLInputElement && (el === trackedInput || !trackedInput)) {
      syncFromInput(el);
    }
  }

  function clearOldHints() {
    document.querySelectorAll('.merly-inline-hint, .merly-inline-box').forEach(el => el.remove());
  }

  function queueInlineHints() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(applyInlineHints, 250);
  }

  function applyInlineHints() {
    clearOldHints();
    const vnd = normalizeVnd(vndInput.value);
    if (!vnd || !rates) return;

    for (const market of MARKETS) {
      const amount = getConverted(vnd, market);
      const labelText = `${market.short} Giá`;
      const labelTargets = findLabelsByExactText(labelText);
      for (const label of labelTargets) {
        const chip = document.createElement('span');
        chip.className = 'merly-inline-hint';
        chip.textContent = formatMoney(amount, market);
        label.parentNode?.insertBefore(chip, label.nextSibling);
      }
    }

    const localTargets = findLabelsByExactText('SKU Shop nội địa');
    for (const label of localTargets) {
      const box = document.createElement('div');
      box.className = 'merly-inline-box';
      box.textContent = `Merly Convert: ${formatVnd(vnd)}₫ → tự điền ${autoFillEl.checked ? 'BẬT' : 'TẮT'}`;
      label.parentNode?.insertBefore(box, label.nextSibling);
    }
  }

  function scanShopeeForm({ forceFill = false } = {}) {
    if (!rates || internalFill) return;

    const localInput = findLocalPriceInput();
    const localValue = normalizeVnd(localInput?.value);
    if (localInput && localValue >= 1000 && autoSyncEl.checked) {
      trackedInput = localInput;
      if (normalizeVnd(vndInput.value) !== localValue) {
        vndInput.value = formatVnd(localValue);
        settings.lastVnd = localValue;
        lastAutoFillKey = '';
        persistSettings();
        renderResults();
      }
      setSource('Nguồn: SKU Shop nội địa');
      panel.classList.remove('merly-hidden');
    }

    if (autoFillEl.checked && normalizeVnd(vndInput.value)) {
      fillMarketInputs({ force: forceFill });
    }
  }

  function queueScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scanShopeeForm(), 180);
  }

  async function init() {
    createUI();
    await loadSettings();
    renderResults();
    await loadRates(false);

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('input', handleInput, true);

    const observer = new MutationObserver(() => {
      queueInlineHints();
      queueScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes.merlyCurrencySettings) return;
      const next = changes.merlyCurrencySettings.newValue;
      if (!next) return;
      settings = {
        ...settings,
        ...next,
        adjustments: { ...settings.adjustments, ...(next.adjustments || {}) }
      };
      autoSyncEl.checked = settings.autoSync !== false;
      autoFillEl.checked = settings.autoFill !== false;
      lastAutoFillKey = '';
      renderResults();
      queueScan();
    });
  }

  init();
})();
