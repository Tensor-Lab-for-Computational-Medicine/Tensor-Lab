/**
 * api.gs
 *
 * Public Web App entry points. The Apps Script is deployed with access set to
 * "Anyone, anonymous". Route incoming GET requests on action.
 *
 * Feature 1 (F1) lives here: getProjectCounts reads the applications tab,
 * tallies all three ranked choice columns, and returns { project_id: count }.
 *
 * No applicant personally identifying data is ever returned by this endpoint.
 */

/** Sheet and cache constants. */
var SHEET_APPLICATIONS = 'applications';
var SHEET_CONTROL = 'control';
var SHEET_REDIRECT_LOG = 'redirect_log';
var SHEET_ERROR_LOG = 'error_log';
var SHEET_RESELECTIONS = 'reselections';

var COUNTS_CACHE_KEY = 'project_counts_v1';
var COUNTS_CACHE_TTL_SECONDS = 60;

var CHOICE_COLUMNS = ['choice_1', 'choice_2', 'choice_3'];

/**
 * Web app router. Inputs: e (Apps Script event). Outputs: JSON ContentService.
 * Supported actions: counts. Everything else returns a 400 style JSON body.
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'counts') {
      return _jsonResponse({ ok: true, counts: getProjectCounts(), generated_at: new Date().toISOString() });
    }
    return _jsonResponse({ ok: false, error: 'unknown_action' });
  } catch (err) {
    _logError('doGet', err);
    return _jsonResponse({ ok: false, error: 'internal_error' });
  }
}

/**
 * Tally ranked choices across all applications. Inputs: none.
 * Output: plain object of form { project_id: count }. Cached for 60 seconds
 * via CacheService to stay well under sheet read quotas.
 */
function getProjectCounts() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(COUNTS_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  var sheet = _getSheet(SHEET_APPLICATIONS);
  var counts = {};
  if (!sheet || sheet.getLastRow() < 2) {
    cache.put(COUNTS_CACHE_KEY, JSON.stringify(counts), COUNTS_CACHE_TTL_SECONDS);
    return counts;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var columnIndexes = CHOICE_COLUMNS
    .map(function (name) { return headers.indexOf(name); })
    .filter(function (idx) { return idx !== -1; });

  if (columnIndexes.length === 0) {
    cache.put(COUNTS_CACHE_KEY, JSON.stringify(counts), COUNTS_CACHE_TTL_SECONDS);
    return counts;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    for (var j = 0; j < columnIndexes.length; j++) {
      var raw = row[columnIndexes[j]];
      if (!raw) continue;
      var projectId = String(raw).trim();
      if (!projectId) continue;
      counts[projectId] = (counts[projectId] || 0) + 1;
    }
  }

  cache.put(COUNTS_CACHE_KEY, JSON.stringify(counts), COUNTS_CACHE_TTL_SECONDS);
  return counts;
}

/** Fetch a named sheet from the configured spreadsheet. Returns null if missing. */
function _getSheet(name) {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID script property is not set. Run setup.gs:initialSetup first.');
  }
  var ss = SpreadsheetApp.openById(spreadsheetId);
  return ss.getSheetByName(name);
}

/** Wrap a JS object as a JSON ContentService response. */
function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Append an error record to the error_log tab. Never throws.
 * Inputs: functionName string, err Error or string. Output: void.
 */
function _logError(functionName, err) {
  try {
    var sheet = _getSheet(SHEET_ERROR_LOG);
    if (!sheet) return;
    var message = (err && err.message) ? err.message : String(err);
    var stack = (err && err.stack) ? err.stack : '';
    sheet.appendRow([new Date(), functionName, message, stack]);
  } catch (_) {
    // Intentionally silent. We cannot surface this failure to applicants.
  }
}
