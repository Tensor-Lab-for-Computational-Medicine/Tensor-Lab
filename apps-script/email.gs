/**
 * email.gs
 *
 * Outbound mail and form URL helpers for Feature 2 (F2).
 *
 * Primary link strategy: open the applicant's original application in edit
 * mode via FormResponse.getEditResponseUrl. That way every answer they
 * already gave is preserved and they only swap in a new project choice.
 * Falls back to the standalone reselection form if the edit URL cannot be
 * resolved (for example if the form is not set to allow edits).
 */

/**
 * Locate the applicant's latest application form response by respondent
 * email and return its edit URL. Returns '' if no response found or if
 * response editing is disabled on the form.
 * Inputs: applicantEmail string.
 * Output: URL string or ''.
 */
function _buildEditApplicationUrl(applicantEmail) {
  var target = String(applicantEmail || '').trim().toLowerCase();
  if (!target) return '';
  var formId = _optionalScriptProperty('APPLICATION_FORM_ID');
  if (!formId) return '';

  var form;
  try { form = FormApp.openById(formId); } catch (e) { return ''; }
  if (!form.canEditResponse || !form.canEditResponse()) {
    _logError('_buildEditApplicationUrl', new Error(
      'Application form does not allow response edits. Run enableApplicationEditing() once.'
    ));
    return '';
  }

  var responses = form.getResponses();
  for (var i = responses.length - 1; i >= 0; i--) {
    var email = '';
    try { email = String(responses[i].getRespondentEmail() || '').toLowerCase(); } catch (e) { continue; }
    if (email === target) return responses[i].getEditResponseUrl();
  }
  return '';
}

/**
 * Build a reselection URL carrying the applicant's token and surviving two
 * choices. Uses FormApp pre-fill, not manual query string assembly, so the
 * form can evolve without breaking the links.
 * Inputs: token string, survivingChoices array of up to two project_id strings.
 * Output: URL string.
 */
function _buildReselectionUrl(token, survivingChoices) {
  var formId = _scriptProperty('RESELECTION_FORM_ID');
  if (!formId) throw new Error('RESELECTION_FORM_ID script property is not set.');

  var form = FormApp.openById(formId);
  var response = form.createResponse();
  var items = form.getItems();

  var assign = function (title, value) {
    if (!value) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].getTitle() === title) {
        var ir = items[i].asTextItem
          ? items[i].asTextItem().createResponse(value)
          : items[i].asListItem
            ? items[i].asListItem().createResponse(value)
            : null;
        if (ir) response.withItemResponse(ir);
        return;
      }
    }
  };

  assign('redirect_token', token);
  assign('surviving_choice_1', survivingChoices[0] || '');
  assign('surviving_choice_2', survivingChoices[1] || '');
  return response.toPrefilledUrl();
}

/**
 * Send the reselection email. Inputs: toEmail string, prefilledUrl string.
 * Output: void. Throws on invalid email.
 */
var TENSOR_LAB_SENDERS = ['tensorlabucsf@gmail.com', 'tensorlabumsom@gmail.com'];
var TENSOR_LAB_LEGAL_FOOTER = 'This fellowship is unpaid and is not employment. By continuing in this process you agree to our Terms (https://thetensorlab.org/terms.html) and Privacy Policy (https://thetensorlab.org/privacy.html). Selection decisions are final.';

function _normalizeSchedulingUrl(url) {
  var value = String(url || '').trim();
  if (!value) return '';
  value = value.replace(/\s+/g, '');
  value = value.replace(/^(?:(?:https?:)?\/\/)+/i, 'https://');
  if (!/^https?:\/\//i.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value) && /^[^\s\/]+\.[^\s]+/.test(value)) {
    value = 'https://' + value;
  }
  return value;
}

function _validateSchedulingUrl(url) {
  var value = _normalizeSchedulingUrl(url);
  if (!value) return 'Enter a scheduling link.';
  if (!/^https?:\/\//i.test(value)) {
    return 'Scheduling link must start with http:// or https://, or be a full domain such as calendly.com/your-name.';
  }
  if (/^https?:\/\/https?:\/\//i.test(value)) {
    return 'Scheduling link has more than one protocol. Remove the extra http:// or https://.';
  }

  var match = value.match(/^https?:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  if (!match || !match[1]) return 'Scheduling link must include a valid domain.';

  var host = String(match[1] || '').toLowerCase();
  if (host.indexOf('@') !== -1) return 'Scheduling link should not include a username or password.';
  if (host.indexOf('..') !== -1) return 'Scheduling link domain is not valid.';

  var hostNoPort = host.replace(/:\d+$/, '');
  if (!hostNoPort) return 'Scheduling link must include a valid domain.';
  if (!/^[a-z0-9.-]+$/i.test(hostNoPort)) return 'Scheduling link domain contains unsupported characters.';
  var labels = hostNoPort.split('.');
  for (var i = 0; i < labels.length; i++) {
    if (!labels[i] || /^-/.test(labels[i]) || /-$/.test(labels[i])) {
      return 'Scheduling link domain is not valid.';
    }
  }
  if (hostNoPort !== 'localhost' && hostNoPort.indexOf('.') === -1) {
    return 'Scheduling link must include a full domain, for example https://calendly.com/your-name.';
  }
  return '';
}

function _assertValidSchedulingUrl(url) {
  var value = _normalizeSchedulingUrl(url);
  var error = _validateSchedulingUrl(value);
  if (error) throw new Error(error);
  return value;
}

/**
 * Editable default draft for the selected applicant when a project is filled.
 * Dialog users may edit this before sending. Placeholders are replaced at
 * send time so the same draft can still personalize per applicant.
 */
function _buildCongratulationsDraft(projectLabel) {
  var label = _displayProjectLabel(projectLabel) || 'your Tensor Lab project';
  var subject = 'Welcome to Tensor Lab';
  var body = [
    'Hi {{first_name}},',
    '',
    'Congratulations. We are delighted to offer you a place in the Tensor Lab fellowship for this project:',
    '',
    'Project: {{project}}',
    '',
    'Your application stood out to the review team, and we are excited about the perspective and energy you would bring to the work.',
    '',
    'A project lead will follow up soon with next steps, including introductions, background reading, and scheduling for kickoff. In the meantime, no action is needed from you.',
    '',
    'If anything about your availability, time zone, or start date has changed since you applied, please reply to this email so we can plan around it.',
    '',
    'Warmly,',
    'Tensor Lab Team'
  ].join('\n');
  return _emailDraft(subject, body, { project: label });
}

/**
 * Editable default draft for applicants who need to replace a filled project.
 * Must keep {{reselection_link}} or {{link}} somewhere in the body.
 */
function _buildReselectionDraft(projectLabel) {
  var label = _displayProjectLabel(projectLabel) || 'one of your Tensor Lab project choices';
  var subject = 'Please update your Tensor Lab project choices';
  var body = [
    'Hi {{first_name}},',
    '',
    'Thank you again for applying to Tensor Lab. One of the projects you ranked has now been filled:',
    '',
    'Project: {{project}}',
    '',
    'You are still being considered for your other choices. Please use the link below to update your application and replace the filled project with another open option. Your previous answers should already be preserved.',
    '',
    '{{reselection_link}}',
    '',
    'If you have any trouble with the form, reply to this email and we will help.',
    '',
    'Warmly,',
    'Tensor Lab Team'
  ].join('\n');
  return _emailDraft(subject, body, { project: label });
}

/** Editable default rejection or closeout draft. */
function _buildRejectionDraft(firstName, personalNote) {
  var greeting = firstName ? 'Hi ' + String(firstName).trim() + ',' : 'Hi {{first_name}},';
  var subject = 'An update on your Tensor Lab application';
  var bodyLines = [
    greeting,
    '',
    'Thank you for applying to Tensor Lab and for the care you put into your application. We read every submission closely, and we know this process takes real time.',
    '',
    'After careful review, we are not able to offer you a place in this cohort. This was a competitive cycle, and each project had very limited capacity.',
    '',
    'This decision reflects the constraints of this particular round, not a judgment on your ability or potential. We would be glad to see a future application from you.'
  ];
  if (personalNote) {
    bodyLines.push('');
    bodyLines.push('A note from your reviewer:');
    bodyLines.push('');
    bodyLines.push(String(personalNote).trim());
  }
  bodyLines.push('');
  bodyLines.push('Thank you again for your interest in Tensor Lab. We wish you the very best in what you take on next.');
  bodyLines.push('');
  bodyLines.push('Warmly,');
  bodyLines.push('Tensor Lab Team');
  return _emailDraft(subject, bodyLines.join('\n'), {});
}

function _emailDraft(subject, body, context) {
  return {
    subject: String(subject || ''),
    body: String(body || ''),
    context: context || {}
  };
}

function _normalizeEmailTemplate(template, fallback) {
  var src = template || fallback || {};
  return {
    subject: String(src.subject || '').trim(),
    body: String(src.body || '').trim()
  };
}

function _applyEmailTemplate(value, context) {
  var ctx = context || {};
  var aliases = {
    first_name: ctx.first_name || ctx.firstName || '',
    applicant_name: ctx.applicant_name || ctx.applicantName || '',
    project: ctx.project || ctx.project_label || ctx.projectLabel || '',
    project_label: ctx.project_label || ctx.projectLabel || ctx.project || '',
    reselection_link: ctx.reselection_link || ctx.reselectionLink || ctx.link || '',
    link: ctx.link || ctx.reselection_link || ctx.reselectionLink || '',
    scheduling_link: ctx.scheduling_link || ctx.schedulingLink || '',
    reviewer: ctx.reviewer || ctx.reviewerName || ''
  };
  var rendered = String(value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (match, key) {
    var normalized = String(key || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(aliases, normalized) ? aliases[normalized] : match;
  });
  return rendered.replace(/Hi\s*,/g, 'Hi,').replace(/[ \t]+\n/g, '\n').trim();
}

function _templateSubject(template, fallbackSubject, context) {
  return _applyEmailTemplate((template && template.subject) || fallbackSubject || '', context);
}

function _assertReselectionTemplateHasLink(template) {
  var body = String((template && template.body) || '');
  if (!/\{\{\s*(reselection_link|link)\s*\}\}/i.test(body)) {
    throw new Error('The reselection email body must include {{reselection_link}} so applicants can update their choices.');
  }
}

function _sendEmailFromTemplate(toEmail, template, context, action, projectLabel, fromEmail) {
  var ctx = context || {};
  var subject = _applyEmailTemplate(template && template.subject, ctx);
  var body = _applyEmailTemplate(template && template.body, ctx);
  if (!subject) throw new Error('Enter an email subject.');
  if (!body) throw new Error('Enter an email body.');
  _sendTensorLabEmail({
    to: toEmail,
    subject: subject,
    body: body,
    action: action || 'custom',
    project_label: projectLabel || ctx.project || ctx.project_label || ''
  }, fromEmail);
}

function _firstNameFromName(name) {
  var value = String(name || '').trim();
  return value ? value.split(/\s+/)[0] : '';
}

/**
 * Send the selected applicant a warm, useful congratulations email. Copy is
 * intentionally warm but grounded so it reads as human, not corporate. No
 * dashes per the house style.
 * Inputs: toEmail string, projectLabel string (human readable project title).
 * Output: void. Throws on invalid email.
 */
function _sendCongratulationsEmail(toEmail, projectLabel, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  var label = _displayProjectLabel(projectLabel) || 'your Tensor Lab project';
  var draft = _buildCongratulationsDraft(label);
  _sendEmailFromTemplate(toEmail, draft, {
    first_name: '',
    project: label,
    project_label: label
  }, 'congratulations', label, fromEmail);
}

/**
 * Send a thoughtful, human rejection email. Intent is to acknowledge effort,
 * be honest about the competitive outcome without being cold, and leave a
 * door open for future applications and for specific feedback. No dashes per
 * the house style.
 * Inputs: toEmail string, optional firstName string for a warmer greeting,
 * optional personalNote string to insert as reviewer feedback.
 * Output: void. Throws on invalid email.
 */
function _sendRejectionEmail(toEmail, firstName, personalNote, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  var draft = _buildRejectionDraft(firstName, personalNote);
  _sendEmailFromTemplate(toEmail, draft, {
    first_name: firstName || '',
    applicant_name: firstName || ''
  }, 'rejection', '', fromEmail);
}

/**
 * Build the default interview invite draft shown in the management dialog.
 * Operators can edit the returned subject and body before sending.
 *
 * Inputs:
 *   firstName       string, optional (for the greeting)
 *   reviewerName    string, required (full name, e.g. "Aaron Ge")
 *   projectLabel    string, required (human-readable project title)
 *   schedulingUrl   string, required (Calendly, Cal.com, SavvyCal, etc.)
 * Output: { subject, body }
 */
function _buildInterviewInviteDraft(firstName, reviewerName, projectLabel, schedulingUrl) {
  if (!reviewerName) throw new Error('reviewerName required');
  if (!schedulingUrl) throw new Error('schedulingUrl required');
  var applicantName = firstName ? String(firstName).trim() : 'Applicant';
  var greeting = 'Dear ' + applicantName + ',';
  var label = _displayProjectLabel(projectLabel) || 'one of your Tensor Lab project choices';
  var reviewer = String(reviewerName).trim();
  var url = _assertValidSchedulingUrl(schedulingUrl);
  var subject = 'Tensor Lab interview invitation';
  var lines = [
    greeting,
    '',
    'Congratulations!! After reviewing a highly competitive pool of applicants, we’re excited to invite you to interview for the Tensor Lab for Computational Medicine Summer Fellowship. You were selected based on the strength of your past work and your potential to lead meaningful research at the intersection of machine learning and medicine.',
    '',
    'You have been selected to interview for this project:',
    '',
    label,
    '',
    'To schedule your interview, please use the following link: ' + url + '. If none of the listed times fit your schedule, just reply to this email and we will coordinate a time manually.',
    '',
    'The interview is conversational in format. We’re interested in learning more about your background, how you approach technical problems, and why you’re interested in applying machine learning to clinical challenges. There are no live coding tasks or technical quizzes. However, please be prepared to briefly discuss recent projects you have worked on.',
    '',
    'For more information about the fellowship, project structure, and mentorship model, you can explore our website: https://thetensorlab.org/',
    '',
    'We’re looking forward to speaking with you.',
    '',
    'Sincerely,',
    reviewer
  ];
  return { subject: subject, body: lines.join('\n') };
}

/**
 * Send an interview invite with the reviewer's scheduling link. Used by older
 * callers and tests. The management dialog now sends an edited draft directly.
 */
function _sendInterviewInviteEmail(toEmail, firstName, reviewerName, projectLabel, schedulingUrl, personalNote, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  var draft = _buildInterviewInviteDraft(firstName, reviewerName, projectLabel, schedulingUrl);
  if (personalNote) {
    draft.body += [
      '',
      '',
      'A note from me:',
      '',
      '    ' + String(personalNote).trim()
    ].join('\n');
  }
  _sendTensorLabEmail({
    to: toEmail,
    subject: draft.subject,
    body: draft.body,
    action: 'interview',
    project_label: _displayProjectLabel(projectLabel) || ''
  }, fromEmail);
}

function _sendReselectionEmail(toEmail, linkUrl, mode, projectLabel, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  var isEdit = mode === 'edit';
  var label = _displayProjectLabel(projectLabel) || 'one of your top three project choices';
  var draft = _buildReselectionDraft(label);
  _sendEmailFromTemplate(toEmail, draft, {
    first_name: '',
    project: label,
    project_label: label,
    reselection_link: linkUrl,
    link: linkUrl,
    mode: isEdit ? 'edit' : 'reselect'
  }, 'reselection', label, fromEmail);
}

/**
 * Central mail sender. The dialog can pass either approved Tensor Lab Gmail
 * account; non-dialog sends fall back to SEND_FROM_EMAIL.
 */
function _sendTensorLabEmail(message, fromEmail) {
  message = _withTensorLabLegalFooter(message);
  var from = _normalizeSenderEmail(fromEmail);
  if (TENSOR_LAB_SENDERS.indexOf(from) === -1) {
    throw new Error('Unsupported sender: ' + from + '. Pick tensorlabucsf@gmail.com or tensorlabumsom@gmail.com.');
  }
  var opts = { name: 'Tensor Lab Team' };
  var htmlBody = message.htmlBody || _buildTensorLabHtmlEmail(message);
  if (htmlBody) opts.htmlBody = htmlBody;
  var identity = _gmailAccountEmail();
  if (identity && from === identity) {
    // Same mailbox as the one running the script: omit `from` or Gmail can throw
    // Invalid argument even when the address matches, unless every alias is set up.
    opts.replyTo = from;
  } else {
    opts.from = from;
    opts.replyTo = from;
  }
  try {
    GmailApp.sendEmail(message.to, message.subject, message.body, opts);
    _appendEmailLog(message, from, 'sent', '');
  } catch (e) {
    var errText = (e && e.message) ? String(e.message) : String(e);
    if (!/invalid argument/i.test(errText)) {
      _appendEmailLog(message, from, 'error', errText);
      throw e;
    }
    if (opts.from) {
      var eff = _effectiveUserEmail();
      if (eff && eff === from) {
        try {
          var retryOpts = { name: 'Tensor Lab Team', replyTo: from };
          if (htmlBody) retryOpts.htmlBody = htmlBody;
          GmailApp.sendEmail(message.to, message.subject, message.body, retryOpts);
          _appendEmailLog(message, from, 'sent', 'sent without from option after Gmail rejected alias argument');
        } catch (e2) {
          var errText2 = (e2 && e2.message) ? String(e2.message) : String(e2);
          _appendEmailLog(message, from, 'error', errText2);
          _throwGmailFromHelp(from);
        }
        return;
      }
    }
    _appendEmailLog(message, from, 'error', errText);
    _throwGmailFromHelp(from);
  }
}

function _withTensorLabLegalFooter(message) {
  var src = message || {};
  var out = {};
  for (var key in src) {
    if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
  }
  out.body = _appendTensorLabLegalFooter(out.body);
  if (out.htmlBody) out.htmlBody = _appendTensorLabLegalFooterToHtml(out.htmlBody);
  return out;
}

function _appendTensorLabLegalFooter(body) {
  var text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return TENSOR_LAB_LEGAL_FOOTER;
  if (text.indexOf(TENSOR_LAB_LEGAL_FOOTER) !== -1) return text;
  return text + '\n\n' + TENSOR_LAB_LEGAL_FOOTER;
}

function _appendTensorLabLegalFooterToHtml(htmlBody) {
  var html = String(htmlBody || '').trim();
  if (!html) return '';
  if (html.indexOf(TENSOR_LAB_LEGAL_FOOTER) !== -1) return html;
  if (
    html.indexOf('This fellowship is unpaid and is not employment') !== -1 &&
    html.indexOf('thetensorlab.org/terms.html') !== -1 &&
    html.indexOf('thetensorlab.org/privacy.html') !== -1 &&
    html.indexOf('Selection decisions are final') !== -1
  ) return html;

  var footerHtml = [
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5eaf0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;">',
    _linkifyEmailText(TENSOR_LAB_LEGAL_FOOTER),
    '</div>'
  ].join('');
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, footerHtml + '</body>');
  }
  return html + footerHtml;
}

function _buildTensorLabHtmlEmail(message) {
  var subject = String((message && message.subject) || 'Tensor Lab').trim();
  var body = String((message && message.body) || '').trim();
  if (!body) return '';
  var logoUrl = _tensorLabLogoUrl();
  var preheader = _emailPreheader(message);
  return [
    '<div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;mso-hide:all;">' + _escapeHtml(preheader) + '</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#eef2f7;">',
    '<tr><td align="center" style="padding:32px 16px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;background:#ffffff;border:1px solid #dbe2ea;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">',
    '<tr><td style="background:#000000;padding:24px 30px;">',
    '<img src="' + _escapeHtml(logoUrl) + '" alt="The Tensor Lab for Computational Medicine" style="display:block;width:320px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">',
    '</td></tr>',
    '<tr><td style="padding:34px 38px 30px;font-family:Arial,Helvetica,sans-serif;color:#243041;font-size:15.5px;line-height:1.68;">',
    '<h1 style="margin:0 0 22px;font-size:23px;line-height:1.28;font-weight:700;color:#111827;">' + _escapeHtml(subject) + '</h1>',
    _plainTextToEmailHtml(body, message),
    '</td></tr>',
    '<tr><td style="padding:20px 38px;background:#f8fafc;border-top:1px solid #e5eaf0;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:13px;line-height:1.5;">',
    '<strong style="color:#334155;font-weight:700;">Tensor Lab for Computational Medicine</strong><br>',
    '<a href="https://thetensorlab.org" style="color:#0f766e;text-decoration:none;">thetensorlab.org</a>',
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>'
  ].join('');
}

function _emailPreheader(message) {
  var action = String((message && message.action) || '').trim();
  if (action === 'interview' || action === 'interview_test') {
    return 'Please choose a time for your Tensor Lab interview.';
  }
  if (action === 'congratulations') return 'Congratulations on your Tensor Lab match.';
  if (action === 'reselection') return 'One project has filled. Please update your project choices.';
  if (action === 'rejection') return 'An update on your Tensor Lab application.';
  return 'A message from Tensor Lab.';
}

function _plainTextToEmailHtml(body, message) {
  var blocks = String(body || '').replace(/\r\n/g, '\n').split(/\n\s*\n/);
  var out = [];
  blocks.forEach(function (block) {
    var text = String(block || '').trim();
    if (!text) return;
    var url = _normalizeSchedulingUrl(text);
    if (/^(?:https?:\/\/)?[^\s]+\.[^\s]+$/i.test(text) && /^https?:\/\/[^\s]+$/i.test(url)) {
      out.push(_emailButtonHtml(url, message));
      return;
    }
    if (/^Project:\s*/i.test(text)) {
      var label = _displayProjectLabel(text.replace(/^Project:\s*/i, ''));
      out.push(
        '<div style="margin:20px 0 22px;padding:17px 19px;background:#f8fafc;border:1px solid #d7e0eb;border-left:4px solid #0f766e;border-radius:12px;">' +
        '<div style="font-size:11px;line-height:1.2;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:700;margin-bottom:7px;">Project</div>' +
        '<div style="font-size:16px;line-height:1.45;color:#111827;font-weight:700;">' + _escapeHtml(label) + '</div>' +
        '</div>'
      );
      return;
    }
    if (text === TENSOR_LAB_LEGAL_FOOTER) {
      out.push('<p style="margin:8px 0 0;padding-top:16px;border-top:1px solid #e5eaf0;color:#64748b;font-size:12.5px;line-height:1.5;">' + _linkifyEmailText(text) + '</p>');
      return;
    }
    out.push('<p style="margin:0 0 17px;">' + _linkifyEmailText(text).replace(/\n/g, '<br>') + '</p>');
  });
  return out.join('');
}

function _emailButtonHtml(url, message) {
  var safe = _escapeHtml(url);
  var action = String((message && message.action) || '').trim();
  var label = action === 'reselection'
    ? 'Update project choices'
    : (action === 'interview' || action === 'interview_test')
      ? 'Choose an interview time'
      : 'Open link';
  var color = action === 'reselection' ? '#0f766e' : '#2563eb';
  var hoverless = 'display:inline-block;background:' + color + ';color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:9px;';
  return [
    '<div style="margin:24px 0 22px;">',
    '<a href="' + safe + '" style="' + hoverless + '">' + _escapeHtml(label) + '</a>',
    '<div style="margin-top:11px;font-size:12.5px;line-height:1.45;color:#64748b;">',
    '<a href="' + safe + '" style="color:#475569;text-decoration:none;word-break:break-all;">' + safe + '</a>',
    '</div>',
    '</div>'
  ].join('');
}

function _linkifyEmailText(text) {
  return _escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, function (url) {
    var trailing = '';
    while (/[.,;:!?)]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return '<a href="' + url + '" style="color:#0f766e;text-decoration:underline;word-break:break-word;">' + url + '</a>' + trailing;
  });
}

function _tensorLabLogoUrl() {
  var origin = _optionalScriptProperty('PUBLIC_SITE_ORIGIN') || 'https://thetensorlab.org';
  return String(origin || 'https://thetensorlab.org').replace(/\/+$/, '') + '/assets/images/tensor-logo.png';
}

function _escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _appendEmailLog(message, fromEmail, status, errorText) {
  try {
    var ss = _activeSpreadsheet();
    if (!ss) {
      var spreadsheetId = _optionalScriptProperty('SPREADSHEET_ID');
      if (spreadsheetId) ss = SpreadsheetApp.openById(spreadsheetId);
    }
    if (!ss) return;
    var sheet = ss.getSheetByName(SHEET_EMAIL_LOG) || ss.insertSheet(SHEET_EMAIL_LOG);
    var desired = ['timestamp', 'action', 'to', 'from', 'subject', 'status', 'project_id', 'project_label', 'run_id', 'error', 'body'];
    var existing = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];
    if (existing.join('|') !== desired.join('|')) {
      desired.forEach(function (h) {
        if (existing.indexOf(h) !== -1) return;
        sheet.getRange(1, existing.length + 1).setValue(h).setFontWeight('bold');
        existing.push(h);
      });
      if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
    }
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.appendRow(_rowForHeaders(headers, {
      timestamp: new Date(),
      action: message.action || '',
      to: message.to || '',
      from: fromEmail || '',
      subject: message.subject || '',
      status: status || '',
      project_id: message.project_id || '',
      project_label: message.project_label || '',
      run_id: message.run_id || '',
      error: errorText || '',
      body: message.body || ''
    }));
  } catch (err) {
    _logError('_appendEmailLog', err);
  }
}

function _throwGmailFromHelp(requestedFrom) {
  var runner = _effectiveUserEmail() || 'the account that owns this Apps Script project';
  throw new Error(
    'Gmail will not use From: ' + requestedFrom + ' because the script always runs as ' + runner +
    ' (the Google account that owns the spreadsheet and Apps Script project, not the browser you use to open the sheet). ' +
    'Sign in to Gmail as ' + runner + ' only, then Settings → See all settings → Accounts and Import → Send mail as → ' +
    'add ' + requestedFrom + ' and complete the verification message Google sends. ' +
    'Until that works, pick the sender that matches ' + runner + ' in the dialog, or transfer this spreadsheet and ' +
    'script to ' + requestedFrom + ' and authorize there instead.'
  );
}

function _effectiveUserEmail() {
  try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (_e) { return ''; }
}

/** Primary mailbox for the current execution (no permission needed for this read in most contexts). */
function _gmailAccountEmail() {
  var a = '';
  var b = '';
  try { a = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (_e) {}
  try { b = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (_e) {}
  return a || b || '';
}

function _normalizeSenderEmail(fromEmail) {
  if (fromEmail) return String(fromEmail).trim().toLowerCase();
  return String(_optionalScriptProperty('SEND_FROM_EMAIL') || TENSOR_LAB_SENDERS[0]).trim().toLowerCase();
}
