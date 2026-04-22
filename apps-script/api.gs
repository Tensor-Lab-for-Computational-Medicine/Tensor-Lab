/**
 * api.gs
 *
 * Public Web App entry points. The Apps Script is deployed with access set to
 * "Anyone, anonymous". Route incoming GET requests on action.
 *
 * Feature 1 (F1) lives here: getProjectCounts reads the applications tab,
 * tallies all three ranked choice columns, and returns { project_id: count }.
 *
 * This file also hosts the shared constants and column alias lookup that
 * triggers.gs and setup.gs reuse. Apps Script merges all .gs files into a
 * single runtime namespace, so these symbols are available everywhere.
 */

/** Sheet and cache constants. */
var SHEET_APPLICATIONS = 'applications';
var SHEET_CONTROL = 'control';
var SHEET_REDIRECT_LOG = 'redirect_log';
var SHEET_ERROR_LOG = 'error_log';
var SHEET_RESELECTIONS = 'reselections';

var COUNTS_CACHE_KEY = 'project_counts_v1';
var COUNTS_CACHE_TTL_SECONDS = 60;

/** Logical names used throughout the code. */
var CHOICE_COLUMNS = ['choice_1', 'choice_2', 'choice_3'];

/**
 * Column alias map.
 *
 * Keys are logical names used in the Apps Script. Values are a list of
 * possible column header strings in the order they should be tried. The first
 * exact match wins. If nothing matches, a case insensitive match is tried.
 *
 * Add new aliases here when the form question titles change. Do not hunt for
 * indexOf calls scattered through the code, they all route through _col.
 */
var FIELD_ALIASES = {
  timestamp:            ['timestamp', 'Timestamp'],
  email:                ['email', 'Email Address', 'Email'],
  name:                 ['name', 'Full name', 'Name'],
  preferred_name:       ['preferred_name', 'Preferred name'],
  pronouns:             ['pronouns', 'Pronouns'],
  phone:                ['phone', 'Phone number'],
  school:               ['school', 'Current (or most recent) institution', 'Institution'],
  program:              ['program', 'Program or major'],
  year:                 ['year', 'What is your current (or highest achieved) academic level?', 'Academic level'],
  graduation_date:      ['graduation_date', 'Expected graduation date for current academic program'],
  linkedin_url:         ['linkedin_url', 'LinkedIn URL'],
  portfolio_url:        ['portfolio_url', 'Personal website or portfolio URL'],
  github_url:           ['github_url', 'GitHub URL'],
  resume_url:           ['resume_url', 'Resume or CV link', 'Resume URL'],
  languages:            ['languages', 'Programming languages and proficiency'],
  ml_frameworks:        ['ml_frameworks', 'ML frameworks and libraries you have used'],
  ml_project:           ['ml_project', 'Describe one ML project you have built end to end'],
  publications:         ['publications', 'Have you published or presented research?'],
  code_sample:          ['code_sample', 'Pick one code sample that best represents your work and link it here. Briefly describe what it shows.'],
  clinical_data:        ['clinical_data', 'Have you worked with clinical or biomedical data before?'],
  choice_1:             ['choice_1', 'First choice project', 'First choice'],
  choice_1_elaborate:   ['choice_1_elaborate', 'Elaborate on your interest in this first project.', 'Elaborate on your interest in this first project. '],
  choice_2:             ['choice_2', 'Second choice project', 'Second choice'],
  choice_2_elaborate:   ['choice_2_elaborate', 'Elaborate on your interest in this second project.', 'Elaborate on your interest in this second project. '],
  choice_3:             ['choice_3', 'Third choice project', 'Third choice'],
  choice_3_elaborate:   ['choice_3_elaborate', 'Elaborate on your interest in this third project.', 'Elaborate on your interest in this third project. '],
  response_debugging:   ['response_debugging', 'Walk us through how you debug a model that is training but not learning. (200 Word Maximum)'],
  response_teamwork:    ['response_teamwork', 'Describe a time you worked on a team toward a shared goal. (200 Word Maximum)'],
  response_motivation:  ['response_motivation', 'Why Tensor Lab? What do you hope to gain? (200 Word Maximum)'],
  response_extra:       ['response_extra', 'Tell us about something you built or learned that is not on your resume. (200 Word Maximum)'],
  commit_hours:         ['commit_hours', 'Can you commit 10 to 15 hours per week from June through August 2026?'],
  absences:             ['absences', 'If you have constraints or planned absences, describe them here.'],
  earliest_start:       ['earliest_start', 'Earliest start date'],
  latest_end:           ['latest_end', 'Latest end date'],
  time_zone:            ['time_zone', 'Time zone you will be working in'],
  other_programs:       ['other_programs', 'List any other summer programs, internships, or jobs you have applied to or accepted.'],
  top_priority:         ['top_priority', 'Is Tensor Lab your top summer priority?'],
  referral:             ['referral', 'How did you hear about Tensor Lab?'],
  anything_else:        ['anything_else', "Is there anything else you'd want us to know?"],
  confirmation:         ['confirmation', 'Do you confirm the following?'],
  redirect_token:       ['redirect_token'],
  resume_upload:        ['resume_upload', 'Resume or CV'],
  status:               ['status', 'Application status']
};

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
    .map(function (name) { return _col(headers, name); })
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
      var projectId = _extractProjectId(raw);
      if (!projectId) continue;
      counts[projectId] = (counts[projectId] || 0) + 1;
    }
  }

  cache.put(COUNTS_CACHE_KEY, JSON.stringify(counts), COUNTS_CACHE_TTL_SECONDS);
  return counts;
}

/**
 * Resolve a logical column name to a column index on a given header row.
 * Tries each alias exact match first, then falls back to a trimmed case
 * insensitive match. Returns -1 when no alias resolves.
 */
function _col(headers, logical) {
  var aliases = FIELD_ALIASES[logical] || [logical];
  for (var i = 0; i < aliases.length; i++) {
    var idx = headers.indexOf(aliases[i]);
    if (idx !== -1) return idx;
  }
  var lower = headers.map(function (h) { return String(h || '').trim().toLowerCase(); });
  for (var j = 0; j < aliases.length; j++) {
    var ix = lower.indexOf(String(aliases[j] || '').trim().toLowerCase());
    if (ix !== -1) return ix;
  }
  return -1;
}

/**
 * Resolve a cell value to a canonical project_id.
 *
 * Three strategies, tried in order:
 *   1. If the cell contains `id :: Title`, return the id half. This matches the
 *      format that syncFormChoices writes.
 *   2. If the raw value matches a known project_id in the control sheet,
 *      return it as is. Covers cases where the form dropdown values are the
 *      project_id slugs directly.
 *   3. Reverse lookup against the `label` column in the control sheet.
 *      Covers cases where the form shows human readable labels set manually,
 *      for example "LLM Driven Patient Simulation (Kaiser, Dr. McLachlan)".
 *
 * Returns empty string when nothing matches.
 */
function _extractProjectId(cellValue) {
  var raw = String(cellValue || '').trim();
  if (!raw) return '';
  var sep = raw.indexOf('::');
  if (sep !== -1) return raw.substring(0, sep).trim();
  var table = _projectIdLookupTable();
  if (table.ids[raw]) return raw;
  var key = raw.toLowerCase();
  if (table.labels[key]) return table.labels[key];
  return raw;
}

/**
 * Build and cache a lookup of known project_ids and their labels, read from
 * the control sheet. Cached in CacheService for 5 minutes to avoid a sheet
 * read on every submission.
 *
 * Shape: { ids: { project_id: true, ... }, labels: { label_lowercase: project_id, ... } }
 */
function _projectIdLookupTable() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('project_id_lookup_v1');
  if (cached) return JSON.parse(cached);

  var out = { ids: {}, labels: {} };
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) return out;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var labelCol = headers.indexOf('label');
  if (idCol < 0) return out;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  rows.forEach(function (r) {
    var id = String(r[idCol] || '').trim();
    if (!id) return;
    out.ids[id] = true;
    if (labelCol >= 0) {
      var label = String(r[labelCol] || '').trim();
      if (label) out.labels[label.toLowerCase()] = id;
    }
  });

  cache.put('project_id_lookup_v1', JSON.stringify(out), 300);
  return out;
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
