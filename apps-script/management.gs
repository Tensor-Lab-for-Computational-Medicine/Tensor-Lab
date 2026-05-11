/**
 * management.gs
 *
 * Leadership-facing UI for closing a cohort from inside the spreadsheet.
 * Exposes a single modal dialog with workflow tabs:
 *   - Setup: first-time readiness checklist and account authorization.
 *   - Interviews: send an applicant your scheduling link.
 *   - Match projects: pick a winner, edit winner and reselection emails, fill.
 *   - Closeout and tools: edit decline emails, test, clean up, and close out.
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
    .setWidth(680)
    .setHeight(820)
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
    out.push({ id: id, label: _displayProjectLabel(label || id), count: counts[id] || 0 });
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
function mgmtFillProject(projectId, email, fromEmail, expectedRecipients, emailTemplates) {
  if (!projectId || !email) throw new Error('Pick both a project and an applicant.');
  if (expectedRecipients && expectedRecipients.length !== undefined) {
    var preview = mgmtPreviewFillProject(projectId, email, emailTemplates);
    _assertPreviewEmailsUnchanged(preview.recipients, expectedRecipients);
  }
  var result = markProjectFilled(projectId, email, fromEmail, emailTemplates);
  return { projectId: projectId, email: email, notified: result.notified };
}

/** Dry run for Fill project. Returns exactly who would receive email. */
function mgmtPreviewFillProject(projectId, selectedApplicantEmail, emailTemplates) {
  var pid = String(projectId || '').trim();
  var selected = String(selectedApplicantEmail || '').trim().toLowerCase();
  if (!pid || !selected) throw new Error('Pick both a project and an applicant.');

  var projectLabel = _lookupProjectLabel(pid) || pid;
  var templateSet = _normalizeFillEmailTemplates(emailTemplates, projectLabel);
  if (templateSet.reselection) _assertReselectionTemplateHasLink(templateSet.reselection);
  var alreadyNotified = _alreadyNotifiedSet(pid);
  var recipients = [];
  var skipped = [];
  var seen = {};
  var winnerName = _applicantNameForEmail(selected) || selected;
  var congratsSubject = _templateSubject(
    templateSet.congratulations,
    _buildCongratulationsDraft(projectLabel).subject,
    {
      first_name: _firstNameFromName(winnerName),
      applicant_name: winnerName,
      project: projectLabel,
      project_label: projectLabel
    }
  );
  var reselectionSubject = _templateSubject(
    templateSet.reselection,
    _buildReselectionDraft(projectLabel).subject,
    {
      first_name: 'Applicant',
      applicant_name: 'Applicant',
      project: projectLabel,
      project_label: projectLabel,
      reselection_link: 'https://example.com/reselection-preview',
      link: 'https://example.com/reselection-preview'
    }
  );

  if (_alreadyCongratulated(selected, pid)) {
    skipped.push({
      action: 'Congratulations',
      email: selected,
      name: winnerName,
      reason: 'already congratulated for this project',
      subject: congratsSubject
    });
  } else {
    recipients.push({
      action: 'Congratulations',
      email: selected,
      name: winnerName,
      rank: 'selected',
      project: projectLabel,
      subject: congratsSubject
    });
  }

  var rows = _readApplicationRows();
  if (rows && rows.items) {
    for (var i = 0; i < rows.items.length; i++) {
      var r = rows.items[i];
      var email = String(r.email || '').trim().toLowerCase();
      if (!email || email === selected) continue;
      var rank = r.choices.indexOf(pid);
      if (rank === -1) continue;
      if (_isTerminalStatus(r.status)) {
        skipped.push({
          action: 'Reselection',
          email: email,
          name: r.name || email,
          rank: rank + 1,
          project: projectLabel,
          reason: 'already selected, rejected, or test-only',
          subject: reselectionSubject
        });
        continue;
      }
      if (alreadyNotified[email] || seen[email]) {
        skipped.push({
          action: 'Reselection',
          email: email,
          name: r.name || email,
          rank: rank + 1,
          project: projectLabel,
          reason: alreadyNotified[email] ? 'already sent reselection for this project' : 'duplicate application row',
          subject: reselectionSubject
        });
        continue;
      }
      recipients.push({
        action: 'Reselection',
        email: email,
        name: r.name || email,
        rank: rank + 1,
        project: projectLabel,
        subject: reselectionSubject
      });
      seen[email] = true;
    }
  }

  return {
    projectId: pid,
    projectLabel: projectLabel,
    selectedEmail: selected,
    recipients: recipients,
    skipped: skipped,
    totalToEmail: recipients.length
  };
}

/** Build editable winner and reselection drafts for the Fill project tab. */
function mgmtBuildFillEmailDrafts(projectId, selectedApplicantEmail) {
  var pid = String(projectId || '').trim();
  var selected = String(selectedApplicantEmail || '').trim().toLowerCase();
  if (!pid) throw new Error('Pick a project first.');
  if (!selected) throw new Error('Pick the selected applicant first.');
  var projectLabel = _lookupProjectLabel(pid) || pid;
  var winnerName = _applicantNameForEmail(selected) || '';
  var congrats = _buildCongratulationsDraft(projectLabel);
  var reselection = _buildReselectionDraft(projectLabel);
  return {
    projectId: pid,
    projectLabel: projectLabel,
    selectedEmail: selected,
    selectedName: winnerName,
    congratulations: {
      subject: _applyEmailTemplate(congrats.subject, {
        first_name: _firstNameFromName(winnerName),
        applicant_name: winnerName,
        project: projectLabel,
        project_label: projectLabel
      }),
      body: congrats.body
    },
    reselection: {
      subject: reselection.subject,
      body: reselection.body
    }
  };
}

/** Dialog-facing wrapper for rejectApplicant. */
function mgmtRejectApplicant(email, subjectOrPersonalNote, bodyOrFromEmail, maybeFromEmail) {
  if (arguments.length >= 4) {
    return rejectApplicant(email, '', maybeFromEmail, {
      subject: subjectOrPersonalNote,
      body: bodyOrFromEmail
    });
  }
  return rejectApplicant(email, subjectOrPersonalNote || '', bodyOrFromEmail);
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
 * Build the editable interview invite draft shown in the dialog. This keeps
 * the default copy centralized while letting the sender edit the final subject
 * and body before any email goes out.
 */
function mgmtBuildInterviewInviteDraft(projectId, email, reviewerName, schedulingUrl) {
  var ctx = _interviewInviteContext(projectId, email);
  var reviewer = String(reviewerName || '').trim();
  var url = _assertValidSchedulingUrl(schedulingUrl);
  if (!reviewer) throw new Error('Enter your name so the applicant knows who is interviewing them.');

  var draft = _buildInterviewInviteDraft(ctx.firstName, reviewer, ctx.projectLabel, url);
  return {
    email: ctx.email,
    projectId: ctx.projectId,
    projectLabel: ctx.projectLabel,
    subject: draft.subject,
    body: draft.body
  };
}

/** Build an editable decline draft for one applicant or for the bulk closeout. */
function mgmtBuildRejectionEmailDraft(email, personalNote) {
  var target = String(email || '').trim().toLowerCase();
  var firstName = '';
  var displayName = '';
  if (target) {
    displayName = _applicantNameForEmail(target) || '';
    firstName = _firstNameFromName(displayName);
  }
  var draft = _buildRejectionDraft(firstName, personalNote || '');
  return {
    email: target,
    name: displayName,
    subject: draft.subject,
    body: draft.body
  };
}

/** Send any editable draft to a test recipient with safe sample placeholders. */
function mgmtSendDraftTestEmail(subject, body, fromEmail, testToEmail, action, projectLabel) {
  var to = _normalizeTestEmail(testToEmail);
  if (!to) throw new Error('Enter a test recipient email address.');
  var label = _displayProjectLabel(projectLabel) || 'Sample Tensor Lab project';
  _sendEmailFromTemplate(to, {
    subject: '[Test] ' + String(subject || '').trim(),
    body: String(body || '').trim()
  }, {
    first_name: 'Test',
    applicant_name: 'Test Applicant',
    project: label,
    project_label: label,
    reselection_link: 'https://thetensorlab.org/reselection-preview',
    link: 'https://thetensorlab.org/reselection-preview',
    scheduling_link: 'https://thetensorlab.org',
    reviewer: 'Tensor Lab Team'
  }, action || 'draft_test', label, fromEmail);
  return { email: to };
}

/**
 * Send an applicant an editable interview invite. Logs the invite to the
 * `interview_log` sheet and remembers the reviewer's name and scheduling URL
 * in user-scoped script properties so repeat invites from the same mentor
 * prefill automatically.
 *
 * Inputs:
 *   projectId      string, required, one of the slugs in control.project_id
 *   email          string, required, an applicant email already in applications
 *   reviewerName   string, required, full name of the mentor running the interview
 *   schedulingUrl  string, required, must start with http:// or https://
 *   subject        string, required, editable final subject
 *   body           string, required, editable final plain text body
 *
 * Output: { email, projectId, projectLabel } on success. Throws on validation
 * failure or send failure. Not idempotent, sending twice will deliver two
 * emails, so the dialog confirms before calling.
 */
function mgmtSendInterviewInvite(projectId, email, reviewerName, schedulingUrl, subjectOrPersonalNote, bodyOrFromEmail, maybeFromEmail) {
  var ctx = _interviewInviteContext(projectId, email);
  var reviewer = String(reviewerName || '').trim();
  var url = _assertValidSchedulingUrl(schedulingUrl);
  if (!reviewer) throw new Error('Enter your name so the applicant knows who is interviewing them.');

  var subject = '';
  var body = '';
  var fromEmail = '';
  if (arguments.length >= 7) {
    subject = String(subjectOrPersonalNote || '').trim();
    body = String(bodyOrFromEmail || '').trim();
    fromEmail = maybeFromEmail;
  } else {
    var draft = _buildInterviewInviteDraft(ctx.firstName, reviewer, ctx.projectLabel, url);
    subject = draft.subject;
    body = draft.body;
    var note = String(subjectOrPersonalNote || '').trim();
    if (note) body += '\n\nA note from me:\n\n    ' + note;
    fromEmail = bodyOrFromEmail;
  }
  if (!subject) throw new Error('Enter an email subject.');
  if (!body) throw new Error('Enter an email body.');

  _sendTensorLabEmail({
    to: ctx.email,
    subject: subject,
    body: body,
    action: 'interview',
    project_id: ctx.projectId,
    project_label: ctx.projectLabel
  }, fromEmail);
  _logInterviewInvite(ctx.email, ctx.projectId, reviewer, url, subject, _appendTensorLabLegalFooter(body));

  try {
    PropertiesService.getUserProperties().setProperties({
      tl_reviewer_name: reviewer,
      tl_reviewer_url: url
    });
  } catch (err) {
    if (!_isStoragePermissionError(err)) _logError('mgmtSendInterviewInvite.rememberDefaults', err);
  }

  return { email: ctx.email, projectId: ctx.projectId, projectLabel: ctx.projectLabel };
}

function _interviewInviteContext(projectId, email) {
  var target = String(email || '').trim().toLowerCase();
  var pid = String(projectId || '').trim();
  if (!pid) throw new Error('Pick a project.');
  if (!target) throw new Error('Pick an applicant.');

  var applicantName = '';
  var rows = _readApplicationRows();
  if (rows && rows.items) {
    for (var i = 0; i < rows.items.length; i++) {
      if (rows.items[i].email.toLowerCase() === target) {
        applicantName = String(rows.items[i].name || '').trim();
        break;
      }
    }
  }
  var label = _displayProjectLabel(_lookupProjectLabel(pid) || pid);
  return { email: target, projectId: pid, firstName: applicantName, projectLabel: label };
}

/** Return user-scoped properties for prefilling the interview form. */
function mgmtRecallReviewerDefaults() {
  try {
    var p = PropertiesService.getUserProperties();
    return {
      name: p.getProperty('tl_reviewer_name') || '',
      url: _normalizeSchedulingUrl(p.getProperty('tl_reviewer_url') || ''),
      testEmail: p.getProperty('tl_test_email') || ''
    };
  } catch (err) {
    if (!_isStoragePermissionError(err)) _logError('mgmtRecallReviewerDefaults', err);
    return { name: '', url: '', testEmail: '' };
  }
}

/**
 * Append a row to `interview_log`. Creates the sheet with headers the first
 * time it is used. Never throws, logs errors to the error_log instead, so a
 * logging failure does not hide a successful email from the caller.
 */
function _logInterviewInvite(email, projectId, reviewer, url, subject, body) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(SHEET_INTERVIEW_LOG);
    var desired = ['timestamp', 'email', 'project_id', 'reviewer', 'scheduling_url', 'email_subject', 'email_body'];
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_INTERVIEW_LOG);
      sheet.appendRow(desired);
      sheet.getRange(1, 1, 1, desired.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, desired.length, 160);
    } else {
      var existing = sheet.getLastColumn() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        : [];
      desired.forEach(function (h) {
        if (existing.indexOf(h) !== -1) return;
        sheet.getRange(1, existing.length + 1).setValue(h).setFontWeight('bold');
        existing.push(h);
      });
    }
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.appendRow(_rowForHeaders(headers, {
      timestamp: new Date(),
      email: email,
      project_id: projectId,
      reviewer: reviewer,
      scheduling_url: url,
      email_subject: subject,
      email_body: body
    }));
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
function mgmtRejectAllRemaining(fromEmail, expectedRecipients, emailTemplate) {
  var progress = mgmtProjectFillProgress();
  if (progress.openProjectCount > 0) {
    throw new Error(
      'Cannot close the cohort yet. ' + progress.openProjectCount +
      ' project(s) are still open: ' + progress.openProjectIds.join(', ') + '. ' +
      'Fill every project first, then run this.'
    );
  }

  var pending = mgmtListPendingApplicants();
  if (expectedRecipients && expectedRecipients.length !== undefined) {
    _assertPreviewEmailsUnchanged(pending, expectedRecipients);
  }
  var rejected = 0;
  var errors = 0;
  for (var i = 0; i < pending.length; i++) {
    try {
      var result = rejectApplicant(pending[i].email, '', fromEmail, emailTemplate);
      if (result && result.rejected) rejected++;
    } catch (err) {
      errors++;
      _logError('mgmtRejectAllRemaining', err);
    }
  }
  return { rejected: rejected, errors: errors };
}

/** Dry run for Close cohort. Refuses while any project is still open. */
function mgmtPreviewRejectAllRemaining(emailTemplate) {
  var progress = mgmtProjectFillProgress();
  if (progress.openProjectCount > 0) {
    return {
      ok: false,
      reason: 'projects_open',
      message: progress.openProjectCount + ' project(s) are still open.',
      progress: progress,
      recipients: []
    };
  }
  var pending = mgmtListPendingApplicants();
  var fallback = _buildRejectionDraft('', '');
  var recipients = pending.map(function (p) {
    var subject = _templateSubject(emailTemplate, fallback.subject, {
      first_name: _firstNameFromName(p.name),
      applicant_name: p.name || p.email
    });
    return {
      action: 'Rejection',
      email: p.email,
      name: p.name || p.email,
      project: p.topChoice || '',
      subject: subject
    };
  });
  return {
    ok: true,
    progress: progress,
    recipients: recipients,
    totalToEmail: recipients.length
  };
}

/** Report sender aliases so the dialog can warn before send time. */
function mgmtSenderStatus() {
  var active = '';
  var effective = '';
  try { active = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (_a) {}
  try { effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (_e) {}

  var aliases = [];
  var aliasError = '';
  try {
    aliases = GmailApp.getAliases().map(function (a) { return String(a || '').toLowerCase(); });
  } catch (err) {
    aliasError = (err && err.message) ? String(err.message) : String(err);
  }

  var identity = active || effective;
  var canKnow = !aliasError;
  var senders = TENSOR_LAB_SENDERS.map(function (s) {
    var email = String(s).toLowerCase();
    var available = email === identity || aliases.indexOf(email) !== -1;
    return {
      email: email,
      available: canKnow ? available : true,
      known: canKnow,
      reason: canKnow
        ? (available ? 'available' : 'not returned by Gmail aliases for this account')
        : 'could not read Gmail aliases: ' + aliasError
    };
  });

  return {
    activeUser: active,
    effectiveUser: effective,
    aliases: aliases,
    aliasError: aliasError,
    senders: senders
  };
}

/** Setup checklist for spreadsheet operators opening the dialog for the first time. */
function mgmtSetupStatus() {
  var checks = [];
  var add = function (status, label, detail, setup) {
    checks.push({ status: status, label: label, detail: detail || '', setup: setup || '' });
  };

  var active = '';
  var effective = '';
  try { active = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (_a) {}
  try { effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (_e) {}
  add(
    'ok',
    'Authorize this Google account',
    'This checklist loaded, so the dialog can run at least some Apps Script calls for this account.',
    'For a new operator, click Run authorization check. Accept every Google permission prompt, then reopen Tensor Lab > Manage applicants and refresh this status.'
  );
  add(
    'ok',
    'Google account email visibility',
    active || effective || 'Google did not expose your account email in this context. This is common in Apps Script and does not block sending by itself.',
    'Make sure Google Sheets and Gmail are open in the account you intend to use. If the email is hidden here, rely on the sender alias check below and enter a test recipient manually for test emails.'
  );

  var ss = null;
  try { ss = _activeSpreadsheet(); } catch (_ss) {}
  if (ss) {
    try {
      add(
        'ok',
        'Spreadsheet is accessible',
        ss.getName(),
        'No action needed. New users should open the applications spreadsheet directly and launch the dialog from Tensor Lab > Manage applicants.'
      );
      [SHEET_APPLICATIONS, SHEET_CONTROL, SHEET_REDIRECT_LOG, SHEET_ERROR_LOG].forEach(function (name) {
        var sheet = ss.getSheetByName(name);
        add(
          sheet ? 'ok' : 'err',
          'Sheet tab: ' + name,
          sheet ? 'Found' : 'Missing.',
          sheet
            ? 'No action needed.'
            : 'Ask the script owner to open Apps Script and run initialSetup. That creates the required backend tabs.'
        );
      });
      var emailLog = ss.getSheetByName(SHEET_EMAIL_LOG);
      add(
        emailLog ? 'ok' : 'warn',
        'Sheet tab: ' + SHEET_EMAIL_LOG,
        emailLog ? 'Found' : 'Will be created automatically on the first email attempt, or by initialSetup.',
        emailLog
          ? 'No action needed.'
          : 'This is safe to leave alone. To create it before sending, ask the owner to run initialSetup, or send a test email from the interview tab.'
      );
    } catch (errSheets) {
      add(
        'err',
        'Spreadsheet checks can run',
        (errSheets && errSheets.message) ? errSheets.message : String(errSheets),
        'Confirm this account has Editor access to the applications spreadsheet. If access is correct, ask the owner to open the spreadsheet, reload it, and run Tensor Lab > Authorize this account once.'
      );
    }
  } else {
    add(
      'err',
      'Spreadsheet is accessible',
      'Open this dialog from the bound applications spreadsheet.',
      'Ask the owner to share the applications spreadsheet with Editor access. Then open that spreadsheet and use Tensor Lab > Manage applicants.'
    );
  }

  try {
    var progress = ss
      ? _projectFillProgressFromSheet(ss.getSheetByName(SHEET_CONTROL))
      : { filled: 0, total: 0, openProjectCount: 0, openProjectIds: [] };
    add(
      progress.total > 0 ? 'ok' : 'warn',
      'Project control rows',
      progress.total + ' projects, ' + progress.openProjectCount + ' open.',
      progress.total > 0
        ? 'No setup needed. If the project dropdown says No open projects during testing, use Remove test data > Reopen all projects and resync.'
        : 'Ask the owner to run seedControlFromProjects after PROJECTS_JSON_URL is set.'
    );
  } catch (errProgress) {
    add(
      'err',
      'Project control rows',
      (errProgress && errProgress.message) ? errProgress.message : String(errProgress),
      'Ask the owner to run initialSetup, then seedControlFromProjects, then reopen this dialog.'
    );
  }

  var appFormId = (FALLBACK_CONFIG && FALLBACK_CONFIG.APPLICATION_FORM_ID) || '';
  if (appFormId) {
    try {
      add(
        'ok',
        'Application form is accessible',
        FormApp.openById(appFormId).getTitle(),
        'No action needed. This verifies APPLICATION_FORM_ID points to a form this script can read.'
      );
    } catch (errAppForm) {
      add(
        'err',
        'Application form is accessible',
        (errAppForm && errAppForm.message) ? errAppForm.message : String(errAppForm),
        'Ask the owner to confirm APPLICATION_FORM_ID in Script Properties and FALLBACK_CONFIG, and make sure the script owner can access the form.'
      );
    }
  } else {
    add(
      'warn',
      'Application form is configured',
      'No APPLICATION_FORM_ID found.',
      'Ask the owner to add APPLICATION_FORM_ID under Apps Script Project Settings > Script properties, or update FALLBACK_CONFIG in api.gs.'
    );
  }

  var sender = {
    activeUser: active,
    effectiveUser: effective,
    aliases: [],
    aliasError: '',
    senders: TENSOR_LAB_SENDERS.map(function (s) {
      return { email: s, available: true, known: false, reason: 'not checked yet' };
    })
  };
  try {
    sender = mgmtSenderStatus();
  } catch (errSender) {
    sender.aliasError = (errSender && errSender.message) ? String(errSender.message) : String(errSender);
  }
  var unavailable = sender.senders.filter(function (s) { return s.known && !s.available; }).map(function (s) { return s.email; });
  if (sender.aliasError) {
    add(
      'warn',
      'Gmail senders can be checked',
      sender.aliasError,
      'Click Run authorization check first. If this still warns, open the operator\'s personal Gmail account, then add the Tensor Lab sender under Settings > See all settings > Accounts and Import > Send mail as.'
    );
  } else if (unavailable.length) {
    add(
      'warn',
      'Gmail senders are available',
      'Unavailable for this account: ' + unavailable.join(', ') + '.',
      'In the personal Gmail account used to open this spreadsheet, go to Settings > See all settings > Accounts and Import > Send mail as > Add another email address. Add each unavailable Tensor Lab address and complete Google verification. Do this in the personal account, not inside the shared Tensor Lab inbox.'
    );
  } else {
    add(
      'ok',
      'Gmail senders are available',
      'Both Tensor Lab senders appear usable for this account.',
      'No action needed for this account. Every other operator must repeat Send mail as setup in their own personal Gmail account.'
    );
  }

  try {
    var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    var required = ['onApplicationSubmit', 'handleReselectionSubmit', 'onControlEdit', 'onOpenSpreadsheet'];
    var missing = required.filter(function (fn) { return triggers.indexOf(fn) === -1; });
    add(
      missing.length ? 'warn' : 'ok',
      'Installable triggers visible to this account',
      missing.length
        ? 'Not visible here: ' + missing.join(', ') + '. This can be okay if the owner installed them. Ask the owner to run installTriggers if automations are not working.'
        : 'Required triggers found.',
      missing.length
        ? 'If form submissions, control sheet edits, or the Tensor Lab menu do not work, ask the owner to open Apps Script and run installTriggers.'
        : 'No action needed. Triggers handle form validation, reselections, control edits, and the Tensor Lab menu.'
    );
  } catch (errTriggers) {
    add(
      'warn',
      'Installable triggers can be checked',
      (errTriggers && errTriggers.message) ? errTriggers.message : String(errTriggers),
      'This often only affects non-owner visibility. Ask the owner to run installTriggers if automations are not working.'
    );
  }

  add(
    'ok',
    'Personal defaults storage',
    'Optional. This setup check does not read user storage because Google can block it for shared-script operators.',
    'The interview tab will try to remember your reviewer name, scheduling link, and test recipient. If those fields do not persist, enter them manually each time.'
  );

  return {
    activeUser: active,
    effectiveUser: effective,
    checks: checks,
    sender: sender
  };
}

function _projectFillProgressFromSheet(sheet) {
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
      openIds.push(_displayProjectLabel(label || id));
    }
  }
  return {
    filled: filled,
    total: total,
    openProjectCount: total - filled,
    openProjectIds: openIds
  };
}

/** Send the current editable interview draft to an explicit test recipient. */
function mgmtSendInterviewTestEmail(subject, body, fromEmail, testToEmail) {
  var to = _normalizeTestEmail(testToEmail);
  if (!to) {
    try { to = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (_a) {}
  }
  if (!to) {
    try { to = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (_e) {}
  }
  if (!to) throw new Error('Enter a test recipient email address.');
  var subj = String(subject || '').trim();
  var text = String(body || '').trim();
  if (!subj) throw new Error('Enter an email subject before sending a test.');
  if (!text) throw new Error('Enter an email body before sending a test.');
  _sendTensorLabEmail({
    to: to,
    subject: '[Test] ' + subj,
    body: text,
    action: 'interview_test'
  }, fromEmail);
  try {
    PropertiesService.getUserProperties().setProperty('tl_test_email', to);
  } catch (err) {
    if (!_isStoragePermissionError(err)) _logError('mgmtSendInterviewTestEmail.rememberDefault', err);
  }
  return { email: to };
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
function rejectApplicant(email, personalNote, fromEmail, emailTemplate) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) throw new Error('email required');

  var firstName = '';
  var displayName = '';
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
      displayName = preferred || full;
      firstName = _firstNameFromName(displayName);
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
    if (emailTemplate) {
      var template = _normalizeEmailTemplate(emailTemplate, _buildRejectionDraft(firstName, personalNote));
      _sendEmailFromTemplate(email, template, {
        first_name: firstName,
        applicant_name: displayName || firstName
      }, 'rejection', '', fromEmail);
    } else {
      _sendRejectionEmail(email, firstName, personalNote, fromEmail);
    }
  } catch (err) {
    _logError('rejectApplicant.sendEmail', err);
    throw err;
  }
  _cacheRemove(COUNTS_CACHE_KEY);
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

function _applicantNameForEmail(email) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return '';
  var rows = _readApplicationRows();
  if (!rows || !rows.items) return '';
  for (var i = 0; i < rows.items.length; i++) {
    if (String(rows.items[i].email || '').trim().toLowerCase() === target) {
      return rows.items[i].name || '';
    }
  }
  return '';
}

function _assertPreviewEmailsUnchanged(currentRows, expectedRows) {
  var normalize = function (rows) {
    return (rows || []).map(function (r) {
      return String((r && r.email) || r || '').trim().toLowerCase();
    }).filter(Boolean).sort().join('|');
  };
  if (normalize(currentRows) !== normalize(expectedRows)) {
    throw new Error('The recipient list changed after preview. Preview recipients again before sending.');
  }
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
    '.tabs{display:flex;border-bottom:1px solid #e1e4e8;margin-bottom:16px;gap:4px}',
    '.tab{padding:8px 14px;cursor:pointer;border-bottom:2px solid transparent;color:#555;font-size:13px;user-select:none;white-space:nowrap}',
    '.tab:hover{color:#0b6bcb}',
    '.tab.active{border-color:#0b6bcb;color:#0b6bcb;font-weight:600}',
    '.panel{display:none}',
    '.panel.active{display:block}',
    'label{display:block;font-size:13px;color:#333;margin:12px 0 4px;font-weight:500}',
    'select,textarea,input[type="text"],input[type="url"]{width:100%;padding:8px;border:1px solid #c4c9d1;border-radius:4px;font-size:13px;box-sizing:border-box;font-family:inherit}',
    'textarea{resize:vertical;min-height:72px}',
    '#ivBody,#fillCongratsBody,#fillReselectBody,#rejectBody,#bulkBody{min-height:180px}',
    'button{margin-top:16px;padding:9px 16px;font-size:13px;border:none;border-radius:4px;cursor:pointer;font-weight:500}',
    'button.primary{background:#0b6bcb;color:#fff}',
    'button.primary:hover:not(:disabled){background:#0957a8}',
    'button.secondary{background:#eef2f7;color:#1a1a1a;border:1px solid #c4c9d1}',
    'button.secondary:hover:not(:disabled){background:#e1e7f0}',
    'button.danger{background:#c0392b;color:#fff}',
    'button.danger:hover:not(:disabled){background:#a5321f}',
    'button:disabled{opacity:.5;cursor:not-allowed}',
    '.meta{font-size:12px;color:#666;margin-top:6px;line-height:1.4}',
    '.status{margin-top:14px;padding:10px 12px;border-radius:4px;font-size:13px;line-height:1.4}',
    '.status.ok{background:#e6f4ea;color:#155724}',
    '.status.err{background:#fdecea;color:#721c24}',
    '.status.warn{background:#fff4de;color:#7a5200}',
    '.hint{font-size:13px;color:#444;line-height:1.5;margin:0 0 8px}',
    '.setup-grid{display:grid;gap:8px;margin-top:10px}',
    '.check{display:flex;gap:8px;align-items:flex-start;border:1px solid #d8dee6;border-radius:4px;padding:8px;background:#fff}',
    '.check strong{min-width:42px;text-align:center;border-radius:12px;padding:2px 6px;font-size:11px;box-sizing:border-box}',
    '.check span{line-height:1.35}',
    '.setup-help{margin-top:6px;color:#4b5563;font-size:12px;line-height:1.45}',
    '.setup-help b{color:#374151}',
    '.check.ok strong{background:#e6f4ea;color:#155724}',
    '.check.warn strong{background:#fff4de;color:#7a5200}',
    '.check.err strong{background:#fdecea;color:#721c24}',
    '.setup-steps{padding-left:20px;margin:10px 0 0;color:#444;line-height:1.5;font-size:13px}',
    '.section{margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb}',
    '.section:first-child{margin-top:0;padding-top:0;border-top:0}',
    '.section h2{font-size:13px;margin:0 0 8px;color:#111;font-weight:700}',
    '.split{border:0;border-top:1px solid #e5e7eb;margin:20px 0}',
    '.toolbox{margin-top:12px;border:1px solid #d8dee6;border-radius:4px;background:#fff}',
    '.toolbox summary{cursor:pointer;padding:10px 12px;font-weight:600;color:#333}',
    '.toolbox .toolbox-body{padding:0 12px 12px}',
    '.placeholder-note{font-size:12px;color:#555;line-height:1.45;margin:6px 0 0}',
    '.inline-row{display:flex;gap:8px;align-items:flex-end}',
    '.inline-row input{flex:1}',
    '.preview{margin-top:12px;border:1px solid #d8dee6;border-radius:4px;max-height:190px;overflow:auto;background:#fff}',
    '.preview table{width:100%;border-collapse:collapse;font-size:12px}',
    '.preview th,.preview td{padding:6px 8px;border-bottom:1px solid #edf0f3;text-align:left;vertical-align:top}',
    '.preview th{position:sticky;top:0;background:#f7f9fb;color:#333;font-weight:600}',
    '.preview .muted{color:#777}',
    '</style></head><body>',
    '<h1>Tensor Lab applicant management</h1>',
    '<label for="senderSelect">Send emails from</label>',
    '<select id="senderSelect">',
    '  <option value="tensorlabucsf@gmail.com">tensorlabucsf@gmail.com</option>',
    '  <option value="tensorlabumsom@gmail.com">tensorlabumsom@gmail.com</option>',
    '</select>',
    '<p class="meta">This sender applies to emails sent from this dialog. Direct control sheet edits use the SEND_FROM_EMAIL script property.</p>',
    '<div id="senderStatus" class="status warn">Checking sender access…</div>',
    '<div class="tabs">',
    '  <div class="tab active" data-panel="setup">Setup</div>',
    '  <div class="tab" data-panel="interview">Interviews</div>',
    '  <div class="tab" data-panel="fill">Match projects</div>',
    '  <div class="tab" data-panel="closeout">Closeout and tools</div>',
    '</div>',

    '<div id="setup" class="panel active">',
    '  <p class="hint">New operator setup. Work through this once for the personal Google account that will open the spreadsheet and send applicant email.</p>',
    '  <p class="meta">Google only shows the consent screen when this account has not already approved the current script scopes. If no pop-up appears, the account may already be authorized. To force the screen again, revoke access to Tensor Lab Backend 2026 in Google Account security settings, then run this check again.</p>',
    '  <button id="setupAuthBtn" class="secondary">Run authorization check</button>',
    '  <button id="setupRefreshBtn" class="secondary">Refresh setup status</button>',
    '  <div id="setupStatus"></div>',
    '  <div id="setupChecklist" class="setup-grid"><div class="status warn">Checking setup…</div></div>',
    '  <ol class="setup-steps">',
    '    <li>Run the authorization check once for each Google account that will use this dialog.</li>',
    '    <li>Confirm the sender you need is available. If not, open the operator&apos;s personal Gmail account and add the Tensor Lab addresses under Settings &gt; Accounts and Import &gt; Send mail as.</li>',
    '    <li>Edit the email drafts in each workflow before sending. Placeholders such as {{first_name}}, {{project}}, and {{reselection_link}} are replaced at send time.</li>',
    '    <li>Preview recipients before any bulk send. The real send is blocked if the list changes after preview.</li>',
    '    <li>After sending, check email_log for sent or error rows if anything looks off.</li>',
    '  </ol>',
    '</div>',

    '<div id="fill" class="panel">',
    '  <label for="projectSelect">Project to fill</label>',
    '  <select id="projectSelect"><option value="">Loading…</option></select>',
    '  <label for="applicantSelect">Selected applicant</label>',
    '  <select id="applicantSelect" disabled><option value="">Pick a project first</option></select>',
    '  <div class="section">',
    '    <h2>Email drafts</h2>',
    '    <p class="placeholder-note">You can edit these before sending. Available placeholders: {{first_name}}, {{project}}, and {{reselection_link}}. Keep {{reselection_link}} in the reselection email.</p>',
    '    <button id="fillDraftBtn" class="secondary" disabled>Generate email drafts</button>',
    '    <div id="fillDraftStatus"></div>',
    '    <label for="fillCongratsSubject">Winner email subject</label>',
    '    <input id="fillCongratsSubject" type="text" placeholder="Generate drafts after selecting a project and applicant" />',
    '    <label for="fillCongratsBody">Winner email body</label>',
    '    <textarea id="fillCongratsBody" placeholder="The selected applicant receives this email."></textarea>',
    '    <label for="fillReselectSubject">Reselection email subject</label>',
    '    <input id="fillReselectSubject" type="text" placeholder="Generate drafts after selecting a project and applicant" />',
    '    <label for="fillReselectBody">Reselection email body</label>',
    '    <textarea id="fillReselectBody" placeholder="Applicants who ranked the filled project receive this email. Keep {{reselection_link}} where the update link should appear."></textarea>',
    '    <div class="inline-row">',
    '      <div style="flex:1"><label for="fillTestEmail">Test recipient email</label><input id="fillTestEmail" type="text" placeholder="your.email@example.com" /></div>',
    '      <button id="fillTestCongratsBtn" class="secondary" disabled>Test winner email</button>',
    '      <button id="fillTestReselectBtn" class="secondary" disabled>Test reselection email</button>',
    '    </div>',
    '  </div>',
    '  <button id="fillPreviewBtn" class="secondary" disabled>Preview recipients</button>',
    '  <div id="fillPreview"></div>',
    '  <button id="fillBtn" class="primary" disabled>Fill project and send emails</button>',
    '  <p class="meta">Winner receives the winner email above. Every other applicant who ranked this project receives the reselection email above so they can swap in a new choice. Non-winners are not rejected, they remain pending on their other two choices. Safe to rerun, congrats emails are deduped.</p>',
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
    '  <button id="ivDraftBtn" class="secondary" onclick="return handleIvDraftClick(event)">Regenerate email draft</button>',
    '  <div id="ivDraftStatus"></div>',
    '  <label for="ivSubject">Email subject</label>',
    '  <input id="ivSubject" type="text" placeholder="Subject loads after project, applicant, name, and link are set" />',
    '  <label for="ivBody">Email body</label>',
    '  <textarea id="ivBody" placeholder="Body loads after project, applicant, name, and link are set. You can edit every word before sending."></textarea>',
    '  <label for="ivTestEmail">Test recipient email</label>',
    '  <input id="ivTestEmail" type="text" placeholder="your.email@example.com" />',
    '  <button id="ivTestBtn" class="secondary" disabled>Send test email</button>',
    '  <button id="ivSendBtn" class="primary" disabled>Send interview invite</button>',
    '  <p class="meta">The generated draft is only a starting point. The subject and body above are sent exactly as shown and logged to the interview_log tab. Your name, link, and test recipient are remembered for next time.</p>',
    '  <div id="ivStatus"></div>',
    '</div>',

    '<div id="closeout" class="panel">',
    '  <div class="section">',
    '  <h2>Decline one applicant</h2>',
    '  <p class="hint">Use this after technical screening or any explicit decision not to move an applicant forward. Do not reject people just because one of their three choices was filled by someone else, they may still match their other choices.</p>',
    '  <label for="rejectSelect">Applicant to reject</label>',
    '  <select id="rejectSelect"><option value="">Loading…</option></select>',
    '  <label for="rejectNote">Optional reviewer note</label>',
    '  <textarea id="rejectNote" placeholder="Optional. Regenerate the draft after adding this if you want it included in the email body."></textarea>',
    '  <button id="rejectDraftBtn" class="secondary" disabled>Generate decline draft</button>',
    '  <div id="rejectDraftStatus"></div>',
    '  <label for="rejectSubject">Decline email subject</label>',
    '  <input id="rejectSubject" type="text" placeholder="Generate a draft after choosing an applicant" />',
    '  <label for="rejectBody">Decline email body</label>',
    '  <textarea id="rejectBody" placeholder="Edit this decline email before sending. {{first_name}} is available if you want a placeholder."></textarea>',
    '  <div class="inline-row">',
    '    <div style="flex:1"><label for="rejectTestEmail">Test recipient email</label><input id="rejectTestEmail" type="text" placeholder="your.email@example.com" /></div>',
    '    <button id="rejectTestBtn" class="secondary" disabled>Send decline test</button>',
    '  </div>',
    '  <button id="rejectBtn" class="danger" disabled>Reject and send decline email</button>',
    '  <p class="meta">Applicants who have already been selected or rejected are hidden from this list.</p>',
    '  <div id="rejectStatus"></div>',
    '  </div>',

    '<details class="toolbox">',
    '  <summary>Dummy testing workflow</summary>',
    '  <div class="toolbox-body">',
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
    '  </div>',
    '</details>',

    '<details class="toolbox">',
    '  <summary>Remove test data and reset projects</summary>',
    '  <div class="toolbox-body">',
    '  <p class="hint">Remove test applications without touching real applicants. Enter one or more test email addresses. If a test email was selected for a project, this can reopen that project and put it back on the form.</p>',
    '  <label for="cleanupEmails">Test email addresses</label>',
    '  <textarea id="cleanupEmails" placeholder="One email per line, for example:\\naaronge2016@gmail.com\\naaronge2020@gmail.com"></textarea>',
    '  <label><input id="cleanupResetProjects" type="checkbox" checked style="width:auto;margin-right:6px">Reopen projects selected by these test emails</label>',
    '  <button id="cleanupBtn" class="danger" disabled>Remove test applications and resync</button>',
    '  <p class="meta">Separate emails with new lines, commas, semicolons, or spaces. Do not use slashes. Deletes matching rows from applications, reselections, redirect_log, and interview_log, then refreshes the form choices and public site cache.</p>',
    '  <div id="cleanupStatus"></div>',
    '  <button id="reopenAllBtn" class="danger">Reopen all projects and resync</button>',
    '  <p class="meta">Use this after dummy testing or an accidental all-filled state. It sets every control row back to open and clears filled_at and selected_applicant. Applications and email logs are unchanged.</p>',
    '  <div id="reopenAllStatus"></div>',
    '  </div>',
    '</details>',

    '  <div class="section">',
    '  <h2>Close the cohort</h2>',
    '  <p class="hint">Use this only at the end of the cohort, after every project has been filled. Losing a single choice does not count as a rejection, applicants stay pending on their other choices until selection closes.</p>',
    '  <div id="bulkProgress" class="status warn">Checking selection progress…</div>',
    '  <button id="bulkDraftBtn" class="secondary">Generate closeout draft</button>',
    '  <div id="bulkDraftStatus"></div>',
    '  <label for="bulkSubject">Closeout email subject</label>',
    '  <input id="bulkSubject" type="text" placeholder="Generate the closeout draft before previewing recipients" />',
    '  <label for="bulkBody">Closeout email body</label>',
    '  <textarea id="bulkBody" placeholder="Edit this email before sending to remaining pending applicants. {{first_name}} is replaced for each recipient."></textarea>',
    '  <div class="inline-row">',
    '    <div style="flex:1"><label for="bulkTestEmail">Test recipient email</label><input id="bulkTestEmail" type="text" placeholder="your.email@example.com" /></div>',
    '    <button id="bulkTestBtn" class="secondary" disabled>Send closeout test</button>',
    '  </div>',
    '  <button id="bulkPreviewBtn" class="secondary" disabled>Preview rejection recipients</button>',
    '  <div id="bulkPreview"></div>',
    '  <button id="bulkBtn" class="danger" disabled>Reject all remaining pending applicants</button>',
    '  <p class="meta">Sends the closeout email above to every applicant still pending. You will be shown the exact count and asked to confirm before any email is sent.</p>',
    '  <div id="bulkStatus"></div>',
    '  </div>',
    '</div>',

    '<script>',
    'const $=q=>document.querySelector(q);',
    'const $$=q=>document.querySelectorAll(q);',
    'const esc=s=>String(s==null?"":s).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c]));',
    'const sender=()=>$("#senderSelect").value;',
    'const setStatus=(el,msg,kind)=>{el.className="status "+(kind||"ok");el.textContent=msg};',
    'const clearStatus=el=>{el.className="";el.textContent=""};',
    'const errMsg=e=>{const m=e&&e.message?e.message:String(e||"");return /PERMISSION_DENIED|reading from storage|permission/i.test(m)?m+" Run Tensor Lab > Authorize this account, then reopen this dialog. If this persists, ask the script owner to publish the latest Apps Script files so storage fallbacks are available.":m};',
    'let ivDraftDirty=false;',
    'let ivDraftTimer=null;',
    'let fillPreviewOk=false;',
    'let bulkPreviewOk=false;',
    'let fillPreviewRows=[];',
    'let bulkPreviewRows=[];',
    'let bulkGateOpen=false;',
    'const validEmail=v=>/.+@.+\\..+/.test(String(v||"").trim());',
    'const fillEmailTemplates=()=>({',
    '  congratulations:{subject:$("#fillCongratsSubject").value.trim(),body:$("#fillCongratsBody").value.trim()},',
    '  reselection:{subject:$("#fillReselectSubject").value.trim(),body:$("#fillReselectBody").value.trim()}',
    '});',
    'const rejectEmailTemplate=()=>({subject:$("#rejectSubject").value.trim(),body:$("#rejectBody").value.trim()});',
    'const bulkEmailTemplate=()=>({subject:$("#bulkSubject").value.trim(),body:$("#bulkBody").value.trim()});',
    'const templateReady=t=>!!(t&&t.subject&&t.body);',
    'const renderPreview=(el,rows,skipped)=>{',
    '  const parts=[];',
    '  if(rows&&rows.length){',
    '    parts.push("<div class=\\"preview\\"><table><thead><tr><th>Action</th><th>Recipient</th><th>Project</th><th>Subject</th></tr></thead><tbody>");',
    '    rows.forEach(r=>parts.push("<tr><td>"+esc(r.action||"")+"</td><td>"+esc(r.name||"")+"<br><span class=\\"muted\\">"+esc(r.email||"")+"</span></td><td>"+esc(r.project||"")+(r.rank?"<br><span class=\\"muted\\">rank "+esc(r.rank)+"</span>":"")+"</td><td>"+esc(r.subject||"")+"</td></tr>"));',
    '    parts.push("</tbody></table></div>");',
    '  }else parts.push("<p class=\\"meta\\">No emails would be sent.</p>");',
    '  if(skipped&&skipped.length){',
    '    parts.push("<p class=\\"meta\\">Skipped: "+skipped.length+"</p><div class=\\"preview\\"><table><thead><tr><th>Action</th><th>Recipient</th><th>Reason</th></tr></thead><tbody>");',
    '    skipped.forEach(r=>parts.push("<tr><td>"+esc(r.action||"")+"</td><td>"+esc(r.name||"")+"<br><span class=\\"muted\\">"+esc(r.email||"")+"</span></td><td>"+esc(r.reason||"")+"</td></tr>"));',
    '    parts.push("</tbody></table></div>");',
    '  }',
    '  el.innerHTML=parts.join("");',
    '};',

    '$$(".tab").forEach(t=>t.addEventListener("click",()=>{',
    '  $$(".tab").forEach(x=>x.classList.remove("active"));',
    '  $$(".panel").forEach(x=>x.classList.remove("active"));',
    '  t.classList.add("active");',
    '  $("#"+t.dataset.panel).classList.add("active");',
    '}));',

    'function loadSenderStatus(){',
    '  const st=$("#senderStatus");',
    '  google.script.run.withSuccessHandler(s=>{',
    '    const active=s.activeUser||s.effectiveUser||"unknown account";',
    '    const unavailable=(s.senders||[]).filter(x=>x.known&&!x.available).map(x=>x.email);',
    '    (s.senders||[]).forEach(x=>{const opt=[...$("#senderSelect").options].find(o=>o.value===x.email);if(opt&&x.known)opt.disabled=!x.available});',
    '    if(s.aliasError)setStatus(st,"Running as "+active+". Could not verify Gmail aliases, so sender choices are not disabled: "+s.aliasError,"warn");',
    '    else if(unavailable.length)setStatus(st,"Running as "+active+". Unavailable sender(s): "+unavailable.join(", ")+". Add them in the personal Gmail account used by this operator under Settings > Accounts and Import > Send mail as.","warn");',
    '    else setStatus(st,"Running as "+active+". Sender choices look available.","ok");',
    '    if($("#senderSelect").selectedOptions[0]&&$("#senderSelect").selectedOptions[0].disabled){const first=[...$("#senderSelect").options].find(o=>!o.disabled);if(first)$("#senderSelect").value=first.value}',
    '  }).withFailureHandler(e=>setStatus(st,"Could not check sender access: "+errMsg(e),"warn"))',
    '  .mgmtSenderStatus();',
    '}',
    'const setupBadge=s=>s==="ok"?"OK":s==="err"?"Fix":"Check";',
    'function renderSetupStatus(s){',
    '  const rows=(s.checks||[]).map(c=>{const kind=["ok","warn","err"].includes(c.status)?c.status:"warn";const help=c.setup?"<div class=\\"setup-help\\"><b>How to set this up:</b> "+esc(c.setup)+"</div>":"";return "<div class=\\"check "+kind+"\\"><strong>"+setupBadge(kind)+"</strong><span><b>"+esc(c.label||"")+"</b><br>"+esc(c.detail||"")+help+"</span></div>"}).join("");',
    '  $("#setupChecklist").innerHTML=rows||"<div class=\\"status warn\\">No setup checks returned.</div>";',
    '}',
    'function renderSetupFallback(e){',
    '  const m=errMsg(e);',
    '  const checks=[',
    '    {status:"warn",label:"Limited setup mode",detail:m,setup:"This account can open the dialog but Google blocked one setup check. You can still use the workflow tabs if their dropdowns load."},',
    '    {status:"ok",label:"Authorize this Google account",detail:"Run Tensor Lab > Authorize this account once for this Google account.",setup:"After accepting permissions, close and reopen the spreadsheet tab, then reopen Tensor Lab > Manage applicants."},',
    '    {status:"warn",label:"Gmail Send mail as",detail:"Confirm the selected Tensor Lab sender is configured in the personal Gmail account used by this operator, not inside the shared Tensor Lab inbox.",setup:"In the personal Gmail account used to open this spreadsheet, go to Settings > See all settings > Accounts and Import > Send mail as. Add tensorlabucsf@gmail.com and/or tensorlabumsom@gmail.com and complete verification."},',
    '    {status:"warn",label:"Spreadsheet access",detail:"Confirm this account is an Editor on the applications spreadsheet.",setup:"Ask the owner to share the applications spreadsheet directly with Editor access. Then open the spreadsheet and launch this dialog from the Tensor Lab menu."},',
    '    {status:"warn",label:"Send a test email",detail:"Use Invite to interview, enter a test recipient, and send a test before contacting applicants.",setup:"If the test email sends, the remaining setup error is only a checklist visibility issue, not a blocker for sending."}',
    '  ];',
    '  renderSetupStatus({checks});',
    '  setStatus($("#setupStatus"),"Setup checks opened in limited mode. Try the workflow tabs and send a test email before contacting applicants.","warn");',
    '}',
    'function loadSetupStatus(){',
    '  const box=$("#setupChecklist");box.innerHTML="<div class=\\"status warn\\">Checking setup…</div>";clearStatus($("#setupStatus"));',
    '  google.script.run.withSuccessHandler(s=>{renderSetupStatus(s);loadSenderStatus();})',
    '    .withFailureHandler(e=>{renderSetupFallback(e)})',
    '    .mgmtSetupStatus();',
    '}',
    '$("#setupRefreshBtn").addEventListener("click",loadSetupStatus);',
    '$("#setupAuthBtn").addEventListener("click",()=>{',
    '  const st=$("#setupStatus");setStatus(st,"Running authorization check…","warn");$("#setupAuthBtn").disabled=true;',
    '  google.script.run.withSuccessHandler(r=>{',
    '    const failed=((r&&r.checks)||[]).filter(c=>!c.ok);',
    '    if(failed.length){setStatus(st,"Authorization check ran, but "+failed.length+" item(s) still need attention. Google may not show a consent screen if this account already approved the current scopes.","warn")}',
    '    else setStatus(st,"Authorization check complete. If Google did not show a consent screen, this account had already approved the current scopes.","ok");',
    '    $("#setupAuthBtn").disabled=false;loadSetupStatus();',
    '  })',
    '    .withFailureHandler(e=>{',
    '      const m=errMsg(e);',
    '      const storage=/PERMISSION_DENIED|reading from storage|storage/i.test(m);',
    '      setStatus(st,storage?"Authorization helper hit Apps Script storage. Update triggers.gs to the storage-free authorizeManagementUi, then reopen this dialog.":"Authorization check failed: "+m,storage?"warn":"err");',
    '      $("#setupAuthBtn").disabled=false;',
    '    })',
    '    .authorizeManagementUi();',
    '});',
    'loadSenderStatus();',
    'loadSetupStatus();',

    'function loadFillProjects(){',
    '  const sel=$("#projectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  fillPreviewOk=false;fillPreviewRows=[];$("#fillPreview").innerHTML="";clearFillDrafts();fillRefreshButtons();',
    '  $("#applicantSelect").innerHTML="<option value=\\"\\">Pick a project first</option>";$("#applicantSelect").disabled=true;',
    '  google.script.run.withSuccessHandler(projects=>{',
    '    sel.innerHTML="";',
    '    if(!projects.length){sel.innerHTML="<option value=\\"\\">No open projects</option>";setStatus($("#fillStatus"),"No open projects are available. Use Remove test data > Reopen all projects if this was a test reset.","warn");return}',
    '    if($("#fillStatus").textContent.indexOf("No open projects")===0)clearStatus($("#fillStatus"));',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '    projects.forEach(p=>sel.insertAdjacentHTML("beforeend",',
    '      "<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '  }).withFailureHandler(e=>setStatus($("#fillStatus"),"Could not load projects: "+errMsg(e),"err"))',
    '  .mgmtListOpenProjects();',
    '}',
    'loadFillProjects();',
    'function selectedProjectLabel(selectId){',
    '  const opt=$(selectId).selectedOptions[0];',
    '  return opt?opt.text.replace(/\\s+\\(\\d+ applicants\\)$/,""):"";',
    '}',
    'function clearFillDrafts(){',
    '  ["#fillCongratsSubject","#fillCongratsBody","#fillReselectSubject","#fillReselectBody"].forEach(q=>$(q).value="");',
    '  clearStatus($("#fillDraftStatus"));',
    '}',
    'function fillDraftsReady(){',
    '  const t=fillEmailTemplates();',
    '  return templateReady(t.congratulations)&&templateReady(t.reselection)&&/\\{\\{\\s*(reselection_link|link)\\s*\\}\\}/i.test(t.reselection.body);',
    '}',
    'function fillRefreshButtons(){',
    '  const hasChoice=!!($("#projectSelect").value&&$("#applicantSelect").value);',
    '  const ready=fillDraftsReady();',
    '  const hasTest=validEmail($("#fillTestEmail").value);',
    '  $("#fillDraftBtn").disabled=!hasChoice;',
    '  $("#fillPreviewBtn").disabled=!(hasChoice&&ready);',
    '  $("#fillTestCongratsBtn").disabled=!(ready&&hasTest);',
    '  $("#fillTestReselectBtn").disabled=!(ready&&hasTest);',
    '  $("#fillBtn").disabled=!(fillPreviewOk&&ready);',
    '}',
    'function loadFillDrafts(force){',
    '  const pid=$("#projectSelect").value;const email=$("#applicantSelect").value;',
    '  if(!pid||!email){if(force)setStatus($("#fillDraftStatus"),"Pick a project and selected applicant first.","warn");fillRefreshButtons();return}',
    '  $("#fillDraftBtn").disabled=true;setStatus($("#fillDraftStatus"),"Generating drafts…","warn");',
    '  google.script.run.withSuccessHandler(d=>{',
    '    $("#fillCongratsSubject").value=d.congratulations.subject||"";$("#fillCongratsBody").value=d.congratulations.body||"";',
    '    $("#fillReselectSubject").value=d.reselection.subject||"";$("#fillReselectBody").value=d.reselection.body||"";',
    '    fillPreviewOk=false;fillPreviewRows=[];$("#fillPreview").innerHTML="";setStatus($("#fillDraftStatus"),"Drafts generated. Edit them before previewing recipients.","ok");fillRefreshButtons();',
    '  }).withFailureHandler(e=>{setStatus($("#fillDraftStatus"),"Could not generate drafts: "+errMsg(e),"err");fillRefreshButtons();})',
    '  .mgmtBuildFillEmailDrafts(pid,email);',
    '}',
    '$("#fillDraftBtn").addEventListener("click",()=>loadFillDrafts(true));',
    '["#fillCongratsSubject","#fillCongratsBody","#fillReselectSubject","#fillReselectBody","#fillTestEmail"].forEach(q=>$(q).addEventListener("input",()=>{fillPreviewOk=false;fillPreviewRows=[];$("#fillPreview").innerHTML="";fillRefreshButtons()}));',
    'function sendFillDraftTest(kind){',
    '  const to=$("#fillTestEmail").value.trim();const t=fillEmailTemplates();const draft=kind==="congratulations"?t.congratulations:t.reselection;const st=$("#fillDraftStatus");',
    '  if(!validEmail(to)||!templateReady(draft))return;',
    '  setStatus(st,"Sending test email…","warn");$("#fillTestCongratsBtn").disabled=true;$("#fillTestReselectBtn").disabled=true;',
    '  google.script.run.withSuccessHandler(r=>{setStatus(st,"Test email sent to "+r.email+".","ok");fillRefreshButtons();})',
    '    .withFailureHandler(e=>{setStatus(st,"Test send error: "+errMsg(e),"err");fillRefreshButtons();})',
    '    .mgmtSendDraftTestEmail(draft.subject,draft.body,sender(),to,kind+"_test",selectedProjectLabel("#projectSelect"));',
    '}',
    '$("#fillTestCongratsBtn").addEventListener("click",()=>sendFillDraftTest("congratulations"));',
    '$("#fillTestReselectBtn").addEventListener("click",()=>sendFillDraftTest("reselection"));',

    '$("#projectSelect").addEventListener("change",()=>{',
    '  const pid=$("#projectSelect").value;const as=$("#applicantSelect");const btn=$("#fillBtn");',
    '  fillPreviewOk=false;fillPreviewRows=[];$("#fillPreview").innerHTML="";clearFillDrafts();fillRefreshButtons();',
    '  clearStatus($("#fillStatus"));',
    '  if(!pid){as.innerHTML="<option value=\\"\\">Pick a project first</option>";as.disabled=true;btn.disabled=true;fillRefreshButtons();return}',
    '  as.innerHTML="<option value=\\"\\">Loading…</option>";as.disabled=true;btn.disabled=true;',
    '  google.script.run.withSuccessHandler(list=>{',
    '    as.innerHTML="";',
    '    if(!list.length){as.innerHTML="<option value=\\"\\">No pending applicants ranked this project</option>";fillRefreshButtons();return}',
    '    as.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose an applicant…</option>");',
    '    list.forEach(a=>{',
    '      const label=esc(a.name)+" ("+(a.rank===1?"1st":a.rank===2?"2nd":"3rd")+" choice, "+esc(a.email)+")";',
    '      as.insertAdjacentHTML("beforeend","<option value=\\""+esc(a.email)+"\\">"+label+"</option>");',
    '    });',
    '    as.disabled=false;fillRefreshButtons();',
    '  }).withFailureHandler(e=>setStatus($("#fillStatus"),"Could not load applicants: "+errMsg(e),"err"))',
    '  .mgmtListApplicantsForProject(pid);',
    '});',

    '$("#applicantSelect").addEventListener("change",()=>{',
    '  fillPreviewOk=false;fillPreviewRows=[];$("#fillPreview").innerHTML="";clearFillDrafts();fillRefreshButtons();',
    '  if($("#applicantSelect").value)loadFillDrafts(false);',
    '});',

    '$("#fillPreviewBtn").addEventListener("click",()=>{',
    '  const pid=$("#projectSelect").value;const email=$("#applicantSelect").value;const st=$("#fillStatus");',
    '  if(!pid||!email)return;',
    '  $("#fillPreviewBtn").disabled=true;$("#fillBtn").disabled=true;setStatus(st,"Previewing recipients…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(p=>{',
    '      fillPreviewOk=true;',
    '      fillPreviewRows=p.recipients||[];',
    '      renderPreview($("#fillPreview"),p.recipients,p.skipped);',
    '      setStatus(st,"Preview ready: "+p.totalToEmail+" email(s) would be sent.","ok");',
    '      $("#fillPreviewBtn").disabled=false;$("#fillBtn").disabled=false;',
    '    })',
    '    .withFailureHandler(e=>{fillPreviewOk=false;setStatus(st,"Preview error: "+errMsg(e),"err");fillRefreshButtons();})',
    '    .mgmtPreviewFillProject(pid,email,fillEmailTemplates());',
    '});',

    '$("#fillBtn").addEventListener("click",()=>{',
    '  const pid=$("#projectSelect").value;const email=$("#applicantSelect").value;',
    '  const projectLabel=$("#projectSelect").selectedOptions[0].text;',
    '  const st=$("#fillStatus");if(!pid||!email)return;',
    '  if(!fillPreviewOk){setStatus(st,"Preview recipients before sending.","warn");return}',
    '  if(!confirm("Fill "+projectLabel+" with "+email+"?\\n\\nEmails will send from "+sender()+"."))return;',
    '  $("#fillBtn").disabled=true;setStatus(st,"Sending…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{setStatus(st,"Filled. Congrats email sent to "+r.email+". "+r.notified+" reselection emails sent.","ok");',
    '      loadFillProjects();',
    '      $("#applicantSelect").innerHTML="<option value=\\"\\">Pick a project first</option>";$("#applicantSelect").disabled=true;',
    '      loadInterviewProjects();',
    '      refreshBulkGate();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");fillRefreshButtons();})',
    '    .mgmtFillProject(pid,email,sender(),fillPreviewRows,fillEmailTemplates());',
    '});',

    'function loadInterviewProjects(){',
    '  const sel=$("#ivProjectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  $("#ivApplicantSelect").innerHTML="<option value=\\"\\">Pick a project first</option>";$("#ivApplicantSelect").disabled=true;ivRefreshBtn();',
    '  google.script.run.withSuccessHandler(projects=>{',
    '    sel.innerHTML="";',
    '    if(!projects.length){sel.innerHTML="<option value=\\"\\">No open projects</option>";setStatus($("#ivStatus"),"No open projects are available. Use Remove test data > Reopen all projects if this was a test reset.","warn");ivRefreshBtn();return}',
    '    if($("#ivStatus").textContent.indexOf("No open projects")===0)clearStatus($("#ivStatus"));',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '    projects.forEach(p=>sel.insertAdjacentHTML("beforeend",',
    '      "<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '  }).withFailureHandler(e=>setStatus($("#ivStatus"),"Could not load projects: "+errMsg(e),"err"))',
    '  .mgmtListOpenProjects();',
    '}',
    'loadInterviewProjects();',

    'google.script.run.withSuccessHandler(d=>{',
    '  if(d.name)$("#ivReviewerName").value=d.name;',
    '  if(d.url)$("#ivSchedulingUrl").value=cleanUrlValue(d.url);',
    '  if(d.testEmail)$("#ivTestEmail").value=d.testEmail;',
    '  ivRefreshBtn();',
    '  scheduleIvDraft(false);',
    '}).mgmtRecallReviewerDefaults();',

    '$("#ivProjectSelect").addEventListener("change",()=>{',
    '  const pid=$("#ivProjectSelect").value;const as=$("#ivApplicantSelect");',
    '  ivDraftDirty=false;$("#ivSubject").value="";$("#ivBody").value="";',
    '  clearStatus($("#ivStatus"));clearStatus($("#ivDraftStatus"));',
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
    '    as.disabled=false;ivRefreshBtn();scheduleIvDraft(false);',
    '  }).withFailureHandler(e=>setStatus($("#ivStatus"),"Could not load applicants: "+errMsg(e),"err"))',
    '  .mgmtListApplicantsForProject(pid);',
    '});',

    'function cleanUrlValue(v){v=String(v||"").trim().replace(/\\s+/g,"");v=v.replace(/^(?:(?:https?:)?\\/\\/)+/i,"https://");if(v&&!/^https?:\\/\\//i.test(v)&&!/^[a-z][a-z0-9+.-]*:/i.test(v)&&/^[^\\s\\/]+\\.[^\\s]+/.test(v))v="https://"+v;return v}',
    'function schedulingUrlProblem(v){',
    '  const value=cleanUrlValue(v);',
    '  if(!value)return "enter a scheduling link";',
    '  if(!/^https?:\\/\\//i.test(value))return "enter a link that starts with http:// or https://";',
    '  if(/^https?:\\/\\/https?:\\/\\//i.test(value))return "remove the extra http:// or https://";',
    '  try{',
    '    const u=new URL(value);',
    '    if(u.protocol!=="http:"&&u.protocol!=="https:")return "use an http:// or https:// link";',
    '    if(!u.hostname)return "enter a valid scheduling link";',
    '    if(u.username||u.password)return "remove the username or password from the link";',
    '    if(u.hostname.split(".").some(p=>!p||p.startsWith("-")||p.endsWith("-")))return "enter a valid scheduling link domain";',
    '    if(u.hostname!=="localhost"&&!u.hostname.includes("."))return "enter a full domain, for example https://calendly.com/your-name";',
    '    return "";',
    '  }catch(e){return "enter a valid scheduling link"}',
    '}',
    'function ivDraftReady(){',
    '  return !ivDraftMissingReason();',
    '}',
    'function ivDraftMissingReason(){',
    '  if(!$("#ivProjectSelect").value)return "pick a project";',
    '  if(!$("#ivApplicantSelect").value)return "pick an applicant";',
    '  if(!$("#ivReviewerName").value.trim())return "enter your name";',
    '  const urlIssue=schedulingUrlProblem($("#ivSchedulingUrl").value);',
    '  if(urlIssue)return urlIssue;',
    '  return "";',
    '}',
    'function scheduleIvDraft(force){',
    '  clearTimeout(ivDraftTimer);',
    '  ivDraftTimer=setTimeout(()=>loadIvDraft(!!force),350);',
    '}',
    'function draftStatusEl(){return $("#ivDraftStatus")||$("#ivStatus")}',
    'function handleIvDraftClick(evt){',
    '  if(evt&&evt.preventDefault)evt.preventDefault();',
    '  try{ivDraftDirty=false}catch(_e){}',
    '  loadIvDraft(true);',
    '  return false;',
    '}',
    'function loadIvDraft(force){',
    '  const missing=ivDraftMissingReason();',
    '  if(missing){if(force)setStatus(draftStatusEl(),"To generate a draft, "+missing+".","warn");ivRefreshBtn();return}',
    '  if(ivDraftDirty&&!force){ivRefreshBtn();return}',
    '  const pid=$("#ivProjectSelect").value;const email=$("#ivApplicantSelect").value;',
    '  const reviewer=$("#ivReviewerName").value.trim();const url=cleanUrlValue($("#ivSchedulingUrl").value);$("#ivSchedulingUrl").value=url;',
    '  const btn=$("#ivDraftBtn");btn.disabled=true;btn.textContent="Loading draft…";',
    '  setStatus(draftStatusEl(),"Generating draft…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(d=>{',
    '      $("#ivSubject").value=d.subject||"";',
    '      $("#ivBody").value=d.body||"";',
    '      ivDraftDirty=false;btn.textContent="Regenerate email draft";setStatus(draftStatusEl(),"Draft generated. Review and edit before sending.","ok");ivRefreshBtn();',
    '    })',
    '    .withFailureHandler(e=>{btn.textContent="Regenerate email draft";setStatus(draftStatusEl(),"Could not generate draft: "+errMsg(e),"err");ivRefreshBtn();})',
    '    .mgmtBuildInterviewInviteDraft(pid,email,reviewer,url);',
    '}',
    'function ivSendDisabledReason(){',
    '  if(!$("#ivProjectSelect").value)return "Pick a project first";',
    '  if(!$("#ivApplicantSelect").value)return "Pick an applicant";',
    '  if(!$("#ivReviewerName").value.trim())return "Enter your name";',
    '  const urlIssue=schedulingUrlProblem($("#ivSchedulingUrl").value);',
    '  if(urlIssue)return urlIssue.charAt(0).toUpperCase()+urlIssue.slice(1);',
    '  if(!$("#ivSubject").value.trim())return "Enter or generate an email subject";',
    '  if(!$("#ivBody").value.trim())return "Enter or generate an email body";',
    '  return "";',
    '}',
    'function ivTestDisabledReason(){',
    '  if(!validEmail($("#ivTestEmail").value))return "Enter a test recipient email";',
    '  if(!$("#ivSubject").value.trim())return "Enter or generate an email subject";',
    '  if(!$("#ivBody").value.trim())return "Enter or generate an email body";',
    '  return "";',
    '}',
    'function ivRefreshBtn(){',
    '  const sendReason=ivSendDisabledReason();',
    '  const testReason=ivTestDisabledReason();',
    '  $("#ivSendBtn").disabled=!!sendReason;',
    '  $("#ivSendBtn").title=sendReason;',
    '  $("#ivTestBtn").disabled=!!testReason;',
    '  $("#ivTestBtn").title=testReason?testReason:"Send the current draft to the test recipient";',
    '  const draftReason=ivDraftMissingReason();',
    '  $("#ivDraftBtn").disabled=false;',
    '  $("#ivDraftBtn").title=draftReason?"To generate a draft, "+draftReason:"Regenerate the default draft from the current fields";',
    '}',
    '["#ivReviewerName","#ivSchedulingUrl"].forEach(q=>$(q).addEventListener("input",()=>{ivRefreshBtn();scheduleIvDraft(false)}));',
    '$("#ivApplicantSelect").addEventListener("change",()=>{ivDraftDirty=false;$("#ivSubject").value="";$("#ivBody").value="";ivRefreshBtn();scheduleIvDraft(false)});',
    '["#ivSubject","#ivBody","#ivTestEmail"].forEach(q=>$(q).addEventListener("input",()=>{if(q!=="#ivTestEmail")ivDraftDirty=true;ivRefreshBtn()}));',
    '// Draft button uses inline onclick so the visible status still works if later listeners fail.',
    '$("#ivSchedulingUrl").addEventListener("blur",()=>{',
    '  const el=$("#ivSchedulingUrl");el.value=cleanUrlValue(el.value);',
    '  const issue=schedulingUrlProblem(el.value);',
    '  if(issue&&el.value)setStatus(draftStatusEl(),issue.charAt(0).toUpperCase()+issue.slice(1)+".","warn");',
    '  ivRefreshBtn();scheduleIvDraft(false);',
    '});',

    '$("#ivTestBtn").addEventListener("click",()=>{',
    '  const subject=$("#ivSubject").value.trim();const body=$("#ivBody").value.trim();const to=$("#ivTestEmail").value.trim();const st=$("#ivStatus");',
    '  if(!subject||!body||!validEmail(to))return;',
    '  $("#ivTestBtn").disabled=true;setStatus(st,"Sending test email to "+to+"…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{setStatus(st,"Test email sent to "+r.email+".","ok");ivRefreshBtn();})',
    '    .withFailureHandler(e=>{setStatus(st,"Test send error: "+errMsg(e),"err");ivRefreshBtn();})',
    '    .mgmtSendInterviewTestEmail(subject,body,sender(),to);',
    '});',

    '$("#ivSendBtn").addEventListener("click",()=>{',
    '  const pid=$("#ivProjectSelect").value;const email=$("#ivApplicantSelect").value;',
    '  const reviewer=$("#ivReviewerName").value.trim();const url=cleanUrlValue($("#ivSchedulingUrl").value);$("#ivSchedulingUrl").value=url;',
    '  const subject=$("#ivSubject").value.trim();const body=$("#ivBody").value.trim();const st=$("#ivStatus");',
    '  const projectLabel=$("#ivProjectSelect").selectedOptions[0].text;',
    '  if(!confirm("Send "+email+" an interview invite for "+projectLabel+"?\\n\\nSubject: "+subject+"\\n\\nEmail will send from "+sender()+"."))return;',
    '  $("#ivSendBtn").disabled=true;setStatus(st,"Sending invite…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      setStatus(st,"Invite sent to "+r.email+" for "+r.projectLabel+". Logged to interview_log.","ok");',
    '      ivDraftDirty=false;ivRefreshBtn();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");ivRefreshBtn();})',
    '    .mgmtSendInterviewInvite(pid,email,reviewer,url,subject,body,sender());',
    '});',

    'function loadPending(){',
    '  const sel=$("#rejectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  rejectRefreshButtons();',
    '  google.script.run.withSuccessHandler(list=>{',
    '    sel.innerHTML="";',
    '    if(!list.length){sel.innerHTML="<option value=\\"\\">No pending applicants</option>";rejectRefreshButtons();return}',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose an applicant…</option>");',
    '    list.forEach(a=>{',
    '      const label=esc(a.name)+" ("+esc(a.email)+")"+(a.topChoice?" — top: "+esc(a.topChoice):"");',
    '      sel.insertAdjacentHTML("beforeend","<option value=\\""+esc(a.email)+"\\">"+label+"</option>");',
    '    });rejectRefreshButtons();',
    '  }).withFailureHandler(e=>setStatus($("#rejectStatus"),"Could not load applicants: "+errMsg(e),"err"))',
    '  .mgmtListPendingApplicants();',
    '}',
    'function rejectReady(){return !!($("#rejectSelect").value&&templateReady(rejectEmailTemplate()))}',
    'function rejectRefreshButtons(){',
    '  const hasApplicant=!!$("#rejectSelect").value;const ready=rejectReady();',
    '  $("#rejectDraftBtn").disabled=!hasApplicant;',
    '  $("#rejectBtn").disabled=!ready;',
    '  $("#rejectTestBtn").disabled=!(ready&&validEmail($("#rejectTestEmail").value));',
    '}',
    'function clearRejectDraft(){',
    '  $("#rejectSubject").value="";$("#rejectBody").value="";clearStatus($("#rejectDraftStatus"));rejectRefreshButtons();',
    '}',
    'function loadRejectDraft(force){',
    '  const email=$("#rejectSelect").value;const note=$("#rejectNote").value.trim();',
    '  if(!email){if(force)setStatus($("#rejectDraftStatus"),"Choose an applicant first.","warn");rejectRefreshButtons();return}',
    '  $("#rejectDraftBtn").disabled=true;setStatus($("#rejectDraftStatus"),"Generating decline draft…","warn");',
    '  google.script.run.withSuccessHandler(d=>{',
    '    $("#rejectSubject").value=d.subject||"";$("#rejectBody").value=d.body||"";setStatus($("#rejectDraftStatus"),"Draft generated. Edit it before sending.","ok");rejectRefreshButtons();',
    '  }).withFailureHandler(e=>{setStatus($("#rejectDraftStatus"),"Could not generate draft: "+errMsg(e),"err");rejectRefreshButtons();})',
    '  .mgmtBuildRejectionEmailDraft(email,note);',
    '}',
    'loadPending();',

    'function loadTestProjects(){',
    '  const sel=$("#testProjectSelect");sel.innerHTML="<option value=\\"\\">Loading…</option>";',
    '  google.script.run.withSuccessHandler(projects=>{',
    '    sel.innerHTML="";',
    '    if(!projects.length){sel.innerHTML="<option value=\\"\\">No open projects</option>";setStatus($("#testStatus"),"No open projects are available. Use Remove test data > Reopen all projects if this was a test reset.","warn");testRefreshBtn();return}',
    '    if($("#testStatus").textContent.indexOf("No open projects")===0)clearStatus($("#testStatus"));',
    '    sel.insertAdjacentHTML("beforeend","<option value=\\"\\">Choose a project…</option>");',
    '    projects.forEach(p=>sel.insertAdjacentHTML("beforeend","<option value=\\""+esc(p.id)+"\\">"+esc(p.label)+" ("+p.count+" applicants)</option>"));',
    '    testRefreshBtn();',
    '  }).withFailureHandler(e=>setStatus($("#testStatus"),"Could not load projects: "+errMsg(e),"err"))',
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
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");testRefreshBtn();})',
    '    .mgmtRunDummyWorkflowTest(pid,win,lose,sender(),keep);',
    '});',

    '$("#rejectSelect").addEventListener("change",()=>{clearRejectDraft();if($("#rejectSelect").value)loadRejectDraft(false)});',
    '$("#rejectDraftBtn").addEventListener("click",()=>loadRejectDraft(true));',
    '["#rejectSubject","#rejectBody","#rejectTestEmail"].forEach(q=>$(q).addEventListener("input",rejectRefreshButtons));',
    '$("#rejectNote").addEventListener("input",()=>{clearStatus($("#rejectDraftStatus"))});',
    '$("#rejectTestBtn").addEventListener("click",()=>{',
    '  const t=rejectEmailTemplate();const to=$("#rejectTestEmail").value.trim();const st=$("#rejectDraftStatus");',
    '  if(!templateReady(t)||!validEmail(to))return;',
    '  $("#rejectTestBtn").disabled=true;setStatus(st,"Sending decline test…","warn");',
    '  google.script.run.withSuccessHandler(r=>{setStatus(st,"Test email sent to "+r.email+".","ok");rejectRefreshButtons();})',
    '    .withFailureHandler(e=>{setStatus(st,"Test send error: "+errMsg(e),"err");rejectRefreshButtons();})',
    '    .mgmtSendDraftTestEmail(t.subject,t.body,sender(),to,"rejection_test","");',
    '});',

    '$("#rejectBtn").addEventListener("click",()=>{',
    '  const email=$("#rejectSelect").value;const t=rejectEmailTemplate();const st=$("#rejectStatus");',
    '  if(!rejectReady())return;',
    '  if(!confirm("Reject "+email+" and send the decline email shown here from "+sender()+"?"))return;',
    '  $("#rejectBtn").disabled=true;setStatus(st,"Sending…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      if(r.skipped)setStatus(st,"Skipped: "+r.reason,"warn");',
    '      else setStatus(st,"Rejected "+r.email+". Decline email sent.","ok");',
    '      $("#rejectNote").value="";clearRejectDraft();loadPending();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");rejectRefreshButtons();})',
    '    .mgmtRejectApplicant(email,t.subject,t.body,sender());',
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
    '      loadFillProjects();',
    '      loadInterviewProjects();loadPending();refreshBulkGate();',
    '      loadTestProjects();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");cleanupRefreshBtn();})',
    '    .mgmtRemoveTestApplications(emails,reset);',
    '});',

    '$("#reopenAllBtn").addEventListener("click",()=>{',
    '  const st=$("#reopenAllStatus");',
    '  if(!confirm("Reopen every project?\\n\\nThis sets all control rows to open and clears filled_at and selected_applicant. Applications, applicant statuses, and email logs are unchanged."))return;',
    '  $("#reopenAllBtn").disabled=true;setStatus(st,"Reopening projects and resyncing form choices…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(r=>{',
    '      setStatus(st,"Reopened "+r.reopened+" of "+r.total+" projects. Project dropdowns refreshed.","ok");',
    '      $("#reopenAllBtn").disabled=false;',
    '      loadFillProjects();loadInterviewProjects();loadTestProjects();refreshBulkGate();',
    '    })',
    '    .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");$("#reopenAllBtn").disabled=false;})',
    '    .reopenAllProjects();',
    '});',

    'function bulkReady(){return templateReady(bulkEmailTemplate())}',
    'function bulkRefreshButtons(){',
    '  $("#bulkTestBtn").disabled=!(bulkReady()&&validEmail($("#bulkTestEmail").value));',
    '  if(bulkPreviewOk&&!bulkReady()){bulkPreviewOk=false;bulkPreviewRows=[];$("#bulkPreview").innerHTML=""}',
    '  $("#bulkPreviewBtn").disabled=!(bulkGateOpen&&bulkReady());',
    '  $("#bulkBtn").disabled=!(bulkPreviewOk&&bulkReady());',
    '}',
    'function loadBulkDraft(force){',
    '  $("#bulkDraftBtn").disabled=true;setStatus($("#bulkDraftStatus"),"Generating closeout draft…","warn");',
    '  google.script.run.withSuccessHandler(d=>{',
    '    $("#bulkSubject").value=d.subject||"";$("#bulkBody").value=d.body||"";bulkPreviewOk=false;bulkPreviewRows=[];$("#bulkPreview").innerHTML="";',
    '    setStatus($("#bulkDraftStatus"),"Draft generated. Edit it before previewing recipients.","ok");$("#bulkDraftBtn").disabled=false;bulkRefreshButtons();refreshBulkGate();',
    '  }).withFailureHandler(e=>{setStatus($("#bulkDraftStatus"),"Could not generate draft: "+errMsg(e),"err");$("#bulkDraftBtn").disabled=false;bulkRefreshButtons();})',
    '  .mgmtBuildRejectionEmailDraft("", "");',
    '}',
    '$("#bulkDraftBtn").addEventListener("click",()=>loadBulkDraft(true));',
    '["#bulkSubject","#bulkBody","#bulkTestEmail"].forEach(q=>$(q).addEventListener("input",()=>{bulkPreviewOk=false;bulkPreviewRows=[];$("#bulkPreview").innerHTML="";bulkRefreshButtons()}));',
    '$("#bulkTestBtn").addEventListener("click",()=>{',
    '  const t=bulkEmailTemplate();const to=$("#bulkTestEmail").value.trim();const st=$("#bulkDraftStatus");',
    '  if(!templateReady(t)||!validEmail(to))return;',
    '  $("#bulkTestBtn").disabled=true;setStatus(st,"Sending closeout test…","warn");',
    '  google.script.run.withSuccessHandler(r=>{setStatus(st,"Test email sent to "+r.email+".","ok");bulkRefreshButtons();})',
    '    .withFailureHandler(e=>{setStatus(st,"Test send error: "+errMsg(e),"err");bulkRefreshButtons();})',
    '    .mgmtSendDraftTestEmail(t.subject,t.body,sender(),to,"rejection_test","");',
    '});',

    'function refreshBulkGate(){',
    '  const prog=$("#bulkProgress");const btn=$("#bulkBtn");const previewBtn=$("#bulkPreviewBtn");',
    '  bulkGateOpen=false;bulkPreviewOk=false;bulkPreviewRows=[];$("#bulkPreview").innerHTML="";btn.disabled=true;previewBtn.disabled=true;',
    '  google.script.run.withSuccessHandler(p=>{',
    '    if(p.total===0){setStatus(prog,"No projects defined in control sheet.","warn");bulkGateOpen=false;bulkRefreshButtons();return}',
    '    if(p.openProjectCount>0){',
    '      setStatus(prog,p.filled+" of "+p.total+" projects filled. Still open: "+p.openProjectIds.join(", ")+". Close every project before rejecting everyone else.","warn");',
    '      bulkGateOpen=false;bulkRefreshButtons();',
    '    }else{',
    '      setStatus(prog,bulkReady()?"All "+p.total+" projects filled. Preview remaining recipients before sending rejections.":"All "+p.total+" projects filled. Generate and review the closeout draft before previewing recipients.","ok");',
    '      bulkGateOpen=true;bulkRefreshButtons();',
    '    }',
    '  }).withFailureHandler(e=>{setStatus(prog,"Could not read progress: "+errMsg(e),"err");bulkGateOpen=false;bulkRefreshButtons();})',
    '  .mgmtProjectFillProgress();',
    '}',
    'loadBulkDraft(false);',
    'refreshBulkGate();',

    '$("#bulkPreviewBtn").addEventListener("click",()=>{',
    '  const st=$("#bulkStatus");$("#bulkPreviewBtn").disabled=true;$("#bulkBtn").disabled=true;setStatus(st,"Previewing rejection recipients…","warn");',
    '  google.script.run',
    '    .withSuccessHandler(p=>{',
    '      if(!p.ok){bulkPreviewOk=false;setStatus(st,p.message||"Cannot preview yet.","warn");refreshBulkGate();return}',
    '      renderPreview($("#bulkPreview"),p.recipients,[]);',
    '      bulkPreviewOk=true;',
    '      bulkPreviewRows=p.recipients||[];',
    '      setStatus(st,"Preview ready: "+p.totalToEmail+" rejection email(s) would be sent.","ok");',
    '      $("#bulkPreviewBtn").disabled=false;$("#bulkBtn").disabled=p.totalToEmail<1;',
    '    })',
    '    .withFailureHandler(e=>{bulkPreviewOk=false;setStatus(st,"Preview error: "+errMsg(e),"err");refreshBulkGate();})',
    '    .mgmtPreviewRejectAllRemaining(bulkEmailTemplate());',
    '});',

    '$("#bulkBtn").addEventListener("click",()=>{',
    '  const st=$("#bulkStatus");$("#bulkBtn").disabled=true;setStatus(st,"Counting pending applicants…","warn");',
    '  if(!bulkPreviewOk||!bulkReady()){setStatus(st,"Preview rejection recipients after reviewing the closeout draft.","warn");$("#bulkBtn").disabled=false;return}',
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
    '      .withFailureHandler(e=>{setStatus(st,"Error: "+errMsg(e),"err");$("#bulkBtn").disabled=false})',
    '      .mgmtRejectAllRemaining(sender(),bulkPreviewRows,bulkEmailTemplate());',
    '  }).withFailureHandler(e=>{setStatus(st,"Could not count applicants: "+errMsg(e),"err");$("#bulkBtn").disabled=false})',
    '  .mgmtListPendingApplicants();',
    '});',
    '</script></body></html>'
  ].join('\n');
}
