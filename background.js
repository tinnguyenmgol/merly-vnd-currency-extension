const API_URL = 'https://open.er-api.com/v6/latest/VND';
const TARGETS = ['MYR', 'SGD', 'PHP', 'THB', 'TWD'];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchRates(force = false) {
  const cached = await chrome.storage.local.get(['fxCache']);
  const fxCache = cached.fxCache;
  const fresh = fxCache && Date.now() - fxCache.timestamp < CACHE_TTL_MS;

  if (!force && fresh) return fxCache;

  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.result !== 'success' || !data.rates) throw new Error('Invalid rate response');

    const rates = {};
    for (const code of TARGETS) {
      if (typeof data.rates[code] !== 'number') throw new Error(`Missing ${code}`);
      rates[code] = data.rates[code];
    }

    const result = {
      rates,
      timestamp: Date.now(),
      sourceUpdated: data.time_last_update_utc || null
    };
    await chrome.storage.local.set({ fxCache: result });
    return result;
  } catch (err) {
    if (fxCache?.rates) return { ...fxCache, stale: true, error: err.message };
    throw err;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_RATES') {
    fetchRates(Boolean(message.force))
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
