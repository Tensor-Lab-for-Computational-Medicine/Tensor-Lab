/**
 * management.gs
 *
 * Leadership-facing UI for closing a cohort from inside the spreadsheet.
 * Exposes a single modal dialog with four tabs:
 *   - Fill project: pick a project and an applicant from dropdowns, fill it.
 *   - Invite to interview: send an applicant your scheduling link.
 *   - Reject applicant: pick a single pending applicant and send a decline.
 *   - Close cohort: reject every remaining pending applicant in one pass.
 *
 * All user-facing text avoids dashes per the house style. All mutations run
 * through functions in triggers.gs and email.gs, this file is only wiring.
 *
 * Sheet state used:
 *   applications.status  ''|submitted     -> pending (eligible for actions)
 *                        selected          -> winner (set by markProjectFilled)
 *                        rejected          -> manually rejected (set here)
 *                        rejected_*        -> auto-rejected by onApplicationSubmit
 *   control.status       open              -> not yet filled (offered here)
 *                        filled            -> already filled (hidden)
 */

/** Menu handler. Opens the modal. */
function openManagementDialog() {
  var html = HtmlService.createHtmlOutput(_managementDialogHtml())
    .setWidth(560)
    .setHeight(680)
    .setTitle('Tensor Lab Management');
  SpreadsheetApp.getUi().showModalDialog(html, 'Tensor Lab Management');
}

/**
 * Return [{id, label, count}] for every project whose control.status is not
 * filled. Counts come from the cached project counts endpoint.
 */
function mgmtListOpenProjects() {
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var labelCol = headers.indexOf('label');
  var statusCol = headers.indexOf('status');
  if (idCol < 0) return [];

  var counts = _currentProjectCounts();
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var status = statusCol >= 0 ? String(rows[i][statusCol] || '').trim().toLowerCase() : '';
    if (status === 'filled') continue;
    var id = String(rows[i][idCol] || '').trim();
    if (!id) continue;
    var label = labelCol >= 0 ? String(rows[i][labelCol] || '').trim() : '';
    out.push({ id: id, label: label || id, count: counts[id] || 0 });
  }
  out.sort(function (a, b) { return a.label.localeCompare(b.label); });
  return out;
}

/**
 * Return [{email, name, rank, status}] for applicants who ranked projectId
 * and are not already selected or rejected. Sorted by rank then name.
 */
function mgmtListApplicantsForProject(projectId) {
  if (!projectId) return [];
  var rows = _readApplicationRows();
  if (!rows) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < rows.items.length; i++) {
    var r = rows.items[i];
    if (_isTerminalStatus(r.status)) continue;
    var rank = r.choices.indexOf(projectId);
    if (rank === -1) continue;
    var key = r.email.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push({
      email: r.email,
      name: r.name || r.email,
      rank: rank + 1,
      status: r.status || 'submitted'
    });
  }
  out.sort(function (a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Return [{email, name, topChoice}] for every pending applicant (not
 * selected, not rejected). Sorted by name.
 */
function mgmtListPendingApplicants() {
  var rows = _readApplicationRows();
  if (!rows) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < rows.items.length; i++) {
    var r = rows.items[i];
    if (_isTerminalStatus(r.status)) continue;
    var key = r.email.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push({
      email: r.email,
      name: r.name || r.email,
      topChoice: r.choices[0] ? _lookupProjectLabel(r.choices[0]) : ''
    });
  }
  out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return out;
}

/** Dialog-facing wrapper for markProjectFilled that returns a friendly payload. */
function mgmtFillProject(projectId, email, fromEmail) {
  if (!projectId || !email) throw new Error('Pick both a project and an applicant.');
  var result = markProjectFilled(projectId, email, fromEmail);
  return { projectId: projectId, email: email, notified: result.notified };
}

/** Dialog-facing wrapper for rejectApplicant. */
function mgmtRejectApplicant(email, personalNote, fromEmail) {
  return rejectApplicant(email, personalNote || '', fromEmail);
}

/**
 * Remove test applications by email, reset any projects selected by those
 * emails, clear related logs, resync form choices, and clear public caches.
 */
function mgmtRemoveTestApplications(emailText, resetProjects) {
  var emails = _parseEmailList(emailText);
  if (emails.length === 0) throw new Error('Enter at least one email address.');
  var emailSet = {};
  emails.forEach(function (e) { emailSet[e] = true; });

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var result = {
      emails: emails,
      applicationsDeleted: _deleteRowsByEmail(SHEET_APPLICATIONS, emailSet, 'email'),
      reselectionsDeleted: _deleteRowsByEmail(SHEET_RESELECTIONS, emailSet, 'email'),
      redirectLogsDeleted: _deleteRowsByEmail(SHEET_REDIRECT_LOG, emailSet, 'applicant_email'),
      interviewLogsDeleted: _deleteRowsByEmail(SHEET_INTERVIEW_LOG, emailSet, 'email'),
      projectsReset: resetProjects ? _resetProjectsSelectedBy(emailSet) : []
    };
  } finally {
    lock.releaseLock();
  }

  _refreshProjectSurfaces();
  return result;
}

/**
 * Create two synthetic applications and run a constrained fill workflow.
 * Only the two supplied test emails are contacted, so real applicants who
 * ranked the same project are not notified during testing.
 */
function mgmtRunDummyWorkflowTest(projectId, winnerEmail, displacedEmail, fromEmail, keepFilled) {
  var pid = String(projectId || '').trim();
  var winner = _normalizeTestEmail(winnerEmail);
  var displaced = _normalizeTestEmail(displacedEmail);
  if (!pid) throw new Error('Pick a project to test.');
  if (!winner || !displaced) throw new Error('Enter both test email addresses.');
  if (winner === displaced) throw new Error('Winner and displaced test emails must be different.');
  if (_validProjectIds().indexOf(pid) === -1) throw new Error('Unknown project: ' + pid);

  var emailSet = {};
  emailSet[winner] = true;
  emailSet[displaced] = true;
  var backup = _controlSnapshot(pid);
  var projectLabel = _lookupProjectLabel(pid);
  var displacedToken = '';
  var survivingChoices = [];

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    _deleteRowsByEmail(SHEET_APPLICATIONS, emailSet, 'email');
    _deleteRowsByEmail(SHEET_RESELECTIONS, emailSet, 'email');
    _deleteRowsByEmail(SHEET_REDIRECT_LOG, emailSet, 'applicant_email');
    _deleteRowsByEmail(SHEET_INTERVIEW_LOG, emailSet, 'email');

    var filler = _fallbackProjectChoices(pid);
    _appendSyntheticApplication(winner, 'Test Winner', [pid, filler[0], filler[1]], 'test_selected');
    displacedToken = _appendSyntheticApplication(displaced, 'Test Displaced', [pid, filler[0], filler[1]], 'test_submitted');
    survivingChoices = filler;
    _setProjectFilledForTest(pid, winner);
  } finally {
    lock.releaseLock();
  }

  _refreshProjectSurfaces();
  _sendCongratulationsEmail(winner, projectLabel, fromEmail);
  _appendRedirectLog(winner, '', pid);
  _sendReselectionEmail(displaced, _buildReselectionUrl(displacedToken, survivingChoices), 'reselect', projectLabel, fromEmail);
  _appendRedirectLog(displaced, pid, '');

  if (!keepFilled) {
    _restoreControlSnapshot(backup);
    _refreshProjectSurfaces();
  }

  return {
    projectId: pid,
    projectLabel: projectLabel,
    winnerEmail: winner,
    displacedEmail: displaced,
    keptFilled: !!keepFilled
  };
}

/**
 * Send an applicant a scheduling link for a project interview. Logs the
 * invite to the `interview_log` sheet and remembers the reviewer's name and
 * scheduling URL in user-scoped script properties so repeat invites from the
 * same mentor prefill automatically.
 *
 * Inputs:
 *   projectId      string, required, one of the slugs in control.project_id
 *   email          string, required, an applicant email already in applications
 *   reviewerName   string, required, full name of the mentor running the interview
 *   schedulingUrl  string, required, must start with http:// or https://
 *   personalNote   string, optional, surfaced as a reviewer note paragraph
 *
 * Output: { email, projectId, projectLabel } on success. Throws on validation
 * failure or send failure. Not idempotent, sending twice will deliver two
 * emails, so the dialog confirms before calling.
 */
function mgmtSendInterviewInvite(projectId, email, reviewerName, schedulingUrl, personalNote, fromEmail) {
  var target = String(email || '').trim().toLowerCase();
  var pid = String(projectId || '').trim();
  var reviewer = String(reviewerName || '').trim();
  var url = String(schedulingUrl || '').trim();
  var note = String(personalNote || '').trim();
  if (!pid) throw new Error('Pick a project.');
  if (!target) throw new Error('Pick an applicant.');
  if (!reviewer) throw new Error('Enter your name so the applicant knows who is interviewing them.');
  if (!/^https?:\/\//i.test(url)) throw new Error('Scheduling link must start with http:// or https://');

  var firstName = '';
  var rows = _readApplicationRows();
  if (rows && rows.items) {
    for (var i = 0; i < rows.items.length; i++) {
      if (rows.items[i].email.toLowerCase() === target) {
        firstName = String(rows.items[i].name || '').split(/\s+/)[0];
        break;
      }
    }
  }
  var label = _lookupProjectLabel(pid) || pid;

  _sendInterviewInviteEmail(email, firstName, reviewer, label, url, note, fromEmail);
  _logInterviewInvite(email, pid, reviewer, url, note);

  PropertiesService.getUserProperties().setProperties({
    tl_reviewer_name: reviewer,
    tl_reviewer_url: url
  });

  return { email: email, projectId: pid, projectLabel: label };
}

/** Return { name, url } from user-scoped properties for prefilling the form. */
function mgmtRecallReviewerDefaults() {
  var p = PropertiesService.getUserProperties();
  return {
    name: p.getProperty('tl_reviewer_name') || '',
    url: p.getProperty('tl_reviewer_url') || ''
  };
}

/**
 * Append a row to `interview_log`. Creates the sheet with headers the first
 * time it is used. Never throws, logs errors to the error_log instead, so a
 * logging failure does not hide a successful email from the caller.
 */
function _logInterviewInvite(email, projectId, reviewer, url, note) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(SHEET_INTERVIEW_LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_INTERVIEW_LOG);
      sheet.appendRow(['timestamp', 'email', 'project_id', 'reviewer', 'scheduling_url', 'note']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 6, 160);
    }
    sheet.appendRow([new Date(), email, projectId, reviewer, url, note]);
  } catch (err) {
    _logError('_logInterviewInvite', err);
  }
}

/**
 * Reject every applicant currently in pending state. Returns { rejected, errors }.
 *
 * Refuses to run if any project in `control` is still `open`. Losing a single
 * choice is not a rejection, applicants can still match via their other
 * choices, so we only bulk reject after every project has been filled.
 *
 * Idempotent at the per-applicant level via rejectApplicant's own dedup.
 */
function mgmtRejectAllRemaining(fromEmail) {
  var progress = mgmtProjectFillProgress();
  if (progress.openProjectCount > 0) {
    throw new Error(
      'Cannot close the cohort yet. ' + progress.openProjectCount +
      ' project(s) are still open: ' + progress.openProjectIds.join(', ') + '. ' +
      'Fill every project first, then run this.'
    );
  }

  var pending = mgmtListPendingApplicants();
  var rejected = 0;
  var errors = 0;
  for (var i = 0; i < pending.length; i++) {
    try {
      var result = rejectApplicant(pending[i].email, '', fromEmail);
      if (result && result.rejected) rejected++;
    } catch (err) {
      errors++;
      _logError('mgmtRejectAllRemaining', err);
    }
  }
  return { rejected: rejected, errors: errors };
}

/**
 * Return { filled, total, openProjectCount, openProjectIds } describing
 * how far along the selection is. Powers the progress readout on the Close
 * cohort tab and gates mgmtRejectAllRemaining.
 */
function mgmtProjectFillProgress() {
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) {
    return { filled: 0, total: 0, openProjectCount: 0, openProjectIds: [] };
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var statusCol = headers.indexOf('status');
  var labelCol = headers.indexOf('label');
  if (idCol < 0 || statusCol < 0) {
    return { filled: 0, total: 0, openProjectCount: 0, openProjectIds: [] };
  }
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var filled = 0;
  var total = 0;
  var openIds = [];
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][idCol] || '').trim();
    if (!id) continue;
    total++;
    if (String(rows[i][statusCol] || '').trim().toLowerCase() === 'filled') {
      filled++;
    } else {
      var label = labelCol >= 0 ? String(rows[i][labelCol] || '').trim() : '';
      openIds.push(label || id);
    }
  }
  return {
    filled: filled,
    total: total,
    openProjectCount: total - filled,
    openProjectIds: openIds
  };
}

/**
 * Mark a single applicant rejected and send the decline email.
 * Idempotent: skips if applications.status is already rejected or selected.
 * Inputs: email string, personalNote string (may be empty).
 * Output: { email, rejected: bool, skipped: bool, reason?: string }.
 */
function rejectApplicant(email, personalNote, fromEmail) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) throw new Error('email required');

  var firstName = '';
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var apps = _getSheet(SHEET_APPLICATIONS);
    if (!apps || apps.getLastRow() < 2) throw new Error('applications sheet is empty');
    var headers = apps.getRange(1, 1, 1, apps.getLastColumn()).getValues()[0];
    var emailCol = _col(headers, 'email');
    var statusCol = _col(headers, 'status');
    var nameCol = _col(headers, 'preferred_name');
    var fullNameCol = _col(headers, 'name');
    if (emailCol < 0) throw new Error('applications missing email column');

    var values = apps.getRange(2, 1, apps.getLastRow() - 1, apps.getLastColumn()).getValues();
    var targetRow = -1;
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][emailCol] || '').trim().toLowerCase() !== target) continue;
      targetRow = i + 2;
      var preferred = nameCol >= 0 ? String(values[i][nameCol] || '').trim() : '';
      var full = fullNameCol >= 0 ? String(values[i][fullNameCol] || '').trim() : '';
      firstName = preferred || (full ? full.split(/\s+/)[0] : '');
      break;
    }
    if (targetRow === -1) throw new Error('No application found for ' + email);

    if (statusCol >= 0) {
      var current = String(apps.getRange(targetRow, statusCol + 1).getValue() || '').trim().toLowerCase();
      if (current === 'rejected' || current === 'selected') {
        return { email: email, rejected: false, skipped: true, reason: 'already ' + current };
      }
      apps.getRange(targetRow, statusCol + 1).setValue('rejected');
    }
  } finally {
    lock.releaseLock();
  }

  try {
    _sendRejectionEmail(email, firstName, personalNote, fromEmail);
  } catch (err) {
    _logError('rejectApplicant.sendEmail', err);
    throw err;
  }
  CacheService.getScriptCache().remove(COUNTS_CACHE_KEY);
  return { email: email, rejected: true, skipped: false };
}

function _parseEmailList(text) {
  var seen = {};
  return String(text || '')
    .split(/[\s,;]+/)
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e) {
      if (!e || !/@/.test(e) || seen[e]) return false;
      seen[e] = true;
      return true;
    });
}

function _normalizeTestEmail(email) {
  var value = String(email || '').trim().toLowerCase();
  return /.+@.+\..+/.test(value) ? value : '';
}

function _fallbackProjectChoices(projectId) {
  var ids = _validProjectIds().filter(function (id) { return id && id !== projectId; });
  return [ids[0] || projectId, ids[1] || ids[0] || projectId];
}

function _appendSyntheticApplication(email, name, choices, status) {
  var sheet = _getSheet(SHEET_APPLICATIONS);
  if (!sheet) throw new Error('applications sheet missing');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = new Array(headers.length).fill('');
  var put = function (logical, value) {
    var idx = _col(headers, logical);
    if (idx >= 0) row[idx] = value;
  };
  var token = Utilities.getUuid();
  put('timestamp', new Date());
  put('email', email);
  put('name', name);
  put('preferred_name', name);
  put('choice_1', choices[0] || '');
  put('choice_2', choices[1] || '');
  put('choice_3', choices[2] || '');
  put('redirect_token', token);
  put('status', status || 'submitted');
  sheet.appendRow(row);
  return token;
}

function _controlSnapshot(projectId) {
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('control sheet missing');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  if (idCol < 0) throw new Error('control sheet missing project_id');
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idCol] || '').trim() === projectId) {
      return { row: i + 2, headers: headers, values: rows[i] };
    }
  }
  throw new Error('Project not found in control sheet: ' + projectId);
}

function _setProjectFilledForTest(projectId, selectedEmail) {
  var snap = _controlSnapshot(projectId);
  var statusCol = snap.headers.indexOf('status');
  var filledAtCol = snap.headers.indexOf('filled_at');
  var selectedCol = snap.headers.indexOf('selected_applicant');
  if (statusCol < 0) throw new Error('control sheet missing status');
  var sheet = _getSheet(SHEET_CONTROL);
  sheet.getRange(snap.row, statusCol + 1).setValue('filled');
  if (filledAtCol >= 0) sheet.getRange(snap.row, filledAtCol + 1).setValue(new Date());
  if (selectedCol >= 0) sheet.getRange(snap.row, selectedCol + 1).setValue(selectedEmail);
}

function _restoreControlSnapshot(snap) {
  if (!snap || !snap.row || !snap.values) return;
  _getSheet(SHEET_CONTROL).getRange(snap.row, 1, 1, snap.values.length).setValues([snap.values]);
}

function _deleteRowsByEmail(sheetName, emailSet, logicalOrHeader) {
  var sheet = _getSheet(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var deleted = 0;
  for (var i = values.length - 1; i >= 0; i--) {
    if (!_rowContainsEmail(values[i], emailSet)) continue;
    sheet.deleteRow(i + 2);
    deleted++;
  }
  return deleted;
}

function _rowContainsEmail(row, emailSet) {
  for (var i = 0; i < row.length; i++) {
    var value = String(row[i] || '').toLowerCase();
    for (var email in emailSet) {
      if (value.indexOf(email) !== -1) return true;
    }
  }
  return false;
}

function _resetProjectsSelectedBy(emailSet) {
  var sheet = _getSheet(SHEET_CONTROL);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('project_id');
  var statusCol = headers.indexOf('status');
  var filledAtCol = headers.indexOf('filled_at');
  var selectedCol = headers.indexOf('selected_applicant');
  if (idCol < 0 || statusCol < 0 || selectedCol < 0) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var reset = [];
  for (var i = 0; i < rows.length; i++) {
    var selected = String(rows[i][selectedCol] || '').trim().toLowerCase();
    if (!_rowContainsEmail([selected], emailSet)) continue;
    var row = i + 2;
    sheet.getRange(row, statusCol + 1).setValue('open');
    sheet.getRange(row, selectedCol + 1).clearContent();
    if (filledAtCol >= 0) sheet.getRange(row, filledAtCol + 1).clearContent();
    reset.push(String(rows[i][idCol] || '').trim());
  }
  return reset.filter(Boolean);
}

/**
 * Stamp the applications row matching email with the given status. Used by
 * markProjectFilled to mark winners as selected. Idempotent. Fails silently
 * if the row is missing (the applicant may have been added manually to
 * control without a matching form submission).
 */
function _stampApplicationStatus(email, status) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return;
  var apps = _getSheet(SHEET_APPLICATIONS);
  if (!apps || apps.getLastRow() < 2) return;
  var headers = apps.getRange(1, 1, 1, apps.getLastColumn()).getValues()[0];
  var emailCol = _col(headers, 'email');
  var statusCol = _col(headers, 'status');
  if (emailCol < 0 || statusCol < 0) return;
  var emails = apps.getRange(2, emailCol + 1, apps.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) {
    if (String(emails[i][0] || '').trim().toLowerCase() === target) {
      apps.getRange(i + 2, statusCol + 1).setValue(status);
      return;
    }
  }
}

/** Read applications once and normalize into { items: [...] }. */
function _readApplicationRows() {
  var apps = _getSheet(SHEET_APPLICATIONS);
  if (!apps || apps.getLastRow() < 2) return null;
  var headers = apps.getRange(1, 1, 1, apps.getLastColumn()).getValues()[0];
  var emailCol = _col(headers, 'email');
  var nameCol = _col(headers, 'preferred_name');
  var fullNameCol = _col(headers, 'name');
  var statusCol = _col(headers, 'status');
  var choiceCols = CHOICE_COLUMNS.map(function (c) { return _col(headers, c); });
  if (emailCol < 0 || choiceCols.indexOf(-1) !== -1) return null;

  var raw = apps.getRange(2, 1, apps.getLastRow() - 1, apps.getLastColumn()).getValues();
  var items = [];
  for (var i = 0; i < raw.length; i++) {
    var email = String(raw[i][emailCol] || '').trim();
    if (!email) continue;
    var preferred = nameCol >= 0 ? String(raw[i][nameCol] || '').trim() : '';
    var full = fullNameCol >= 0 ? String(raw[i][fullNameCol] || '').trim() : '';
    items.push({
      email: email,
      name: preferred || full,
      status: statusCol >= 0 ? String(raw[i][statusCol] || '').trim() : '',
      choices: choiceCols.map(function (c) { return _extractProjectId(raw[i][c]); })
    });
  }
  return { items: items };
}

function _isTerminalStatus(status) {
  var s = String(status || '').trim().toLowerCase();
  return s === 'selected' || s === 'rejected' || s.indexOf('rejected_') === 0 || s.indexOf('test_') === 0;
}

/** Pull counts from the shared cache if present, else compute. */
function _currentProjectCounts() {
  try {
    return getProjectCounts() || {};
  } catch (err) {
    _logError('_currentProjectCounts', err);
    return {};
  }
}

/** Inline HTML for the modal. Single template string so there is one file to paste. */
function _managementDialogHtml() {
  return [
    '<!DOCTYPE html>',
    '<html><head><base target="_top"><style>',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:18px;color:#1a1a1a;font-size:14px}',
    'h1{font-size:15px;margin:0 0 12px;font-weight:600;color:#111}',
    '.tabs{display:flex;border-bottom:1px solid #e1e4e8;margin-bottom:16px}',
    '.tab{padding:8px 14px;cursor:pointer;border-bottom:2px solid transparent;color:#555;font-size:13px;user-select:none}',
    '.tab:hover{color:#0b6bcb}',
    '.tab.active{border-color:#0b6bcb;color:#0b6bcb;font-weight:600}',
    '.panel{display:none}',
    '.panel.active{display:block}',
    'label{display:block;font-size:13px;color:#333;margin:12px 0 4px;font-weight:500}',
    'select,textarea,input[type="text"],input[type="url"]{width:100%;padding:8px;border:1px solid #c4c9d1;border-radius:4px;font-size:13px;box-sizing:border-box;font-family:inherit}',
    'textarea{resize:vertical;min-height:72px}',
    'button{margin-top:16px;padding:9px 16px;font-size:13px;border:none;border-radius:4px;cursor:pointer;font-weight:500}',
    'button.primary{background:#0b6bcb;color:#fff}',
    'button.primary:hover:not(:disabled){background:#0957a8}',
    'button.danger{background:#c0392b;color:#fff}',
    'button.danger:hover:not(:disabled){background:#a5321f}',
    'button:disabled{opacity:.5;cursor:not-allowed}',
    '.meta{font-size:12px;color:#666;margin-top:6px;line-height:1.4}',
    '.status{margin-top:14px;padding:10px 12px;border-radius:4px;font-size:13px;line-height:1.4}',
    '.status.ok{background:#e6f4ea;color:#155724}',
    '.status.err{background:#fdecea;color:#721c24}',
    '.status.warn{background:#fff4de;color:#7a5200}',
    '.hint{font-size:13px;color:#444;line-height:1.5;margin:0 0 8px}',
    '</style></head><body>',
    '<h1>Tensor Lab applicant management</h1>',
    '<label for="senderSelect">Send emails from</label>',
    '<select id="senderSelect">',
    '  <option value="tensorlabucsf@gmail.com">tensorlabucsf@gmail.com</option>',
    '  <option value="tensorlabumsom@gmail.com">tensorlabumsom@gmail.com</option>',
    '</select>',
    '<p class="meta">This sender applies to emails sent from this dialog. Direct control sheet edits use the SEND_FROM_EMAIL script property.</p>',
    '<div class="tabs">',
    '  <div class="tab active" data-panel="fill">Fill project</div>',
    '  <div class="tab" data-panel="interview">Invite to interview</div>',
    '  <div class="tab" data-panel="reject">Reject applicant</div>',
    '  <div class="tab" data-panel="test">Test workflow</div>',
    '  <div class="tab" data-panel="cleanup">Remove test data</div>',
    '  <div class="tab" data-panel="bulk">Close cohort</div>',
    '</div>',

    '<div id="fill" class="panel active">',
    '  <label for="projectSelect">Project to fill</label>',
    '  <select id="projectSelect"><option value="">Loading…</option></select>',
    '  <label for="applicantSelect">Selected applicant</label>',
    '  <select id="applicantSelect" disabled><option value="">Pick a project first</option></select>',
    '  <button id="fillBtn" class="primary" disabled>Fill project and send emails</button>',
    '  <p class="meta">Winner receives a congratulations email. Every other applicant who ranked this project receives a reselection email so they can swap in a new choice. Non-winners are not rejected, they remain pending on their other two choices. Safe to rerun, congrats emails are deduped.</p>',
    '  <div id="fillStatus"></div>',
    '</div>',

    '<div id="interview" class="panel">',
    '  <p class="hint">Send an applicant your scheduling link so they can book an interview slot. Works with Calendly, Cal.com, SavvyCal, Google Calendar appointment pages, or any other service with a share link.</p>',
    '  <label for="ivProjectSelect">Project you are interviewing for</label>',
    '  <select id="ivProjectSelect"><option value="">Loading…</option></select>',
    '  <label for="ivApplicantSelect">Applicant</label>',
    '  <select id="ivApplicantSelect" disabled><option value="">Pick a project first</option></select>',
    '  <label for="ivReviewerName">Your name (shown to the applicant)</label>',
    '  <input id="ivReviewerName" type="text" placeholder="e.g. Aaron Ge" />',
    '  <label for="ivSchedulingUrl">Scheduling link</label>',
    '  <input id="ivSchedulingUrl" type="url" placeholder="https://calendly.com/your-handle/tensor-lab-interview" />',
    '  <label for="ivNote">Optional personal note (appears as a short paragraph in the email)</label>',
    '  <textarea id="ivNote" placeholder="Leave blank for the standard invite copy."></textarea>',
    '  <button id="ivSendBtn" class="primary" disabled>Send interview invite</button>',
    '  <p class="meta">The applicant gets an email introducing you, the project, and the scheduling link. The invite is logged to the interview_log tab. Your name and link are remembered for next time.</p>',
    '  <div id="ivStatus"></div>',
    '</div>',

    '<div id="reject" class="panel">',
    '  <p class="hint">Use this to reject an applicant after technical screening or any explicit decision not to move them forward. Do not reject people just because one of their three choices was filled by someone else, they may still match their other choices.</p>',
    '  <label for="rejectSelect">Applicant to reject</label>',
    '  <select id="rejectSelect"><option value="">Loading…</option></select>',
    '  <label for="rejectNote">Optional note for this applicant (becomes a "note from your reviewer" paragraph in the email)</label>',
    '  <textarea id="rejectNote" placeholder="Leave blank for the standard decline. One or two specific sentences of feedback can be a kind gesture."></textarea>',
    '  <button id="rejectBtn" class="danger" disabled>Reject and send decline email</button>',
    '  <p class="meta">Applicants who have already been selected or rejected are hidden from this list.</p>',
    '  <div id="rejectStatus"></div>',
    '</div>',

    '<div id="test" class="panel">',
    '  <p class="hint">Create two minimal dummy applications and test the fill workflow without emailing real applicants. Only these two addresses receive email.</p>',
    '  <label for="testProjectSelect">Project to test</label>',
    '  <select id="testProjectSelect"><option value="">Loading…</option></select>',
    '  <label for="testWinnerEmail">Winner test email (gets congratulations)</label>',
    '  <input id="testWinnerEmail" type="text" value="aaronge2016@gmail.com" />',
    '  <label for="testDisplacedEmail">Displaced test email (gets reselection)</label>',
    '  <input id="testDisplacedEmail" type="text" value="aaronge2020@gmail.com" />',
    '  <label><input id="testKeepFilled" type="checkbox" checked style="width:auto;margin-right:6px">Leave project filled after the test so I can inspect the website and form</label>',
    '  <button id="testRunBtn" class="primary" disabled>Run dummy fill test</button>',
    '  <p class="meta">This deletes prior rows for those two test emails, creates fresh synthetic applications, sends the two test emails from the selected sender above, and refreshes the form/site state. Use Remove test data afterward to delete the rows and reopen the project.</p>',
    '  <div id="testStatus"></div>',
    '</div>',

    '<div id="cleanup" class="panel">',
    '  <p class="hint">Remove test applications without touching real applicants. Enter one or more test email addresses. If a test email was selected for a project, this can reopen that project and put it back on the form.</p>',
    '  <label for="cleanupEmails">Test email addresses</label>',
    '  <textarea id="cleanupEmails" placeholder="One email per line, for example:\\naaronge2016@gmail.com\\naaronge2020@gmail.com"></textarea>',
    '  <label><input id="cleanupResetProjects" type="checkbox" checked style="width:auto;margin-right:6px">Reopen projects selected by these test emails</label>',
    '  <button id="cleanupBtn" class="danger" disabled>Remove test applications and resync</button>',
    '  <p class="meta">Separate emails with new lines, commas, semicolons, or spaces. Do not use slashes. Deletes matching rows from applications, reselections, redirect_log, and interview_log, then refreshes the form choices and public site cache.</p>',
    '  <div id="cleanupStatus"></div>',
    '</div>',

    '<div id="bulk" class="panel">',
    '  <p class="hint">Use this only at the end of the cohort, after every project has been filled. Losing a single choice does not count as a rejection, applicants stay pending on their other choices until selection closes.</p>',
    '  <div id="bulkProgress" class="status warn">Checking selection progress…</div>',
    '  <button id="bulkBtn" class="danger" disabled>Reject all remaining pending applicants</button>',
    '  <p class="meta">Sends the standard decline email to every applicant still pending. You will be shown the exact count and asked to confirm before any email is sent.</p>',
    '  <div id="bulkStatus"></div>',
    '</div>',

    '<script>',
    'const $=q=>document.querySelector(q);',
    'const $$=q=>document.querySelectorAll(q);',
    'const esc=s=>String(s==null?"":s).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c]));',
    'const sender=()=>$("#senderSelect").value;',
    'const setStatus=(el,msg,kind)=>{el.className="status "+(kind||"ok");el.textContent=msg};',
    'const clearStatus=el=>{el.className="";el.textContent=""};',

    '$$(".tab").forEach(t=>t.addEventListener("click",()=>{',
    '  $$(".tab").forEach(x=>x.classList.remove("active"));',
    '  $$(".panel").forEach(x=>x.classList.remove("active"));',
    '  t.classList.add("active");',
    '  $("#"+t.dataset.panel).classList.add("active");',
    '}));',

    'google.script.run.withSuccessHandler(projects=>{',
    '  const sel=$("#projectSelect");sel.innerHTML="";',
    '  if(!projects.length){sel.innerHTML="<option value=\\"\\">No open projects</option>";return}',
    '  sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '  projects.forEach(p=>sel.insertAdjacentHTML("beforeend",',
    '    "<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '}).withFailureHandler(e=>setStatus($("#fillStatus"),"Could not load projects: "+e.message,"err"))',
    '.mgmtListOpenProjects();',

    '$("#projectSelect").addEventListener("change",()=>{',
    '  const pid=$("#projectSelect").value;const as=$("#applicantSelect");const btn=$("#fillBtn");',
    '  clearStatus($("#fillStatus"));',
    '  if(!pid){as.innerHTML="<option value=\\"\\">Pick a project first</option>";as.disabled=true;btn.disabled=true;return}',
    '  as.innerHTML="<option value=\\"\\">Loading…</option>";as.disabled=true;btn.disabled=true;',
    '  google.script.run.withSuccessHandler(list=>{',
    '    as.innerHTML="";',
    '    if(!list.length){as.innerHTML="<option value=\\"\\">No pending applicants ranked this project</option>";return}',
    '    as.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose an applicant…</option>");',
    '    list.forEach(a=>{',
    '      const label=esc(a.name)+" ("+(a.rank===1?"1st":a.rank===2?"2nd":"3rd")+" choice, "+esc(a.email)+")";',
    '      as.insertAdjacentHTML("beforeend","<option value=\\""+esc(a.email)+"\\">"+label+"</option>");',
    '    });',
    '    as.disabled=false;',
    '  }).withFailureHandler(e=>setStatus($("#fillStatus"),"Could not load applicants: "+e.message,"err"))',
    '  .mgmtListApplicantsForProject(pid);',
    '});',

    '$("#applicantSelect").addEventListener("change",()=>{$("#fillBtn").disabled=!$("#applicantSelect").value});',

    '$("#fillBtn").addEventListener("click",()=>{',
    '  const pid=$("#projectSelect").value;const email=$("#applicantSelect").value;',
    '  const projectLabel=$("#projectSelect").selectedOptions[0].text;',
    '  const st=$("#fillStatus");if(!pid||!email)return;',
    '  if(!confirm("Fill "+projectLabel+" with "+email+"?\\n\\nEmails will send from "+sender()+"."))return;',
    '  $("#fillBtn").disabled=true;setStatus(st,"Sending…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{setStatus(st,"Filled. Congrats email sent to "+r.email+". "+r.notified+" reselection emails sent.","ok");',
    '      google.script.run.withSuccessHandler(projects=>{',
    '        const sel=$("#projectSelect");sel.innerHTML="";',
    '        sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '        projects.forEach(p=>sel.insertAdjacentHTML("beforeend","<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '      }).mgmtListOpenProjects();',
    '      $("#applicantSelect").innerHTML="<option value=\\"\\">Pick a project first</option>";$("#applicantSelect").disabled=true;',
    '      loadInterviewProjects();',
    '      refreshBulkGate();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+e.message,"err");$("#fillBtn").disabled=false})',
    '    .mgmtFillProject(pid,email,sender());',
    '});',

    'function loadInterviewProjects(){',
    '  const sel=$("#ivProjectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  google.script.run.withSuccessHandler(projects=>{',
    '    sel.innerHTML="";',
    '    if(!projects.length){sel.innerHTML="<option value=\\"\\">No open projects</option>";return}',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '    projects.forEach(p=>sel.insertAdjacentHTML("beforeend",',
    '      "<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '  }).withFailureHandler(e=>setStatus($("#ivStatus"),"Could not load projects: "+e.message,"err"))',
    '  .mgmtListOpenProjects();',
    '}',
    'loadInterviewProjects();',

    'google.script.run.withSuccessHandler(d=>{',
    '  if(d.name)$("#ivReviewerName").value=d.name;',
    '  if(d.url)$("#ivSchedulingUrl").value=d.url;',
    '  ivRefreshBtn();',
    '}).mgmtRecallReviewerDefaults();',

    '$("#ivProjectSelect").addEventListener("change",()=>{',
    '  const pid=$("#ivProjectSelect").value;const as=$("#ivApplicantSelect");',
    '  clearStatus($("#ivStatus"));',
    '  if(!pid){as.innerHTML="<option value=\\"\\">Pick a project first</option>";as.disabled=true;ivRefreshBtn();return}',
    '  as.innerHTML="<option value=\\"\\">Loading…</option>";as.disabled=true;',
    '  google.script.run.withSuccessHandler(list=>{',
    '    as.innerHTML="";',
    '    if(!list.length){as.innerHTML="<option value=\\"\\">No pending applicants ranked this project</option>";ivRefreshBtn();return}',
    '    as.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose an applicant…</option>");',
    '    list.forEach(a=>{',
    '      const label=esc(a.name)+" ("+(a.rank===1?"1st":a.rank===2?"2nd":"3rd")+" choice, "+esc(a.email)+")";',
    '      as.insertAdjacentHTML("beforeend","<option value=\\""+esc(a.email)+"\\">"+label+"</option>");',
    '    });',
    '    as.disabled=false;ivRefreshBtn();',
    '  }).withFailureHandler(e=>setStatus($("#ivStatus"),"Could not load applicants: "+e.message,"err"))',
    '  .mgmtListApplicantsForProject(pid);',
    '});',

    'function ivRefreshBtn(){',
    '  const ok=$("#ivProjectSelect").value&&$("#ivApplicantSelect").value&&$("#ivReviewerName").value.trim()&&/^https?:\\/\\//i.test($("#ivSchedulingUrl").value.trim());',
    '  $("#ivSendBtn").disabled=!ok;',
    '}',
    '["#ivApplicantSelect","#ivReviewerName","#ivSchedulingUrl"].forEach(q=>$(q).addEventListener("input",ivRefreshBtn));',
    '$("#ivApplicantSelect").addEventListener("change",ivRefreshBtn);',

    '$("#ivSendBtn").addEventListener("click",()=>{',
    '  const pid=$("#ivProjectSelect").value;const email=$("#ivApplicantSelect").value;',
    '  const reviewer=$("#ivReviewerName").value.trim();const url=$("#ivSchedulingUrl").value.trim();',
    '  const note=$("#ivNote").value.trim();const st=$("#ivStatus");',
    '  const projectLabel=$("#ivProjectSelect").selectedOptions[0].text;',
    '  if(!confirm("Send "+email+" an interview invite for "+projectLabel+"?\\n\\nEmail will send from "+sender()+"."))return;',
    '  $("#ivSendBtn").disabled=true;setStatus(st,"Sending invite…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      setStatus(st,"Invite sent to "+r.email+" for "+r.projectLabel+". Logged to interview_log.","ok");',
    '      $("#ivNote").value="";ivRefreshBtn();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+e.message,"err");ivRefreshBtn();})',
    '    .mgmtSendInterviewInvite(pid,email,reviewer,url,note,sender());',
    '});',

    'function loadPending(){',
    '  const sel=$("#rejectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  google.script.run.withSuccessHandler(list=>{',
    '    sel.innerHTML="";',
    '    if(!list.length){sel.innerHTML="<option value=\\"\\">No pending applicants</option>";return}',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose an applicant…</option>");',
    '    list.forEach(a=>{',
    '      const label=esc(a.name)+" ("+esc(a.email)+")"+(a.topChoice?" — top: "+esc(a.topChoice):"");',
    '      sel.insertAdjacentHTML("beforeend","<option value=\\""+esc(a.email)+"\\">"+label+"</option>");',
    '    });',
    '  }).withFailureHandler(e=>setStatus($("#rejectStatus"),"Could not load applicants: "+e.message,"err"))',
    '  .mgmtListPendingApplicants();',
    '}',
    'loadPending();',

    'function loadTestProjects(){',
    '  const sel=$("#testProjectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  google.script.run.withSuccessHandler(projects=>{',
    '    sel.innerHTML="";',
    '    if(!projects.length){sel.innerHTML="<option value=\\"\\">No open projects</option>";testRefreshBtn();return}',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '    projects.forEach(p=>sel.insertAdjacentHTML("beforeend","<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '    testRefreshBtn();',
    '  }).withFailureHandler(e=>setStatus($("#testStatus"),"Could not load projects: "+e.message,"err"))',
    '  .mgmtListOpenProjects();',
    '}',
    'function testRefreshBtn(){',
    '  const ok=$("#testProjectSelect").value&&$("#testWinnerEmail").value.trim()&&$("#testDisplacedEmail").value.trim();',
    '  $("#testRunBtn").disabled=!ok;',
    '}',
    'loadTestProjects();',
    '["#testProjectSelect","#testWinnerEmail","#testDisplacedEmail"].forEach(q=>$(q).addEventListener("input",testRefreshBtn));',
    '$("#testProjectSelect").addEventListener("change",testRefreshBtn);',
    '$("#testRunBtn").addEventListener("click",()=>{',
    '  const pid=$("#testProjectSelect").value;const win=$("#testWinnerEmail").value.trim();const lose=$("#testDisplacedEmail").value.trim();',
    '  const keep=$("#testKeepFilled").checked;const st=$("#testStatus");const label=$("#testProjectSelect").selectedOptions[0].text;',
    '  if(!pid||!win||!lose)return;',
    '  if(!confirm("Run dummy fill test for "+label+"?\\n\\n"+win+" gets the congratulations email. "+lose+" gets the reselection email. No real applicants will be emailed.\\n\\nEmails send from "+sender()+"."))return;',
    '  $("#testRunBtn").disabled=true;setStatus(st,"Creating synthetic applications and sending test emails…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      setStatus(st,"Test complete for "+r.projectLabel+". Sent congrats to "+r.winnerEmail+" and reselection to "+r.displacedEmail+"."+(r.keptFilled?" Project left filled for inspection. Use Remove test data to reset it.":" Project control state restored."),"ok");',
    '      loadPending();loadInterviewProjects();loadTestProjects();refreshBulkGate();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+e.message,"err");testRefreshBtn();})',
    '    .mgmtRunDummyWorkflowTest(pid,win,lose,sender(),keep);',
    '});',

    '$("#rejectSelect").addEventListener("change",()=>{$("#rejectBtn").disabled=!$("#rejectSelect").value});',

    '$("#rejectBtn").addEventListener("click",()=>{',
    '  const email=$("#rejectSelect").value;const note=$("#rejectNote").value.trim();const st=$("#rejectStatus");',
    '  if(!confirm("Reject "+email+" and send a decline email from "+sender()+"?"+(note?"\\n\\nIncluded reviewer note will appear in the email.":"")))return;',
    '  $("#rejectBtn").disabled=true;setStatus(st,"Sending…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      if(r.skipped)setStatus(st,"Skipped: "+r.reason,"warn");',
    '      else setStatus(st,"Rejected "+r.email+". Decline email sent.","ok");',
    '      $("#rejectNote").value="";loadPending();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+e.message,"err");$("#rejectBtn").disabled=false})',
    '    .mgmtRejectApplicant(email,note,sender());',
    '});',

    'function cleanupRefreshBtn(){',
    '  $("#cleanupBtn").disabled=!$("#cleanupEmails").value.trim();',
    '}',
    '$("#cleanupEmails").addEventListener("input",cleanupRefreshBtn);',
    '$("#cleanupBtn").addEventListener("click",()=>{',
    '  const emails=$("#cleanupEmails").value.trim();const reset=$("#cleanupResetProjects").checked;const st=$("#cleanupStatus");',
    '  if(!emails)return;',
    '  if(!confirm("Remove these test applications and related logs?"+(reset?"\\n\\nProjects selected by these emails will be reopened.":"")))return;',
    '  $("#cleanupBtn").disabled=true;setStatus(st,"Removing test data and resyncing…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      const total=r.applicationsDeleted+r.reselectionsDeleted+r.redirectLogsDeleted+r.interviewLogsDeleted+r.projectsReset.length;',
    '      const msg=total?("Removed "+r.applicationsDeleted+" application rows, "+r.reselectionsDeleted+" reselection rows, "+r.redirectLogsDeleted+" redirect log rows, and "+r.interviewLogsDeleted+" interview log rows."+(r.projectsReset.length?" Reopened: "+r.projectsReset.join(", ")+".":"")):"No matching rows or selected projects found for those emails. Check spelling or run the dummy workflow first."; ',
    '      setStatus(st,msg,total?"ok":"warn");if(total)$("#cleanupEmails").value="";cleanupRefreshBtn();',
    '      google.script.run.withSuccessHandler(projects=>{',
    '        const sel=$("#projectSelect");sel.innerHTML="<option value=\\"\\">Choose a project…</option>";',
    '        projects.forEach(p=>sel.insertAdjacentHTML("beforeend","<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '      }).mgmtListOpenProjects();',
    '      loadInterviewProjects();loadPending();refreshBulkGate();',
    '      loadTestProjects();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+e.message,"err");cleanupRefreshBtn();})',
    '    .mgmtRemoveTestApplications(emails,reset);',
    '});',

    'function refreshBulkGate(){',
    '  const prog=$("#bulkProgress");const btn=$("#bulkBtn");',
    '  google.script.run.withSuccessHandler(p=>{',
    '    if(p.total===0){setStatus(prog,"No projects defined in control sheet.","warn");btn.disabled=true;return}',
    '    if(p.openProjectCount>0){',
    '      setStatus(prog,p.filled+" of "+p.total+" projects filled. Still open: "+p.openProjectIds.join(", ")+". Close every project before rejecting everyone else.","warn");',
    '      btn.disabled=true;',
    '    }else{',
    '      setStatus(prog,"All "+p.total+" projects filled. You can now reject every remaining pending applicant.","ok");',
    '      btn.disabled=false;',
    '    }',
    '  }).withFailureHandler(e=>{setStatus(prog,"Could not read progress: "+e.message,"err");btn.disabled=true})',
    '  .mgmtProjectFillProgress();',
    '}',
    'refreshBulkGate();',

    '$("#bulkBtn").addEventListener("click",()=>{',
    '  const st=$("#bulkStatus");$("#bulkBtn").disabled=true;setStatus(st,"Counting pending applicants…","warn");',
    '  google.script.run.withSuccessHandler(list=>{',
    '    if(!list.length){setStatus(st,"Nothing to do. No pending applicants.","ok");$("#bulkBtn").disabled=false;return}',
    '    if(!confirm("Reject "+list.length+" pending applicants and send decline emails from "+sender()+" to each?\\n\\nThis cannot be undone from this dialog.")){',
    '      $("#bulkBtn").disabled=false;clearStatus(st);return;',
    '    }',
    '    setStatus(st,"Processing "+list.length+" rejections. This can take a moment…","warn");',
    '    google.script.run',
    '      .withSuccessHandler(r=>{',
    '        const msg="Rejected "+r.rejected+" applicants."+(r.errors?" "+r.errors+" errors, see error_log.":"");',
    '        setStatus(st,msg,r.errors?"warn":"ok");loadPending();',
    '      })',
    '      .withFailureHandler(e=>{setStatus(st,"Error: "+e.message,"err");$("#bulkBtn").disabled=false})',
    '      .mgmtRejectAllRemaining(sender());',
    '  }).withFailureHandler(e=>{setStatus(st,"Could not count applicants: "+e.message,"err");$("#bulkBtn").disabled=false})',
    '  .mgmtListPendingApplicants();',
    '});',
    '</script></body></html>'
  ].join('\n');
}
