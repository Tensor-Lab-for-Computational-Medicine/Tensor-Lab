# Tensor Lab

Tensor Lab is a medical student fellowship program that pairs computer science
students with physician mentors on clinical AI research projects.

Live site: https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/

## Start Here

Most current operational work is for the 2026 application system:

- Applicant project counters on the public site.
- Google Forms submission validation.
- Project fill and reselection emails.
- Interview invite emails from the spreadsheet management dialog.
- Final cohort closeout emails.

Detailed backend documentation lives in [apps-script/README.md](apps-script/README.md).
Use this README as the short map.

## New Operator Setup

Use this checklist for every teammate who will open **Tensor Lab > Manage
applicants** or send applicant emails.

1. Use the correct Google account.
   Open Google Sheets and Gmail in the account that will operate the dialog,
   such as `tensorlabumsom@gmail.com`. If the browser is signed into multiple
   Google accounts, use a fresh Chrome profile or private window.

2. Share the applications spreadsheet.
   The spreadsheet owner should share the applications spreadsheet directly
   with that account as **Editor**.

3. Set up Gmail **Send mail as**.
   In Gmail for that same account, go to **Settings > See all settings >
   Accounts and Import > Send mail as > Add another email address**. Add the
   Tensor Lab sender the operator will use, such as `tensorlabumsom@gmail.com`
   or `tensorlabucsf@gmail.com`, and complete Google's verification email or
   code.

4. Authorize Apps Script.
   In the spreadsheet, choose **Tensor Lab > Authorize this account**.

5. If Google shows **Google hasn't verified this app**, continue through it.
   Click **Advanced**, then **Go to Tensor Lab Backend 2026 (unsafe)**, then
   click **Allow** on the permissions screen. This warning is expected for an
   internal Apps Script project that has not gone through Google's public
   verification.

6. If they click **Back to Safety**, run authorization again.
   Back to Safety cancels the authorization. It does not grant permissions.
   Close that tab, return to the spreadsheet, and click **Tensor Lab >
   Authorize this account** again.

7. If no consent screen appears, force a fresh prompt.
   Google only shows the consent screen when the account has not already
   approved the current script scopes. Open the operator's **Google Account >
   Security > Third-party apps and services**, remove **Tensor Lab Backend
   2026**, then return to the spreadsheet and run **Tensor Lab > Authorize this
   account** again.

8. Check the management dialog.
   Reopen the spreadsheet tab, choose **Tensor Lab > Manage applicants**, start
   on the **Setup** tab, and click **Refresh setup status**. Each row includes
   a **How to set this up** note.

9. Send a test email before contacting applicants.
   On **Invite to interview**, choose a project and applicant, enter the
   reviewer's name and scheduling link, enter a test recipient, and click
   **Send test email**. Confirm the email arrives from the selected Tensor Lab
   sender and looks correct.

## Common Operator Issues

**No authorization pop-up appears.**
The account may already have approved the app. Revoke **Tensor Lab Backend
2026** under **Google Account > Security > Third-party apps and services**,
then run **Tensor Lab > Authorize this account** again.

**They clicked Back to Safety.**
Nothing was authorized. Have them run **Tensor Lab > Authorize this account**
again and continue through **Advanced > Go to Tensor Lab Backend 2026
(unsafe) > Allow**.

**`PERMISSION_DENIED` or `server error occurred while reading from storage`.**
This is Apps Script storage, not Gmail. Use the latest Apps Script files, then
open **Manage applicants > Setup**. The dialog has a limited setup mode and
fallback configuration for shared spreadsheet operators.

**Sender is unavailable.**
The operator must add the selected Tensor Lab sender under Gmail **Send mail
as** in the same Google account that opens the spreadsheet. Sharing the sheet
does not grant From permission.

## Management Workflow

Open the applications spreadsheet and choose **Tensor Lab > Manage
applicants**.

- **Setup:** account, sheet, form, sender, and trigger readiness checks.
- **Fill project:** preview the winner and reselection recipients before
  sending emails.
- **Invite to interview:** generate an editable email, send a test, then send
  the real invite.
- **Reject applicant:** send an individual decline email.
- **Test workflow:** create dummy applicants and send controlled test emails.
- **Remove test data:** delete synthetic rows and reopen tested projects.
- **Close cohort:** preview and reject all remaining pending applicants after
  every project is filled.

## Apps Script Owner Setup

For a new cohort or a rebuilt backend, follow the full guide in
[apps-script/README.md](apps-script/README.md). In short:

1. Create the applications spreadsheet.
2. Create the application and reselection Google Forms.
3. Create or update the Apps Script project with files from `apps-script/`.
4. Set Script Properties and mirror non-secret IDs in `FALLBACK_CONFIG` in
   `apps-script/api.gs`.
5. Run `initialSetup`.
6. Run `seedControlFromProjects`.
7. Run `syncFormChoices`.
8. Run `captureFormLabels`.
9. Run `enableApplicationEditing`.
10. Run `installTriggers`.
11. Deploy the web app and update `config.json` and `projects-2026.html`.
12. Smoke test with dummy applicants before using real applicant data.

## Repo Map

```text
Tensor-Lab/
|-- apps-script/              Google Apps Script backend
|-- assets/                   CSS, JS, images, portraits, posters
|-- data/projects_2026.json   Canonical 2026 project catalog
|-- projects-2026.html        Project marketplace and application page
|-- config.json               Public frontend configuration
|-- index.html                Main website
`-- Documentation/            Supporting PDFs and guides
```

Key backend files:

- `apps-script/api.gs`: constants, web API, sheet helpers, fallback config.
- `apps-script/management.gs`: spreadsheet management dialog.
- `apps-script/email.gs`: applicant email copy, HTML email wrapper, logging.
- `apps-script/triggers.gs`: form, sheet, menu, and fill-project triggers.
- `apps-script/setup.gs`: setup and maintenance functions.

## Website Updates

The public website is static HTML, CSS, and JavaScript. There is no build
step.

For local preview:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Common edits:

- Main website copy: `index.html`
- Site styling: `assets/css/styles.css`
- Project catalog: `data/projects_2026.json`
- 2026 project page behavior: `assets/js/projects-2026.js`
- Applicant counter: `assets/js/applicantCounter.js`

## Deployment

The site deploys from `main` through GitHub Pages. After pushing to `main`,
wait a few minutes and hard refresh the live site.

Apps Script changes are separate. Copy updated files from `apps-script/` into
the Apps Script editor, save, and redeploy if the web app code changed.

## Useful Links

- Backend guide: [apps-script/README.md](apps-script/README.md)
- Live site: https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/
- GitHub Pages: https://pages.github.com/
- License: [LICENSE](LICENSE)
