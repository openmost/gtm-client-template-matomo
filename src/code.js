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

function buildEvent(hit) {
  return {
    event_name: 'page_view',
    'x-matomo-hit': hit,
    'x-matomo-idsite': hitValue(hit, 'idsite')
  };
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
  let pending = hits.length;
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
  if (pending === 0) {
    respond();
    return;
  }
  hits.forEach(function (hit) {
    runContainer(buildEvent(hit), function () {
      pending = pending - 1;
      if (pending === 0) respond();
    });
  });
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
}
