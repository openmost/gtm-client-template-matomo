const claimRequest = require('claimRequest');
const getRequestPath = require('getRequestPath');
const getRequestMethod = require('getRequestMethod');
const getRequestQueryString = require('getRequestQueryString');
const getRequestBody = require('getRequestBody');
const getRequestHeader = require('getRequestHeader');
const getRemoteAddress = require('getRemoteAddress');
const getCookieValues = require('getCookieValues');
const runContainer = require('runContainer');
const setResponseStatus = require('setResponseStatus');
const setResponseHeader = require('setResponseHeader');
const setResponseBody = require('setResponseBody');
const setPixelResponse = require('setPixelResponse');
const returnResponse = require('returnResponse');
const sendHttpGet = require('sendHttpGet');
const templateDataStorage = require('templateDataStorage');
const getTimestampMillis = require('getTimestampMillis');
const decodeUriComponent = require('decodeUriComponent');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const getType = require('getType');
const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const JSON = require('JSON');
const Object = require('Object');

const ABTESTING_PATH = '/plugins/AbTesting/redirect.php';
const matomoUrl = stripTrailingSlash(data.matomoUrl);
const jsPath = data.jsPath || '/matomo.js';
const trackerPath = data.trackerPath || '/matomo.php';
const jsCacheKey = 'openmost_matomo_js|' + matomoUrl;

function stripTrailingSlash(url) {
  let result = makeString(url || '');
  while (result.length && result.charAt(result.length - 1) === '/') {
    result = result.substring(0, result.length - 1);
  }
  return result;
}

function splitList(value) {
  return makeString(value || '').split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

function log(msg) {
  if (getContainerVersion().debugMode) logToConsole('[Matomo Client] ' + msg);
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  const allowed = splitList(data.allowedOrigins);
  return allowed.length === 0 || allowed.indexOf(origin) !== -1;
}

function setCorsHeaders(origin) {
  if (!origin) return;
  setResponseHeader('Access-Control-Allow-Origin', origin);
  setResponseHeader('Access-Control-Allow-Credentials', 'true');
}

function handlePreflight() {
  const origin = getRequestHeader('origin');
  if (!isOriginAllowed(origin)) {
    setResponseStatus(403);
    returnResponse();
    return;
  }
  setCorsHeaders(origin);
  setResponseHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  setResponseHeader('Access-Control-Allow-Headers', 'Content-Type');
  setResponseStatus(204);
  returnResponse();
}

function sendJs(body, ttlMs) {
  setResponseStatus(200);
  setResponseHeader('Content-Type', 'application/javascript; charset=utf-8');
  setResponseHeader('Cache-Control', 'public, max-age=' + makeString(ttlMs / 1000));
  setResponseBody(body);
  returnResponse();
}

function serveTrackerJs() {
  const ttlMs = makeNumber(data.jsCacheHours || 12) * 3600000;
  const now = getTimestampMillis();
  const cached = templateDataStorage.getItemCopy(jsCacheKey);
  if (cached && cached.body && now - cached.ts < ttlMs) {
    sendJs(cached.body, ttlMs);
    return;
  }
  sendHttpGet(matomoUrl + '/matomo.js', function (statusCode, headers, body) {
    if (statusCode >= 200 && statusCode < 300 && body) {
      templateDataStorage.setItemCopy(jsCacheKey, { body: body, ts: now });
      sendJs(body, ttlMs);
    } else if (cached && cached.body) {
      log('matomo.js fetch failed with status ' + statusCode + ', serving stale copy');
      sendJs(cached.body, ttlMs);
    } else {
      log('matomo.js fetch failed with status ' + statusCode);
      setResponseStatus(502);
      returnResponse();
    }
  }, { timeout: 5000 });
}

function decodeFormComponent(value) {
  return decodeUriComponent(value.split('+').join(' '));
}

function addParam(params, key, value) {
  const existing = params[key];
  if (existing === undefined) {
    params[key] = value;
  } else if (getType(existing) === 'array') {
    existing.push(value);
  } else {
    params[key] = [existing, value];
  }
}

function parseQuery(qs) {
  const params = {};
  let query = makeString(qs || '');
  if (query.charAt(0) === '?') query = query.substring(1);
  query.split('&').forEach(function (pair) {
    if (!pair) return;
    const eq = pair.indexOf('=');
    const key = decodeFormComponent(eq === -1 ? pair : pair.substring(0, eq));
    const value = eq === -1 ? '' : decodeFormComponent(pair.substring(eq + 1));
    if (!key || value === undefined) return;
    addParam(params, key, value);
  });
  return params;
}

function hitValue(hit, key) {
  const value = hit[key];
  return getType(value) === 'array' ? value[0] : value;
}

function extractHits() {
  const queryParams = parseQuery(getRequestQueryString());
  const body = makeString(getRequestBody() || '').trim();
  if (body.charAt(0) === '{') {
    const parsed = JSON.parse(body);
    if (parsed && getType(parsed.requests) === 'array') {
      return parsed.requests.map(function (request) {
        const s = makeString(request);
        const q = s.indexOf('?');
        return parseQuery(q === -1 ? s : s.substring(q + 1));
      });
    }
    return [];
  }
  if (body.length) {
    const bodyParams = parseQuery(body);
    Object.keys(bodyParams).forEach(function (k) { queryParams[k] = bodyParams[k]; });
    return [queryParams];
  }
  return Object.keys(queryParams).length ? [queryParams] : [];
}

function isHeatmapHit(hit) {
  return Object.keys(hit).some(function (k) { return k.indexOf('hsr_') === 0; });
}

const REQUEST_CONTEXT_HEADERS = [
  'referer', 'dnt', 'x-do-not-track',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-ch-ua-platform-version',
  'sec-ch-ua-full-version-list', 'sec-ch-ua-model', 'sec-ch-ua-arch', 'sec-ch-ua-bitness'
];

function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = makeNumber(value);
  return n === n ? n : undefined;
}

function hasKeyPrefix(hit, prefix) {
  return Object.keys(hit).some(function (k) { return k.indexOf(prefix) === 0; });
}

function compact(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

function setCategories(item, categories) {
  categories.slice(0, 5).forEach(function (category, i) {
    item[i === 0 ? 'item_category' : 'item_category' + (i + 1)] = category;
  });
}

function parseItems(raw) {
  if (!raw) return undefined;
  const rows = JSON.parse(raw);
  if (getType(rows) !== 'array') return undefined;
  return rows.map(function (row) {
    const item = { item_id: row[0], item_name: row[1] };
    const categories = getType(row[2]) === 'array' ? row[2] : (row[2] ? [row[2]] : []);
    setCategories(item, categories);
    if (row[3] !== undefined) item.price = toNumber(row[3]);
    if (row[4] !== undefined) item.quantity = toNumber(row[4]);
    return compact(item);
  });
}

function productViewItems(hit) {
  const rawCategory = hitValue(hit, '_pkc');
  let categories = [];
  if (rawCategory) {
    const parsed = rawCategory.charAt(0) === '[' ? JSON.parse(rawCategory) : undefined;
    categories = getType(parsed) === 'array' ? parsed : [rawCategory];
  }
  const item = { item_id: hitValue(hit, '_pks'), item_name: hitValue(hit, '_pkn') };
  setCategories(item, categories);
  item.price = toNumber(hitValue(hit, '_pkp'));
  return [compact(item)];
}

function classifyHit(hit) {
  const v = function (key) { return hitValue(hit, key); };
  if (hasKeyPrefix(hit, 'fa_')) return { event_name: 'matomo_form' };
  if (hasKeyPrefix(hit, 'ma_')) return { event_name: 'matomo_media' };
  if (v('cra') !== undefined) return { event_name: 'matomo_crash' };
  if (v('ping') === '1') return { event_name: 'matomo_ping' };
  const idgoal = v('idgoal');
  if (idgoal === '0' && v('ec_id')) {
    return {
      event_name: 'purchase',
      transaction_id: v('ec_id'),
      value: toNumber(v('revenue')),
      tax: toNumber(v('ec_tx')),
      shipping: toNumber(v('ec_sh')),
      discount: toNumber(v('ec_dt')),
      items: parseItems(v('ec_items'))
    };
  }
  if (idgoal === '0') return { event_name: 'update_cart', value: toNumber(v('revenue')), items: parseItems(v('ec_items')) };
  if (idgoal) return { event_name: 'matomo_goal', goal_id: idgoal, value: toNumber(v('revenue')) };
  if (v('search') !== undefined) {
    return { event_name: 'view_search_results', search_term: v('search'), search_category: v('search_cat'), search_count: toNumber(v('search_count')) };
  }
  if (v('e_c') !== undefined) {
    if (makeString(v('e_c')).toLowerCase() === 'abtesting') {
      return { event_name: 'matomo_abtesting', experiment: v('e_a'), variation: v('e_n') };
    }
    return { event_name: 'matomo_event', event_category: v('e_c'), event_action: v('e_a'), event_label: v('e_n'), value: toNumber(v('e_v')) };
  }
  if (v('c_n') !== undefined) {
    return { event_name: 'matomo_content', content_name: v('c_n'), content_piece: v('c_p'), content_target: v('c_t'), content_interaction: v('c_i') };
  }
  if (v('download') !== undefined) return { event_name: 'file_download', link_url: v('download') };
  if (v('link') !== undefined) return { event_name: 'click', link_url: v('link'), outbound: true };
  if (v('_pks') !== undefined || v('_pkc') !== undefined) return { event_name: 'page_view', items: productViewItems(hit) };
  return { event_name: 'page_view' };
}

function firstLanguage(header) {
  if (!header) return undefined;
  return makeString(header).split(',')[0].split(';')[0].trim();
}

function requestContext() {
  const context = {};
  REQUEST_CONTEXT_HEADERS.forEach(function (name) {
    const value = getRequestHeader(name);
    if (value) context[name] = value;
  });
  const ignore = getCookieValues('matomo_ignore');
  if (ignore && ignore.length) context.ignore_cookie = ignore[0];
  return context;
}

function buildEvent(hit) {
  const event = classifyHit(hit);
  event.page_location = hitValue(hit, 'url');
  event.page_title = hitValue(hit, 'action_name');
  event.page_referrer = hitValue(hit, 'urlref');
  event.client_id = hitValue(hit, '_id') || '';
  event.user_id = hitValue(hit, 'uid');
  event.ip_override = getRemoteAddress();
  event.user_agent = hitValue(hit, 'ua') || getRequestHeader('user-agent');
  event.language = hitValue(hit, 'lang') || firstLanguage(getRequestHeader('accept-language'));
  event.screen_resolution = hitValue(hit, 'res');
  event['x-matomo-hit'] = hit;
  event['x-matomo-idsite'] = hitValue(hit, 'idsite');
  event['x-matomo-request'] = requestContext();
  return compact(event);
}

function handleHits() {
  const origin = getRequestHeader('origin');
  if (!isOriginAllowed(origin)) {
    setResponseStatus(403);
    returnResponse();
    return;
  }
  const wantsImage = getRequestMethod() === 'GET' &&
    hitValue(parseQuery(getRequestQueryString()), 'send_image') === '1';
  const hits = extractHits().filter(function (hit) {
    Object.delete(hit, 'token_auth');
    return hitValue(hit, 'idsite') && !isHeatmapHit(hit);
  });
  const respond = function () {
    setCorsHeaders(origin);
    setResponseHeader('Cache-Control', 'no-store');
    if (wantsImage) {
      setPixelResponse();
    } else {
      setResponseStatus(204);
    }
    returnResponse();
  };
  // Hits run one after another: Matomo must see them in order to attach them to the same visit.
  const runNext = function (index) {
    if (index >= hits.length) {
      respond();
      return;
    }
    runContainer(buildEvent(hits[index]), function () {
      runNext(index + 1);
    });
  };
  runNext(0);
}

function proxyAbTestingRedirect() {
  const qs = getRequestQueryString();
  sendHttpGet(matomoUrl + ABTESTING_PATH + (qs ? '?' + qs : ''), function (statusCode, headers) {
    setResponseStatus(statusCode);
    if (headers && headers.location) setResponseHeader('Location', headers.location);
    setResponseHeader('Cache-Control', 'no-store');
    returnResponse();
  }, { timeout: 5000 });
}

// ---- main ----
const requestPath = getRequestPath();
const requestMethod = getRequestMethod();

if (requestPath === jsPath && requestMethod === 'GET') {
  claimRequest();
  serveTrackerJs();
} else if (requestPath === trackerPath) {
  claimRequest();
  if (requestMethod === 'OPTIONS') {
    handlePreflight();
  } else {
    handleHits();
  }
} else if (data.proxyAbTesting && requestPath === ABTESTING_PATH && requestMethod === 'GET') {
  claimRequest();
  proxyAbTestingRedirect();
}
