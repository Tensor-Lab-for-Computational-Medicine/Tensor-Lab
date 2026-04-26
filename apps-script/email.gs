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
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('APPLICATION_FORM_ID');
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
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('RESELECTION_FORM_ID');
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

/**
 * Send the selected applicant a warm, useful congratulations email. Copy is
 * intentionally warm but grounded so it reads as human, not corporate. No
 * dashes per the house style.
 * Inputs: toEmail string, projectLabel string (human readable project title).
 * Output: void. Throws on invalid email.
 */
function _sendCongratulationsEmail(toEmail, projectLabel, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  var label = projectLabel || 'your Tensor Lab project';
  var subject = 'Welcome to Tensor Lab. You have been selected.';
  var body = [
    'Hi,',
    '',
    'Congratulations. You have been selected for the Tensor Lab fellowship and matched with:',
    '',
    '    ' + label,
    '',
    'This round was competitive. Your application stood out on the strength of your work and the way you think, and we are genuinely excited to have you on the team.',
    '',
    'A few things to expect from here:',
    '',
    '  1. Your project lead will reach out within the next few business days to introduce the team, share background reading, and schedule a kickoff.',
    '  2. We will send onboarding details (communication channels, shared drives, any paperwork) in a follow up email shortly after that.',
    '  3. If anything about your availability, time zone, or start date has shifted since you applied, reply to this email and let us know so we can plan around it.',
    '',
    'In the meantime, no action is required. Take a moment to enjoy the news, and reply any time if a question comes up.',
    '',
    'Welcome aboard. We are looking forward to working with you.',
    '',
    'Warmly,',
    'Tensor Lab Team'
  ].join('\n');
  _sendTensorLabEmail({ to: toEmail, subject: subject, body: body }, fromEmail);
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
  var greeting = firstName
    ? 'Hi ' + String(firstName).trim() + ','
    : 'Hi,';
  var subject = 'An update on your Tensor Lab application';
  var bodyLines = [
    greeting,
    '',
    'Thank you for applying to Tensor Lab and for putting real thought into your application. We know a submission like yours takes meaningful time, and we read every one with care.',
    '',
    'After careful review, we are not able to offer you a place in this cohort. This round was competitive, and each of our projects could only take one fellow whose specific focus and skills lined up tightly with what that team needs this summer. That is the main reason we had to make the call we did.',
    '',
    'This decision reflects the narrow shape of a single cycle, not a judgment on your ability or your promise. We have seen applicants we could not take in one year come back and do outstanding work with us the next, and we would genuinely welcome a future application from you.'
  ];
  if (personalNote) {
    bodyLines.push('');
    bodyLines.push('A note from your reviewer:');
    bodyLines.push('');
    bodyLines.push('    ' + String(personalNote).trim());
  }
  bodyLines.push('');
  bodyLines.push('If specific feedback would be useful, reply to this email. We cannot always respond quickly, but we will try to share something honest and useful when we can.');
  bodyLines.push('');
  bodyLines.push('Wishing you the best in what you take on from here, and thank you again for the time and thought you put into applying.');
  bodyLines.push('');
  bodyLines.push('Warmly,');
  bodyLines.push('Tensor Lab Team');
  _sendTensorLabEmail({ to: toEmail, subject: subject, body: bodyLines.join('\n') }, fromEmail);
}

/**
 * Send an interview invite with the reviewer's scheduling link. Copy is warm
 * and direct: explains why we are reaching out, who the reviewer is, what the
 * interview covers, and how to pick a slot. No dashes per the house style.
 *
 * Inputs:
 *   toEmail         string, required
 *   firstName       string, optional (for the greeting)
 *   reviewerName    string, required (full name, e.g. "Aaron Ge")
 *   projectLabel    string, required (human-readable project title)
 *   schedulingUrl   string, required (Calendly, Cal.com, SavvyCal, etc.)
 *   personalNote    string, optional (shown as a reviewer note paragraph)
 * Output: void. Throws on invalid email.
 */
function _sendInterviewInviteEmail(toEmail, firstName, reviewerName, projectLabel, schedulingUrl, personalNote, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  if (!reviewerName) throw new Error('reviewerName required');
  if (!schedulingUrl) throw new Error('schedulingUrl required');
  var greeting = firstName ? 'Hi ' + String(firstName).trim() + ',' : 'Hi,';
  var label = projectLabel || 'one of your Tensor Lab project choices';
  var reviewer = String(reviewerName).trim();
  var subject = 'Tensor Lab interview for ' + label;
  var lines = [
    greeting,
    '',
    'Thank you for your application to Tensor Lab. Your materials for the following project caught our attention, and we would like to talk with you about it:',
    '',
    '    ' + label,
    '',
    'I am ' + reviewer + ', one of the mentors on this project, and I will be running your interview. Plan for about thirty minutes. We will talk through your background, your interest in the project, and a couple of technical questions so we can both check that this is the right fit.',
    '',
    'Please pick a time that works for you here:',
    '',
    '    ' + String(schedulingUrl).trim(),
    ''
  ];
  if (personalNote) {
    lines.push('A note from me:');
    lines.push('');
    lines.push('    ' + String(personalNote).trim());
    lines.push('');
  }
  lines.push('If none of the available slots work, reply to this email and we will find another time.');
  lines.push('');
  lines.push('Looking forward to talking with you,');
  lines.push(reviewer);
  lines.push('Tensor Lab');
  _sendTensorLabEmail({ to: toEmail, subject: subject, body: lines.join('\n') }, fromEmail);
}

function _sendReselectionEmail(toEmail, linkUrl, mode, projectLabel, fromEmail) {
  if (!toEmail) throw new Error('toEmail required');
  var isEdit = mode === 'edit';
  var label = projectLabel || 'one of your top three project choices';
  var subject = 'Update your Tensor Lab project choices.';
  var intro = isEdit
    ? 'The following project has been filled: ' + label + '. The link below reopens your original application with every answer you already gave. Swap that filled project for a new one and resubmit. You do not need to retype anything else.'
    : 'The following project has been filled: ' + label + '. You can swap in a replacement so your list stays at three. Your other two choices are already filled in on the link below.';
  var body = [
    'Hi,',
    '',
    intro,
    '',
    linkUrl,
    '',
    'Thanks,',
    'Tensor Lab Team'
  ].join('\n');
  _sendTensorLabEmail({ to: toEmail, subject: subject, body: body }, fromEmail);
}

/**
 * Central mail sender. The dialog can pass either approved Tensor Lab Gmail
 * account; non-dialog sends fall back to SEND_FROM_EMAIL.
 */
function _sendTensorLabEmail(message, fromEmail) {
  var from = _normalizeSenderEmail(fromEmail);
  if (TENSOR_LAB_SENDERS.indexOf(from) === -1) {
    throw new Error('Unsupported sender: ' + from + '. Pick tensorlabucsf@gmail.com or tensorlabumsom@gmail.com.');
  }
  try {
    GmailApp.sendEmail(message.to, message.subject, message.body, {
      from: from,
      name: 'Tensor Lab Team',
      replyTo: from
    });
  } catch (e) {
    var errText = (e && e.message) ? String(e.message) : String(e);
    if (/invalid argument/i.test(errText)) {
      throw new Error(
        'Gmail will not send as ' + from + ' from the account that runs this script. ' +
        'In Gmail for the same Google account that authorizes this script, go to Settings, Accounts, ' +
        'and add "Send mail as" for ' + from + ' (verify the address). ' +
        'Or deploy/authorize the Apps Script while signed in as that mailbox.'
      );
    }
    throw e;
  }
}

function _normalizeSenderEmail(fromEmail) {
  var props = PropertiesService.getScriptProperties();
  return String(fromEmail || props.getProperty('SEND_FROM_EMAIL') || TENSOR_LAB_SENDERS[0]).trim().toLowerCase();
}
