/**
 * triggers.gs
 *
 * Feature 2 (F2) Applicant Redirection System and the onFormSubmit validator
 * for Feature 3 (F3). All sheet writes run under LockService to avoid race
 * conditions when the counts poller and the form triggers fire at once.
 *
 * All column lookups go through _col(headers, logicalName) which consults
 * FIELD_ALIASES in api.gs. Nothing in this file uses indexOf on a raw string.
 */

/**
 * Flip a project to filled and kick off the redirection flow.
 * Inputs: projectId string, selectedApplicantEmail string.
 * Output: { ok: true, notified: number } or throws on invalid input.
 *
 * This function must only be invoked by leadership from the Apps Script editor
 * or from a leadership only menu. It is not exposed through doGet.
 */
function markProjectFilled(projectId, selectedApplicantEmail) {
  if (!projectId || !selectedApplicantEmail) {
    throw new Error('markProjectFilled requires projectId and selectedApplicantEmail.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var control = _getSheet(SHEET_CONTROL);
    if (!control) throw new Error('control sheet missing');
    var headers = control.getRange(1, 1, 1, control.getLastColumn()).getValues()[0];
    var idCol = headers.indexOf('project_id');
    var statusCol = headers.indexOf('status');
    var filledAtCol = headers.indexOf('filled_at');
    var selectedCol = headers.indexOf('selected_applicant');
    if (idCol < 0 || statusCol < 0) throw new Error('control sheet missing required columns');

    var lastRow = control.getLastRow();
    var targetRow = -1;
    if (lastRow >= 2) {
      var ids = control.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === projectId) {
          targetRow = i + 2;
          break;
        }
      }
    }
    if (targetRow === -1) {
      control.appendRow(_rowForHeaders(headers, {
        project_id: projectId,
        status: 'filled',
        filled_at: new Date(),
        selected_applicant: selectedApplicantEmail
      }));
    } else {
      control.getRange(targetRow, statusCol + 1).setValue('filled');
      if (filledAtCol >= 0) control.getRange(targetRow, filledAtCol + 1).setValue(new Date());
      if (selectedCol >= 0) control.getRange(targetRow, selectedCol + 1).setValue(selectedApplicantEmail);
    }
  } finally {
    lock.releaseLock();
  }

  var notified = notifyDisplacedApplicants(projectId, selectedApplicantEmail);
  CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
  return { ok: true, notified: notified };
}

/**
 * Email every applicant who ranked projectId but was not selected.
 * Inputs: projectId string, selectedApplicantEmail string.
 * Output: number of emails sent this run.
 * Skips applicants already logged for this project in redirect_log.
 */
function notifyDisplacedApplicants(projectId, selectedApplicantEmail) {
  var apps = _getSheet(SHEET_APPLICATIONS);
  if (!apps || apps.getLastRow() < 2) return 0;

  var headers = apps.getRange(1, 1, 1, apps.getLastColumn()).getValues()[0];
  var emailCol = _col(headers, 'email');
  var tokenCol = _col(headers, 'redirect_token');
  var choiceCols = CHOICE_COLUMNS.map(function (c) { return _col(headers, c); });
  if (emailCol < 0 || tokenCol < 0 || choiceCols.indexOf(-1) !== -1) {
    throw new Error('applications sheet missing required columns, check FIELD_ALIASES in api.gs');
  }

  var rows = apps.getRange(2, 1, apps.getLastRow() - 1, apps.getLastColumn()).getValues();
  var alreadyNotified = _alreadyNotifiedSet(projectId);
  var sent = 0;
  var BATCH_LIMIT = 100;

  for (var i = 0; i < rows.length && sent < BATCH_LIMIT; i++) {
    var row = rows[i];
    var email = String(row[emailCol]).trim().toLowerCase();
    if (!email || email === String(selectedApplicantEmail).trim().toLowerCase()) continue;
    var ranks = choiceCols.map(function (c) { return _extractProjectId(row[c]); });
    if (ranks.indexOf(projectId) === -1) continue;
    if (alreadyNotified[email]) continue;

    var survivingChoices = ranks.filter(function (r) { return r && r !== projectId; });
    var token = String(row[tokenCol] || '').trim();
    if (!token) {
      token = Utilities.getUuid();
      apps.getRange(i + 2, tokenCol + 1).setValue(token);
    }

    var prefilledUrl = _buildReselectionUrl(token, survivingChoices);
    _sendReselectionEmail(email, prefilledUrl);
    _appendRedirectLog(email, projectId, '');
    alreadyNotified[email] = true;
    sent++;
  }
  return sent;
}

/**
 * onFormSubmit trigger for the application form. Validates the submission,
 * assigns redirect_token if missing, and rejects duplicates or invalid ids.
 * Inputs: e Apps Script form submit event. Output: void.
 */
function onApplicationSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = _getSheet(SHEET_APPLICATIONS);
    if (!sheet || !e || !e.range) return;
    var row = e.range.getRow();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    var get = function (logical) {
      var idx = _col(headers, logical);
      return idx >= 0 ? String(values[idx] || '').trim() : '';
    };
    var setLogical = function (logical, val) {
      var idx = _col(headers, logical);
      if (idx >= 0) sheet.getRange(row, idx + 1).setValue(val);
    };

    var email = get('email').toLowerCase();
    var token = get('redirect_token');
    var choices = CHOICE_COLUMNS.map(function (c) { return _sanitize(_extractProjectId(get(c))); });
    var validIds = _validProjectIds();

    for (var i = 0; i < choices.length; i++) {
      if (choices[i] && validIds.length > 0 && validIds.indexOf(choices[i]) === -1) {
        setLogical('status', 'rejected_invalid_project');
        _logError('onApplicationSubmit', new Error('Invalid project_id: ' + choices[i] + ' row ' + row));
        return;
      }
    }

    if (!token && _hasOpenApplication(email, row)) {
      setLogical('status', 'rejected_duplicate');
      _logError('onApplicationSubmit', new Error('Duplicate application without token: ' + email + ' row ' + row));
      return;
    }

    if (!token) {
      setLogical('redirect_token', Utilities.getUuid());
    }
    if (!get('status')) setLogical('status', 'submitted');

    CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
  } catch (err) {
    _logError('onApplicationSubmit', err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * onFormSubmit trigger for the reselection form. Reconciles the new third
 * choice into the applicant's original application row, keyed by token.
 * Inputs: e Apps Script form submit event. Output: void.
 */
function handleReselectionSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var reselectSheet = _getSheet(SHEET_RESELECTIONS);
    var appsSheet = _getSheet(SHEET_APPLICATIONS);
    if (!reselectSheet || !appsSheet || !e || !e.range) return;

    var row = e.range.getRow();
    var headers = reselectSheet.getRange(1, 1, 1, reselectSheet.getLastColumn()).getValues()[0];
    var values = reselectSheet.getRange(row, 1, 1, reselectSheet.getLastColumn()).getValues()[0];
    var get = function (logical) {
      var idx = _col(headers, logical);
      return idx >= 0 ? String(values[idx] || '').trim() : '';
    };
    var token = get('redirect_token');
    var newChoice = _sanitize(_extractProjectId(get('new_choice')));
    if (!token || !newChoice) return;

    var validIds = _validProjectIds();
    if (validIds.length > 0 && validIds.indexOf(newChoice) === -1) {
      _logError('handleReselectionSubmit', new Error('Invalid new_choice: ' + newChoice));
      return;
    }

    var appsHeaders = appsSheet.getRange(1, 1, 1, appsSheet.getLastColumn()).getValues()[0];
    var tokenCol = _col(appsHeaders, 'redirect_token');
    var choiceCols = CHOICE_COLUMNS.map(function (c) { return _col(appsHeaders, c); });
    if (tokenCol < 0 || choiceCols.indexOf(-1) !== -1) return;

    var tokens = appsSheet.getRange(2, tokenCol + 1, appsSheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < tokens.length; i++) {
      if (String(tokens[i][0]).trim() === token) {
        var targetRow = i + 2;
        var existing = CHOICE_COLUMNS.map(function (c, idx) {
          return _extractProjectId(appsSheet.getRange(targetRow, choiceCols[idx] + 1).getValue());
        });
        var replacedProject = '';
        for (var j = 0; j < existing.length; j++) {
          if (!existing[j] || _controlStatus(existing[j]) === 'filled') {
            replacedProject = existing[j];
            appsSheet.getRange(targetRow, choiceCols[j] + 1).setValue(newChoice);
            break;
          }
        }
        _appendRedirectLog(_getEmailForRow(appsSheet, appsHeaders, targetRow), replacedProject, newChoice);
        CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
        return;
      }
    }
    _logError('handleReselectionSubmit', new Error('No matching application for token ' + token));
  } catch (err) {
    _logError('handleReselectionSubmit', err);
  } finally {
    lock.releaseLock();
  }
}

/** Load allowed project_id values from the control sheet. */
function _validProjectIds() {
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  if (idCol < 0) return [];
  var values = sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).getValues();
  return values.map(function (r) { return String(r[0]).trim(); }).filter(Boolean);
}

/** Look up control status for a single project_id. Returns '' when missing. */
function _controlStatus(projectId) {
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) return '';
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var statusCol = headers.indexOf('status');
  if (idCol < 0 || statusCol < 0) return '';
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === projectId) {
      return String(values[i][statusCol]).trim();
    }
  }
  return '';
}

/** Return true if email already has a row in applications (excluding currentRow). */
function _hasOpenApplication(email, currentRow) {
  if (!email) return false;
  var sheet = _getSheet(SHEET_APPLICATIONS);
  if (!sheet || sheet.getLastRow() < 2) return false;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var emailCol = _col(headers, 'email');
  if (emailCol < 0) return false;
  var values = sheet.getRange(2, emailCol + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (i + 2 === currentRow) continue;
    if (String(values[i][0]).trim().toLowerCase() === email) return true;
  }
  return false;
}

/** Set of emails already emailed for this project (from redirect_log). */
function _alreadyNotifiedSet(projectId) {
  var out = {};
  var sheet = _getSheet(SHEET_REDIRECT_LOG);
  if (!sheet || sheet.getLastRow() < 2) return out;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var emailCol = headers.indexOf('applicant_email');
  var removedCol = headers.indexOf('project_removed');
  if (emailCol < 0 || removedCol < 0) return out;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][removedCol]).trim() === projectId) {
      out[String(values[i][emailCol]).trim().toLowerCase()] = true;
    }
  }
  return out;
}

/** Append a row to redirect_log. */
function _appendRedirectLog(email, projectRemoved, projectAdded) {
  var sheet = _getSheet(SHEET_REDIRECT_LOG);
  if (!sheet) return;
  sheet.appendRow([new Date(), email, projectRemoved, projectAdded]);
}

/** Email column lookup for a specific row in applications. */
function _getEmailForRow(sheet, headers, row) {
  var idx = _col(headers, 'email');
  if (idx < 0) return '';
  return String(sheet.getRange(row, idx + 1).getValue() || '').trim();
}

/** Build a row array ordered by header names from an object of values. */
function _rowForHeaders(headers, obj) {
  return headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; });
}

/** Strip control characters and trim. Treats every applicant input as untrusted. */
function _sanitize(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[\x00-\x1F\x7F]/g, '').trim();
}
