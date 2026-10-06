// Pure helpers to read the official DeepSeek usage export (ZIP with
// amount-*.csv + cost-*.csv) and aggregate it per API key.
//
// The live /usage/amount endpoint only breaks usage down by model; the per-key
// breakdown ships in the export. amount columns:
//   user_id, utc_date, model, api_key_name, api_key, type, price, amount
// Newer exports replace utc_date with start_time_iso/end_time_iso.
//
// cost-*.csv has no key column (user_id, utc_date, model, wallet_type, cost,
// currency). It is the source of truth for money: per-key / per-model / per-day
// costs are the official cost values allocated across keys by their share of
// each (day, model) usage weight. Costs are tracked PER CURRENCY — one account
// can be charged in several currencies (e.g. "$0.65 USD + ¥6.04 CNY"), so
// amounts must never be summed across currencies.
//
// Money is a plain object keyed by currency, e.g. { CNY: 6.04, USD: 0.65 }.
// When cost-*.csv is absent the derived Σ(price × amount) is used as a plain
// number (currency unknown; the UI falls back to the balance currency).
//
// Kept free of Electron so it can be unit-tested directly with Node.

const { unzipSync } = require('fflate');

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return Buffer.from(bytes).toString('utf8');
  }
}

// Minimal RFC 4180 CSV reader: quoted fields, embedded commas and doubled
// quotes. Returns an array of rows (each an array of string cells).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function normalizedHeader(text) {
  const rows = parseCsv(String(text || '').slice(0, 8000));
  return Array.isArray(rows[0]) ? rows[0].map((h) => String(h || '').replace(/^\uFEFF/, '').trim()) : [];
}

// The export carries the key value (possibly in clear text), so only a masked
// form is ever surfaced. The full value is never logged or sent to the renderer.
function maskApiKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key.length <= 10) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function extractExportCsv(buffer) {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    // A bare CSV: amount if it has the key columns, otherwise treat as cost.
    const text = decodeUtf8(bytes);
    const header = normalizedHeader(text).map((h) => h.toLowerCase());
    const isAmount = header.includes('api_key_name') || header.includes('api_key');
    return { amountText: isAmount ? text : null, costText: isAmount ? null : text };
  }
  let files;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    return { error: 'unzip' };
  }
  let amountText = null;
  let costText = null;
  for (const [name, data] of Object.entries(files)) {
    const lower = name.toLowerCase();
    if (!lower.endsWith('.csv')) continue;
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    if (base.startsWith('amount')) amountText = decodeUtf8(data);
    else if (base.startsWith('cost')) costText = decodeUtf8(data);
  }
  return { amountText, costText };
}

function modelKeyOf(model) {
  const id = String(model || '').toLowerCase();
  if (id.includes('flash') || id.includes('chat')) return 'flash';
  if (id.includes('pro') || id.includes('reasoner') || id.includes('r1')) return 'pro';
  return null;
}

// ---- money helpers (per-currency maps) ----

function addMoney(map, currency, amount) {
  if (!currency || !Number.isFinite(amount) || amount === 0) return;
  map[currency] = (map[currency] || 0) + amount;
}

function primaryCurrencyOf(totals) {
  let best = null;
  for (const [currency, amount] of Object.entries(totals || {})) {
    if (!best || Math.abs(amount) > Math.abs(best[1])) best = [currency, amount];
  }
  return best ? best[0] : null;
}

// Rounds a currency map and drops zero entries. A map is ALWAYS returned as a
// map, even for a single currency: collapsing it to a bare number would lose
// the currency, and the renderer would then label the amount with a fallback
// currency — e.g. a USD-only day shown as "¥0.19". Numbers (derived costs whose
// currency is unknown) stay numbers so the renderer can use the balance
// currency.
function roundMoney(value) {
  if (typeof value !== 'object' || value === null) {
    const n = Number(value);
    return Number.isFinite(n) ? Number(n.toFixed(4)) : 0;
  }
  const out = {};
  for (const [currency, amount] of Object.entries(value)) {
    const n = Number(amount);
    if (!Number.isFinite(n) || Math.abs(n) < 0.00005) continue;
    out[currency] = Number(n.toFixed(4));
  }
  return out;
}

function moneyNominal(value) {
  if (typeof value !== 'object' || value === null) return Math.abs(Number(value) || 0);
  return Object.values(value).reduce((sum, amount) => sum + Math.abs(Number(amount) || 0), 0);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

// The export timestamps are UTC (`utc_date` is date-only; `start_time_iso`
// carries a timezone). The dashboard compares against the machine's local date,
// so a full timestamp is converted to its local calendar day; a date-only value
// is kept as-is because there is no time to shift it by.
function dayOfColumn(row, iDate) {
  if (iDate < 0) return '';
  const raw = String(row[iDate] || '').trim();
  if (!raw) return '';
  if (raw.length > 10 && (raw[10] === 'T' || raw[10] === ' ')) {
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
    if (hasZone) {
      const ms = Date.parse(raw);
      if (Number.isFinite(ms)) {
        const d = new Date(ms);
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      }
    }
  }
  return raw.slice(0, 10);
}

// Official money per "day|model" and per model, each as a currency map.
function buildCostInfo(costText) {
  const rows = parseCsv(costText || '');
  const empty = { available: false, totals: {}, byDateModel: new Map(), byModel: new Map(), primaryCurrency: null };
  if (rows.length < 2) return empty;

  const header = rows[0].map((h) => String(h || '').replace(/^\uFEFF/, '').trim());
  const idx = (name) => header.indexOf(name);
  const iModel = idx('model');
  const iCost = idx('cost');
  const iCurrency = idx('currency');
  const iDate = idx('utc_date') >= 0 ? idx('utc_date') : idx('start_time_iso');
  if (iModel < 0 || iCost < 0) return empty;

  const totals = {};
  const byModel = new Map();
  const byDateModel = new Map();

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || (row.length === 1 && row[0] === '')) continue;
    const model = String(row[iModel] || '').trim().toLowerCase();
    if (!model) continue;
    const costValue = Number(String(row[iCost] || '').trim());
    if (!Number.isFinite(costValue)) continue;
    const currency = (iCurrency >= 0 ? String(row[iCurrency] || '').trim() : '') || 'CNY';
    const date = dayOfColumn(row, iDate);

    addMoney(totals, currency, costValue);
    if (!byModel.has(model)) byModel.set(model, {});
    addMoney(byModel.get(model), currency, costValue);
    if (date) {
      const key = `${date}|${model}`;
      if (!byDateModel.has(key)) byDateModel.set(key, {});
      addMoney(byDateModel.get(key), currency, costValue);
    }
  }

  return {
    available: byDateModel.size > 0 && Object.keys(totals).length > 0,
    totals,
    byModel,
    byDateModel,
    primaryCurrency: primaryCurrencyOf(totals)
  };
}

// Same shape the live usage API produces, so the renderer can use per-key data
// anywhere it uses `state.usage`.
function emptyUsageDay(date) {
  return {
    date,
    flashTokens: 0, flashCacheHit: 0, flashCacheMiss: 0, flashResponse: 0,
    proTokens: 0, proCacheHit: 0, proCacheMiss: 0, proResponse: 0,
    totalTokens: 0, totalCost: 0
  };
}

function emptyUsageModel(key) {
  return {
    key,
    name: key === 'flash' ? 'V4 Flash' : 'V4 Pro',
    totalTokens: 0,
    requestCount: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    responseTokens: 0,
    cost: 0
  };
}

// Distributive: allocates each (day, model, currency) official cost across keys
// by their share of the same (day, model) usage weight. Returns true when at
// least one cost could be allocated; otherwise the derived costs are kept.
function allocateOfficialCost(keys, globalWeights, costInfo) {
  const byName = new Map();

  for (const [name, item] of keys) {
    const alloc = { byCurrency: {}, byModel: new Map(), byDay: new Map() };
    for (const [weightKey, weight] of item.weights) {
      const officialMap = costInfo.byDateModel.get(weightKey);
      if (!officialMap) continue;
      const totalWeight = globalWeights.get(weightKey) || 0;
      if (totalWeight <= 0) continue;
      const date = weightKey.slice(0, weightKey.indexOf('|'));
      const modelRaw = weightKey.slice(weightKey.indexOf('|') + 1);
      for (const [currency, amount] of Object.entries(officialMap)) {
        const share = amount * (weight / totalWeight);
        addMoney(alloc.byCurrency, currency, share);
        if (!alloc.byModel.has(modelRaw)) alloc.byModel.set(modelRaw, {});
        addMoney(alloc.byModel.get(modelRaw), currency, share);
        if (!alloc.byDay.has(date)) alloc.byDay.set(date, {});
        addMoney(alloc.byDay.get(date), currency, share);
      }
    }
    byName.set(name, alloc);
  }

  let allocatedAny = false;
  for (const alloc of byName.values()) {
    if (Object.keys(alloc.byCurrency).length) { allocatedAny = true; break; }
  }
  if (!allocatedAny) return false;

  // Normalize each currency to its official total so rounding/unmatched days
  // never drift, then write back into the per-key accumulators.
  const allocatedPerCurrency = {};
  for (const alloc of byName.values()) {
    for (const [currency, amount] of Object.entries(alloc.byCurrency)) {
      allocatedPerCurrency[currency] = (allocatedPerCurrency[currency] || 0) + amount;
    }
  }
  const factors = {};
  for (const [currency, officialTotal] of Object.entries(costInfo.totals)) {
    const allocated = allocatedPerCurrency[currency] || 0;
    factors[currency] = allocated > 0 ? officialTotal / allocated : 1;
  }
  const scaleMap = (map) => {
    for (const currency of Object.keys(map)) map[currency] *= factors[currency] ?? 1;
    return map;
  };

  for (const [name, item] of keys) {
    const alloc = byName.get(name);
    item.cost = scaleMap(alloc.byCurrency);
    item.dailyCost = {};
    for (const [date, map] of alloc.byDay) item.dailyCost[date] = scaleMap(map);
    item.models.flash.cost = {};
    item.models.pro.cost = {};
    for (const [modelRaw, map] of alloc.byModel) {
      const label = modelKeyOf(modelRaw);
      if (label) {
        for (const [currency, amount] of Object.entries(scaleMap(map))) {
          addMoney(item.models[label].cost, currency, amount);
        }
      }
    }
    for (const day of Object.values(item.days)) {
      day.totalCost = { ...(alloc.byDay.get(day.date) || {}) };
      scaleMap(day.totalCost);
    }
  }
  return true;
}

function buildKeyUsage(amountText, unnamedLabel, costInfo) {
  const rows = parseCsv(amountText || '');
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => String(h || '').replace(/^\uFEFF/, '').trim());
  const idx = (name) => header.indexOf(name);
  const iName = idx('api_key_name');
  const iKey = idx('api_key');
  const iType = idx('type');
  const iPrice = idx('price');
  const iAmount = idx('amount');
  const iModel = idx('model');
  const iDate = idx('utc_date') >= 0 ? idx('utc_date') : idx('start_time_iso');
  if (iType < 0 || iAmount < 0 || (iName < 0 && iKey < 0)) return null;

  const keys = new Map();
  // Usage weight per "day|model" across all keys: used to allocate official cost.
  const globalWeights = new Map();
  let dateMin = null;
  let dateMax = null;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || (row.length === 1 && row[0] === '')) continue;
    const rawName = (iName >= 0 ? row[iName] : '') || (iKey >= 0 ? row[iKey] : '');
    const name = String(rawName || '').trim() || unnamedLabel || 'Unknown';
    const type = String(row[iType] || '').trim();
    const amountValue = Number(String(row[iAmount] || '').trim());
    const amount = Number.isFinite(amountValue) ? amountValue : 0;
    const priceValue = iPrice >= 0 ? Number(String(row[iPrice] || '').trim()) : 0;
    const price = Number.isFinite(priceValue) ? priceValue : 0;
    const modelRaw = iModel >= 0 ? String(row[iModel] || '').trim().toLowerCase() : '';
    const dateValue = dayOfColumn(row, iDate);
    if (dateValue) {
      if (!dateMin || dateValue < dateMin) dateMin = dateValue;
      if (!dateMax || dateValue > dateMax) dateMax = dateValue;
    }

    let item = keys.get(name);
    if (!item) {
      item = {
        name,
        maskedKey: '',
        requests: 0,
        cacheHit: 0,
        cacheMiss: 0,
        output: 0,
        cost: 0,
        dailyCost: {},
        weights: new Map(),
        models: { flash: emptyUsageModel('flash'), pro: emptyUsageModel('pro') },
        days: {}
      };
      keys.set(name, item);
    }
    if (!item.maskedKey && iKey >= 0) item.maskedKey = maskApiKey(row[iKey]);

    const isRequest = type === 'request_count';
    const rowCost = !isRequest && price > 0 ? price * amount : 0;
    const label = modelRaw ? modelKeyOf(modelRaw) : null;

    if (isRequest) item.requests += amount;
    else if (type === 'input_cache_hit_tokens') item.cacheHit += amount;
    else if (type === 'input_cache_miss_tokens') item.cacheMiss += amount;
    else if (type === 'output_tokens') item.output += amount;

    if (rowCost > 0) {
      item.cost += rowCost;
      if (dateValue) item.dailyCost[dateValue] = (item.dailyCost[dateValue] || 0) + rowCost;
    }

    // Weight for cost allocation: prefer the row's own cost, fall back to token
    // count when no price is present on a token row.
    const weight = rowCost > 0 ? rowCost : (isRequest ? 0 : Math.abs(amount));
    if (weight > 0 && modelRaw) {
      const weightKey = `${dateValue}|${modelRaw}`;
      item.weights.set(weightKey, (item.weights.get(weightKey) || 0) + weight);
      globalWeights.set(weightKey, (globalWeights.get(weightKey) || 0) + weight);
    }

    // Per-model and per-day usage breakdown, mirroring the live usage shape.
    if (label) {
      const model = item.models[label];
      if (isRequest) model.requestCount += amount;
      else if (type === 'input_cache_hit_tokens') { model.cacheHitTokens += amount; model.totalTokens += amount; }
      else if (type === 'input_cache_miss_tokens') { model.cacheMissTokens += amount; model.totalTokens += amount; }
      else if (type === 'output_tokens') { model.responseTokens += amount; model.totalTokens += amount; }
      model.cost += rowCost;
    }

    if (dateValue) {
      let day = item.days[dateValue];
      if (!day) {
        day = emptyUsageDay(dateValue);
        item.days[dateValue] = day;
      }
      if (!isRequest) {
        day.totalCost += rowCost;
        if (label === 'flash') {
          if (type === 'input_cache_hit_tokens') day.flashCacheHit += amount;
          else if (type === 'input_cache_miss_tokens') day.flashCacheMiss += amount;
          else if (type === 'output_tokens') day.flashResponse += amount;
          day.flashTokens = day.flashCacheHit + day.flashCacheMiss + day.flashResponse;
        } else if (label === 'pro') {
          if (type === 'input_cache_hit_tokens') day.proCacheHit += amount;
          else if (type === 'input_cache_miss_tokens') day.proCacheMiss += amount;
          else if (type === 'output_tokens') day.proResponse += amount;
          day.proTokens = day.proCacheHit + day.proCacheMiss + day.proResponse;
        }
        day.totalTokens = day.flashTokens + day.proTokens;
      }
    }
  }

  let currency = null;
  if (costInfo && costInfo.available) {
    const allocated = allocateOfficialCost(keys, globalWeights, costInfo);
    currency = costInfo.primaryCurrency;
    if (!allocated) {
      // No (day, model) matched (e.g. the two CSVs use different date formats):
      // scale the derived costs to the official primary-currency total.
      const derivedTotal = Array.from(keys.values()).reduce((sum, item) => sum + item.cost, 0);
      const officialTotal = currency ? (costInfo.totals[currency] || 0) : 0;
      const scale = derivedTotal > 0 ? officialTotal / derivedTotal : 0;
      for (const item of keys.values()) {
        item.cost *= scale;
        for (const date of Object.keys(item.dailyCost)) item.dailyCost[date] *= scale;
        item.models.flash.cost *= scale;
        item.models.pro.cost *= scale;
        for (const day of Object.values(item.days)) day.totalCost *= scale;
      }
    }
  }

  const list = Array.from(keys.values()).map((item) => {
    const inputTokens = item.cacheHit + item.cacheMiss;
    const cost = roundMoney(item.cost);
    const dailyCost = {};
    for (const [date, value] of Object.entries(item.dailyCost)) dailyCost[date] = roundMoney(value);
    return {
      name: item.name,
      maskedKey: item.maskedKey,
      requests: Math.round(item.requests),
      cacheHit: Math.round(item.cacheHit),
      cacheMiss: Math.round(item.cacheMiss),
      output: Math.round(item.output),
      tokens: Math.round(item.cacheHit + item.cacheMiss + item.output),
      cost,
      costTotal: moneyNominal(cost),
      dailyCost,
      hitRate: inputTokens > 0 ? item.cacheHit / inputTokens : null,
      usage: {
        models: [item.models.flash, item.models.pro].map((model) => ({
          ...model,
          totalTokens: Math.round(model.totalTokens),
          requestCount: Math.round(model.requestCount),
          cacheHitTokens: Math.round(model.cacheHitTokens),
          cacheMissTokens: Math.round(model.cacheMissTokens),
          responseTokens: Math.round(model.responseTokens),
          cost: roundMoney(model.cost)
        })),
        days: Object.values(item.days)
          .map((day) => ({ ...day, totalCost: roundMoney(day.totalCost) }))
          .sort((a, b) => (a.date < b.date ? -1 : 1)),
        monthCost: cost,
        currency
      }
    };
  }).sort((a, b) => b.costTotal - a.costTotal || b.tokens - a.tokens);

  if (!list.length) return null;

  const totalsCost = {};
  let totalsIsMoneyMap = false;
  let totalsCostNumber = 0;
  for (const item of list) {
    if (typeof item.cost === 'object') {
      totalsIsMoneyMap = true;
      for (const [curr, amount] of Object.entries(item.cost)) addMoney(totalsCost, curr, amount);
    } else {
      totalsCostNumber += Number(item.cost) || 0;
    }
  }
  const totals = {
    keys: list.length,
    requests: list.reduce((sum, item) => sum + item.requests, 0),
    tokens: list.reduce((sum, item) => sum + item.tokens, 0),
    cost: totalsIsMoneyMap ? roundMoney(totalsCost) : Number(totalsCostNumber.toFixed(4))
  };

  return {
    keys: list,
    totals,
    currency,
    dateRange: dateMin && dateMax ? { from: dateMin, to: dateMax } : null
  };
}

// Returns { success: true, data } or { success: false, errorKey, error? }.
// errorKey is an i18n key for the caller to translate.
function parseUsageExportBuffer(buffer, options = {}) {
  const extracted = extractExportCsv(buffer);
  if (extracted.error) return { success: false, errorKey: 'keys.unzipFailed' };
  if (!extracted.amountText) return { success: false, errorKey: 'keys.amountMissing' };
  const costInfo = buildCostInfo(extracted.costText);
  const data = buildKeyUsage(extracted.amountText, options.unnamedLabel, costInfo);
  if (!data) return { success: false, errorKey: 'keys.parseFailed' };
  for (const key of data.keys) key.usage.currency = data.currency;
  return { success: true, data };
}

module.exports = {
  parseCsv,
  maskApiKey,
  extractExportCsv,
  buildCostInfo,
  buildKeyUsage,
  parseUsageExportBuffer
};
