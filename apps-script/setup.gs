/**
 * setup.gs
 *
 * One time and occasional setup helpers. Run these manually from the Apps
 * Script editor, not on a schedule.
 *
 * Expected script properties (set under Project Settings, Script properties):
 *   SPREADSHEET_ID        Google Sheet id that holds all five tabs.
 *   APPLICATION_FORM_ID   The main application form id.
 *   RESELECTION_FORM_ID   The reselection form id (may equal the above).
 *   PROJECTS_JSON_URL     Raw URL to data/projects_2026.json.
 */

var REQUIRED_TABS = {
  applications: [
    'timestamp', 'email', 'name', 'school', 'year',
    'choice_1', 'choice_2', 'choice_3',
    'resume_url', 'portfolio_url',
    'response_debugging', 'response_teamwork', 'response_motivation',
    'redirect_token', 'status'
  ],
  reselections: ['timestamp', 'email', 'redirect_token', 'new_choice'],
  control: ['project_id', 'status', 'filled_at', 'selected_applicant'],
  redirect_log: ['timestamp', 'applicant_email', 'project_removed', 'project_added'],
  error_log: ['timestamp', 'function_name', 'message', 'stack']
};

/**
 * Create any missing tabs and header rows on the configured spreadsheet.
 * Inputs: none. Output: void.
 */
function initialSetup() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Set SPREADSHEET_ID script property first.');
  var ss = SpreadsheetApp.openById(spreadsheetId);
  Object.keys(REQUIRED_TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = REQUIRED_TABS[name];
    var existing = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];
    if (existing.join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
  seedControlFromProjects();
}

/**
 * Seed the control tab with one row per project_id from projects_2026.json.
 * Preserves existing status values. Inputs: none. Output: void.
 */
function seedControlFromProjects() {
  var projects = _fetchProjects();
  var control = _getSheet(SHEET_CONTROL);
  var headers = control.getRange(1, 1, 1, control.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var existing = {};
  if (control.getLastRow() >= 2) {
    var rows = control.getRange(2, 1, control.getLastRow() - 1, control.getLastColumn()).getValues();
    rows.forEach(function (r) { existing[String(r[idCol]).trim()] = true; });
  }
  projects.forEach(function (p) {
    if (!existing[p.project_id]) {
      control.appendRow(_rowForHeaders(headers, {
        project_id: p.project_id,
        status: 'open',
        filled_at: '',
        selected_applicant: ''
      }));
    }
  });
}

/**
 * Sync form dropdown options for the three ranked choice questions to match
 * the current projects_2026.json. Safe to rerun. Inputs: none. Output: void.
 */
function syncFormChoices() {
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('APPLICATION_FORM_ID');
  if (!formId) throw new Error('Set APPLICATION_FORM_ID script property first.');

  var projects = _fetchProjects();
  var choices = projects.map(function (p) { return p.project_id + ' :: ' + p.title; });
  var form = FormApp.getFormById(formId);
  var titles = ['choice_1', 'choice_2', 'choice_3'];
  form.getItems().forEach(function (item) {
    if (titles.indexOf(item.getTitle()) === -1) return;
    if (item.getType() !== FormApp.ItemType.LIST) return;
    item.asListItem().setChoiceValues(choices);
  });
}

/**
 * Install form submit triggers. Idempotent. Inputs: none. Output: void.
 */
function installTriggers() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Set SPREADSHEET_ID script property first.');
  var ss = SpreadsheetApp.openById(spreadsheetId);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['onApplicationSubmit', 'handleReselectionSubmit'].indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onApplicationSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('handleReselectionSubmit').forSpreadsheet(ss).onFormSubmit().create();
}

/** Fetch the canonical project list from the configured URL or throw. */
function _fetchProjects() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('PROJECTS_JSON_URL');
  if (!url) throw new Error('Set PROJECTS_JSON_URL script property first.');
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Failed to fetch projects JSON: ' + res.getResponseCode());
  var data = JSON.parse(res.getContentText());
  if (!data || !Array.isArray(data.projects)) throw new Error('Invalid projects JSON.');
  return data.projects;
}
