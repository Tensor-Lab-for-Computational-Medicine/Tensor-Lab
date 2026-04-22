/**
 * email.gs
 *
 * Outbound mail and pre-filled form URL helpers for Feature 2 (F2).
 * Copy is plain, direct, and avoids dashes per the brief.
 */

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

  var form = FormApp.getFormById(formId);
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
function _sendReselectionEmail(toEmail, prefilledUrl) {
  if (!toEmail) throw new Error('toEmail required');
  var subject = 'Update your Tensor Lab project choices.';
  var body = [
    'Hi,',
    '',
    'One of your top three project choices has been filled. You can swap in a replacement so your list stays at three.',
    '',
    'Open this form to update your choice:',
    prefilledUrl,
    '',
    'Your other two choices are already filled in. You only need to pick a new one.',
    '',
    'Thanks,',
    'Tensor Lab Team'
  ].join('\n');
  MailApp.sendEmail({ to: toEmail, subject: subject, body: body });
}
