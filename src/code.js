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

// ---- main ----
const requestPath = getRequestPath();
const requestMethod = getRequestMethod();

if (requestPath === jsPath && requestMethod === 'GET') {
  claimRequest();
  serveTrackerJs();
} else if (requestPath === trackerPath && requestMethod === 'OPTIONS') {
  claimRequest();
  handlePreflight();
}
