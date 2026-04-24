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
 *
 * The applications tab is driven by a Google Form. This file never overwrites
 * its header row. It only appends a `status` column at the end when missing,
 * because the Apps Script needs a place to write validation outcomes.
 *
 * The reselections tab is also form driven once a reselection form exists.
 * Until then, initialSetup leaves an empty tab in place with the minimum
 * columns the reselection trigger expects.
 */

/** Headers for the tabs this code owns end to end. */
var OWNED_TABS = {
  control: ['project_id', 'label', 'status', 'filled_at', 'selected_applicant'],
  redirect_log: ['timestamp', 'applicant_email', 'project_removed', 'project_added'],
  error_log: ['timestamp', 'function_name', 'message', 'stack']
};

/**
 * Tabs that a Google Form writes to. initialSetup does not overwrite their
 * headers. For `applications` it only ensures a `status` column exists at the
 * end. For `reselections` it seeds a minimal header row only when the tab is
 * empty, so a future form can bind to it.
 */
var FORM_DRIVEN_TABS = ['applications', 'reselections'];

/** Minimum columns the reselection trigger expects to find, by logical name. */
var RESELECTION_MINIMUM_COLUMNS = ['timestamp', 'email', 'redirect_token', 'new_choice'];

/**
 * Create any missing tabs and make sure `status` exists on the applications
 * tab. Safe to rerun. Inputs: none. Output: void.
 */
function initialSetup() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Set SPREADSHEET_ID script property first.');
  var ss = SpreadsheetApp.openById(spreadsheetId);

  Object.keys(OWNED_TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var desired = OWNED_TABS[name];
    var existing = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];
    if (existing.join('|') !== desired.join('|')) {
      sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
      sheet.setFrozenRows(1);
    }
  });

  _ensureApplicationsStatusColumn(ss);
  _ensureReselectionsTab(ss);

  seedControlFromProjects();
}

/**
 * Make sure the applications tab has a `status` column. Appended at the end
 * so existing form driven columns stay untouched. No op if already present.
 */
function _ensureApplicationsStatusColumn(ss) {
  var sheet = ss.getSheetByName(SHEET_APPLICATIONS);
  if (!sheet) {
    throw new Error('The applications tab does not exist yet. Link your Google Form to the spreadsheet and rename the response tab to `applications`, then rerun initialSetup.');
  }
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    throw new Error('The applications tab has no columns yet. Submit one test response through your Google Form so Google creates the header row, then rerun initialSetup.');
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (_col(headers, 'status') >= 0) return;
  sheet.getRange(1, lastCol + 1).setValue('status');
  sheet.setFrozenRows(1);
}

/**
 * Seed the reselections tab with a minimum header row so the trigger has
 * something to look up. Only runs when the tab is missing or empty, so a
 * linked Google Form remains the source of truth once one exists.
 */
function _ensureReselectionsTab(ss) {
  var sheet = ss.getSheetByName(SHEET_RESELECTIONS) || ss.insertSheet(SHEET_RESELECTIONS);
  if (sheet.getLastColumn() > 0) return;
  sheet.getRange(1, 1, 1, RESELECTION_MINIMUM_COLUMNS.length).setValues([RESELECTION_MINIMUM_COLUMNS]);
  sheet.setFrozenRows(1);
}

/**
 * Seed the control tab with one row per project_id from projects_2026.json.
 * Preserves existing status and label values. Inputs: none. Output: void.
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
        label: '',
        status: 'open',
        filled_at: '',
        selected_applicant: ''
      }));
    }
  });
}

/**
 * Copy the current dropdown options from the application form into the
 * `label` column of the control sheet, matched positionally.
 *
 * Precondition: the form's three ranked choice dropdowns list projects in
 * the same order as `projects_2026.json`. `seedControlFromProjects` maintains
 * that order. Run this once after the form is built, and again any time you
 * reorder or rename the dropdown options.
 *
 * After this runs, `_extractProjectId` can map human readable dropdown values
 * like "LLM Driven Patient Simulation (Kaiser, Dr. McLachlan)" back to the
 * canonical `llm-ed-triage-simulation` id.
 */
function captureFormLabels() {
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('APPLICATION_FORM_ID');
  if (!formId) throw new Error('Set APPLICATION_FORM_ID script property first.');

  var form = FormApp.openById(formId);
  var items = form.getItems();
  var choiceAliases = FIELD_ALIASES.choice_1 || ['choice_1'];
  var firstChoice = null;
  for (var i = 0; i < items.length && !firstChoice; i++) {
    if (choiceAliases.indexOf(items[i].getTitle()) === -1) continue;
    var t = items[i].getType();
    if (t === FormApp.ItemType.LIST) firstChoice = items[i].asListItem();
    else if (t === FormApp.ItemType.MULTIPLE_CHOICE) firstChoice = items[i].asMultipleChoiceItem();
  }
  if (!firstChoice) throw new Error('Could not find the First choice project dropdown on the form.');

  var labels = firstChoice.getChoices().map(function (c) { return c.getValue(); });

  var control = _getSheet(SHEET_CONTROL);
  var headers = control.getRange(1, 1, 1, control.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var labelCol = headers.indexOf('label');
  if (idCol < 0 || labelCol < 0) {
    throw new Error('control sheet is missing project_id or label. Rerun initialSetup.');
  }
  var lastRow = control.getLastRow();
  if (lastRow < 2) throw new Error('control sheet has no project rows. Run seedControlFromProjects first.');

  var projectCount = lastRow - 1;
  if (labels.length !== projectCount) {
    throw new Error(
      'Form has ' + labels.length + ' dropdown options but control sheet has ' + projectCount + ' projects. ' +
      'Ensure the two are one to one before rerunning captureFormLabels.'
    );
  }

  var range = control.getRange(2, labelCol + 1, projectCount, 1);
  var values = labels.map(function (l) { return [l]; });
  range.setValues(values);

  CacheService.getScriptCache().remove('project_id_lookup_v1');
  CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
}

/**
 * Sync form dropdown options for the three ranked choice questions so the
 * options match the current projects_2026.json. The function looks up
 * questions by title using FIELD_ALIASES, so renaming a question only
 * requires updating the alias list in api.gs. Safe to rerun.
 */
function syncFormChoices() {
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('APPLICATION_FORM_ID');
  if (!formId) throw new Error('Set APPLICATION_FORM_ID script property first.');

  var projects = _fetchProjects();
  var choiceValues = projects.map(function (p) { return p.project_id + ' :: ' + p.title; });
  var form = FormApp.openById(formId);
  var items = form.getItems();

  CHOICE_COLUMNS.forEach(function (logical) {
    var aliases = FIELD_ALIASES[logical] || [logical];
    for (var i = 0; i < items.length; i++) {
      var title = items[i].getTitle();
      if (aliases.indexOf(title) === -1) continue;
      var type = items[i].getType();
      if (type === FormApp.ItemType.LIST) {
        items[i].asListItem().setChoiceValues(choiceValues);
      } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
        items[i].asMultipleChoiceItem().setChoiceValues(choiceValues);
      } else {
        throw new Error('Question "' + title + '" must be a Dropdown or Multiple choice item.');
      }
      break;
    }
  });
}

/**
 * Turn on response editing and email collection on the application form.
 * Run once after creating the form. Required for the reselection email to
 * send an edit URL that preserves every answer the applicant already gave.
 * Inputs: none. Output: void.
 */
function enableApplicationEditing() {
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('APPLICATION_FORM_ID');
  if (!formId) throw new Error('Set APPLICATION_FORM_ID script property first.');
  var form = FormApp.openById(formId);
  form.setAllowResponseEdits(true);
  form.setCollectEmail(true);
}

/**
 * Install form submit triggers. Idempotent. Inputs: none. Output: void.
 */
function installTriggers() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Set SPREADSHEET_ID script property first.');
  var ss = SpreadsheetApp.openById(spreadsheetId);

  var managed = ['onApplicationSubmit', 'handleReselectionSubmit', 'onControlEdit', 'onOpenSpreadsheet'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (managed.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onApplicationSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('handleReselectionSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('onControlEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onOpenSpreadsheet').forSpreadsheet(ss).onOpen().create();
}

/**
 * One click refresh for when `data/projects_YYYY.json` has changed. Runs the
 * three idempotent sync steps in the correct order so leadership does not
 * have to remember them:
 *
 *   1. seedControlFromProjects — append control rows for any new project_ids
 *   2. syncFormChoices         — rewrite the three ranked choice dropdowns
 *   3. captureFormLabels       — copy the new dropdown labels into control.label
 *
 * Also clears the counts cache so the public site reflects the new catalog
 * within one poll interval instead of waiting for the 60 second TTL.
 *
 * Safe to rerun. No op if the JSON has not changed. Wired to the Tensor Lab
 * menu in the spreadsheet via onOpenSpreadsheet in triggers.gs.
 */
function refreshCatalogFromJson() {
  seedControlFromProjects();
  syncFormChoices();
  captureFormLabels();
  CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
  CacheService.getScriptCache().remove('project_id_lookup_v1');

  var control = _getSheet(SHEET_CONTROL);
  var projectCount = control && control.getLastRow() > 1 ? control.getLastRow() - 1 : 0;
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Catalog refreshed. ' + projectCount + ' projects in control sheet.',
      'Tensor Lab', 5);
  } catch (_noUi) { /* running from editor, no active spreadsheet UI */ }
  return { ok: true, projectCount: projectCount };
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
