const MARKETS = [
  { code: 'MYR', name: 'Malaysia', flag: '🇲🇾', symbol: 'RM', decimals: 2 },
  { code: 'SGD', name: 'Singapore', flag: '🇸🇬', symbol: 'S$', decimals: 2 },
  { code: 'PHP', name: 'Philippines', flag: '🇵🇭', symbol: '₱', decimals: 0 },
  { code: 'THB', name: 'Thailand', flag: '🇹🇭', symbol: '฿', decimals: 0 },
  { code: 'TWD', name: 'Taiwan', flag: '🇹🇼', symbol: 'NT$', decimals: 0 }
];

const DEFAULT_SETTINGS = {
  adjustments: Object.fromEntries(MARKETS.map(m => [m.code, 0])),
  useAdjustment: false,
  lastVnd: 340000
};

let rates = null;
let settings = structuredClone(DEFAULT_SETTINGS);

const els = {
  vndInput: document.getElementById('vndInput'),
  results: document.getElementById('results'),
  adjustToggle: document.getElementById('adjustToggle'),
  refreshBtn: document.getElementById('refreshBtn'),
  statusDot: document.getElementById('statusDot'),
  rateStatus: document.getElementById('rateStatus'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  marketSettings: document.getElementById('marketSettings'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn')
};

function normalizeVnd(value) {
  return Number(String(value).replace(/[^0-9]/g, '')) || 0;
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

function renderSettings() {
  els.marketSettings.innerHTML = MARKETS.map(m => `
    <div class="setting-row">
      <label for="adj-${m.code}">${m.flag} ${m.name} (${m.code})</label>
      <div class="percent-input">
        <input id="adj-${m.code}" data-code="${m.code}" type="number" step="0.1" value="${settings.adjustments[m.code] ?? 0}">
        <span>%</span>
      </div>
    </div>
  `).join('');
}

function getConverted(vnd, market) {
  if (!rates?.[market.code] || !vnd) return 0;
  const base = vnd * rates[market.code];
  const adjustment = settings.useAdjustment ? Number(settings.adjustments[market.code] || 0) : 0;
  return base * (1 + adjustment / 100);
}

function renderResults() {
  const vnd = normalizeVnd(els.vndInput.value);
  els.results.innerHTML = MARKETS.map(m => {
    const amount = getConverted(vnd, m);
    const adj = Number(settings.adjustments[m.code] || 0);
    const note = settings.useAdjustment && adj !== 0 ? `<div class="adjust-note">${adj > 0 ? '+' : ''}${adj}% Shopee</div>` : '';
    return `
      <div class="result-row">
        <div class="market">
          <span class="flag">${m.flag}</span>
          <div class="market-meta">
            <div class="market-name">${m.name}</div>
            <div class="market-code">${m.code}</div>
          </div>
        </div>
        <div class="amount-wrap">
          <div class="amount">${amount ? formatMoney(amount, m) : '—'} <button class="copy-btn" data-copy="${amount ? amount.toFixed(m.decimals) : ''}">Copy</button></div>
          ${note}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!btn.dataset.copy) return;
      await navigator.clipboard.writeText(btn.dataset.copy);
      const old = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => btn.textContent = old, 700);
    });
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
  els.adjustToggle.checked = settings.useAdjustment;
  els.vndInput.value = formatVnd(settings.lastVnd || DEFAULT_SETTINGS.lastVnd);
  renderSettings();
}

async function saveSettings() {
  const adjustments = {};
  document.querySelectorAll('[data-code]').forEach(input => {
    adjustments[input.dataset.code] = Number(input.value || 0);
  });
  settings.adjustments = adjustments;
  settings.useAdjustment = els.adjustToggle.checked;
  settings.lastVnd = normalizeVnd(els.vndInput.value);
  await chrome.storage.sync.set({ merlyCurrencySettings: settings });
}

function setStatus(data, isError = false) {
  els.statusDot.className = `dot ${isError ? 'error' : 'ok'}`;
  if (isError) {
    els.rateStatus.textContent = data || 'Không lấy được tỷ giá';
    return;
  }
  const time = data?.timestamp ? new Date(data.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
  els.rateStatus.textContent = data?.stale ? `Đang dùng cache cũ · ${time}` : `Tỷ giá live · cập nhật ${time}`;
}

async function loadRates(force = false) {
  els.rateStatus.textContent = force ? 'Đang cập nhật...' : 'Đang tải tỷ giá...';
  els.statusDot.className = 'dot';
  const response = await chrome.runtime.sendMessage({ type: 'GET_RATES', force });
  if (!response?.ok) {
    setStatus(response?.error || 'Không lấy được tỷ giá', true);
    return;
  }
  rates = response.data.rates;
  setStatus(response.data, false);
  renderResults();
}

els.vndInput.addEventListener('input', async () => {
  const v = normalizeVnd(els.vndInput.value);
  els.vndInput.value = v ? formatVnd(v) : '';
  settings.lastVnd = v;
  renderResults();
  await chrome.storage.sync.set({ merlyCurrencySettings: settings });
});

els.adjustToggle.addEventListener('change', async () => {
  settings.useAdjustment = els.adjustToggle.checked;
  renderResults();
  await saveSettings();
});

els.refreshBtn.addEventListener('click', () => loadRates(true));

els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.resetBtn.addEventListener('click', () => {
  document.querySelectorAll('[data-code]').forEach(input => input.value = 0);
});

els.saveBtn.addEventListener('click', async () => {
  await saveSettings();
  renderResults();
  els.settingsPanel.classList.add('hidden');
});

document.querySelectorAll('[data-vnd]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const v = Number(btn.dataset.vnd);
    els.vndInput.value = formatVnd(v);
    settings.lastVnd = v;
    renderResults();
    await chrome.storage.sync.set({ merlyCurrencySettings: settings });
  });
});

(async function init() {
  await loadSettings();
  renderResults();
  await loadRates(false);
})();
