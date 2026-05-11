# Tensor Lab application backend

This folder holds the Google Apps Script backend that powers three features on
`thetensorlab.org`:

- **F1 Live applicant counter.** The projects page polls the web app every
  minute and shows how many applications each project has received.
- **F2 Applicant redirection.** When leadership closes a project, the
  selected applicant receives a warm congratulations email, and every other
  applicant who ranked that project gets an email linking to their original
  application in edit mode so they can swap in a new choice without retyping
  anything.
- **F3 Google Forms integration.** The application form writes to a Google
  Sheet. An `onFormSubmit` trigger validates each row (known `project_id`,
  no duplicate emails, assigns a `redirect_token`) and stamps a status.

The frontend stays static. All state lives in one Google Sheet. All mutations
run through Apps Script triggers, under a `LockService` lock, so concurrent
writes stay consistent.

---

## Contents

| File | Purpose |
| --- | --- |
| `api.gs` | Public web app (`doGet`) endpoints plus shared constants and `FIELD_ALIASES` column lookup. |
| `triggers.gs` | `onApplicationSubmit`, `handleReselectionSubmit`, `onControlEdit`, leadership menu, `markProjectFilled`, `notifyDisplacedApplicants`. |
| `management.gs` | In-sheet dialog for leadership: setup checklist, editable email workflows, project matching, interviews, closeout, testing, and cleanup. |
| `email.gs` | Outbound mail and edit-URL / prefilled-URL helpers. Congrats, reselection, and rejection emails. |
| `setup.gs` | One-time setup, annual migrations, trigger installation. |
| `appsscript.json` | Runtime, OAuth scopes, web app access. |

---

## Architecture at a glance

```
                 Google Form (applications)
                           |
                    onFormSubmit
                           v
 +-----------------+   +---------+   +-------------------+
 | projects page   |-->| Sheet   |<--| Apps Script logic |
 | (static HTML)   |   | tabs    |   |  triggers + api   |
 +-----------------+   +---------+   +-------------------+
        ^                   ^                 |
       | HTTP GET          |                 | GmailApp
        | (counts)          |                 v
        +-------------------+         applicant emails
```

Sheet tabs:

- `applications` — form response destination, one row per application.
- `reselections` — form response destination for the fallback reselection form.
- `control` — one row per project. Columns: `project_id`, `label`, `status`, `filled_at`, `selected_applicant`.
- `redirect_log` — audit trail of redirect emails sent.
- `interview_log` — one row per interview invite with the final subject and body.
- `email_log` — unified audit trail of every Apps Script email attempt, including sender, recipient, subject, body, sent/error status, and error text.
- `error_log` — captured exceptions from triggers.

---

## Annual setup, start to finish

This is the full checklist to redo in January of each cohort year. Assume you
have nothing but this repo and an owner Google account on `thetensorlab.org`.

### 0. Prerequisites

- A Google Workspace or personal account with permission to create Forms,
  Sheets, and Apps Script projects on the same Drive.
- Write access to the `thetensorlab.org` GitHub repo.
- Node is not required. The frontend is static HTML, CSS, JS.

### 1. Update the project catalog

Edit `data/projects_YYYY.json` (for 2026 this is `data/projects_2026.json`).
Each entry needs a stable, url-safe `id` that will become the canonical
`project_id` for the year. Never reuse ids across cohorts, new cohorts get a
fresh file.

Deploy the updated JSON so the Apps Script can fetch it:

```bash
git add data/projects_YYYY.json
git commit -m "Add YYYY project catalog"
git push origin main
```

GitHub Pages serves the JSON at `https://thetensorlab.org/data/projects_YYYY.json`.

### 2. Create the Google Sheet

1. Create a new Google Sheet titled `Tensor Lab YYYY applications`.
2. Copy its id from the URL. It is the long token between `/d/` and `/edit`.
3. Leave the default tab alone. Apps Script will create all five tabs during
   `initialSetup`.

### 3. Create the application Google Form

1. New Google Form titled `Tensor Lab YYYY fellowship application`.
2. Under **Settings**:
   - **Responses > Collect email addresses** set to **Verified**. The edit-URL
     lookup in `_buildEditApplicationUrl` matches by verified email.
   - **Responses > Allow response editing** set to **On**. This is mandatory for
     F2. If you forget, `enableApplicationEditing()` turns it on programmatically.
   - **Presentation > Show progress bar** on.
3. Build the questions. Match titles to the aliases in `FIELD_ALIASES` in
   `api.gs`. Keys you must include:
   - `First choice project`, `Second choice project`, `Third choice project` as
     dropdown lists. Populate the options later with `syncFormChoices`.
   - A short text question titled exactly `redirect_token`. Mark it optional.
     Applicants never see this unless they arrive from a reselection email.
4. **Responses > Link to Sheets** and pick the sheet from step 2. Google will
   add the form columns to a new tab named after the form. Rename that tab to
   `applications`.
5. Save the form id from its URL.

If your cohort needs new application questions, update `FIELD_ALIASES` in
`api.gs` with the new question titles so the backend can still read the row.

### 4. Create the reselection Google Form (fallback)

Almost nobody sees this form because the primary path now uses edit URLs on
the main form, but it is still the documented fallback if edits are ever
disabled.

1. New Google Form titled `Tensor Lab YYYY reselection`.
2. Two short text questions: one titled exactly `redirect_token`, one titled
   exactly `new_choice`. Both required.
3. Two optional short text questions: `surviving_choice_1`, `surviving_choice_2`.
   These are prefilled by the Apps Script so the applicant can see which two
   choices survived.
4. Link responses to the same sheet from step 2. Rename the new tab to
   `reselections`.
5. Save the form id.

### 5. Create the Apps Script project

1. Open `script.google.com` and create a new project named
   `Tensor Lab YYYY backend`.
2. In the editor, create five files matching this repo: `api.gs`,
   `triggers.gs`, `management.gs`, `email.gs`, `setup.gs`. Paste the contents
   of each file from this repo into the matching Apps Script file.
3. Click the gear **Project Settings > Show "appsscript.json" manifest file**,
   then replace the manifest with the contents of `apps-script/appsscript.json`.
   The manifest declares every OAuth scope the backend needs, including
   `script.container.ui` for the leadership dialog and `script.send_mail`
   for the congratulations, reselection, and rejection emails. Do not trim
   the scope list, Apps Script will fail at runtime if any required scope
   is missing.

### 6. Set Script properties

Under **Project Settings > Script properties**, add:

| Key | Value |
| --- | --- |
| `SPREADSHEET_ID` | Sheet id from step 2. |
| `APPLICATION_FORM_ID` | Application form id from step 3. |
| `RESELECTION_FORM_ID` | Reselection form id from step 4. |
| `PROJECTS_JSON_URL` | `https://thetensorlab.org/data/projects_YYYY.json` |
| `PUBLIC_SITE_ORIGIN` | `https://thetensorlab.org` |
| `SEND_FROM_EMAIL` | Default sender for non-dialog sends: `tensorlabucsf@gmail.com` or `tensorlabumsom@gmail.com` |

The same non-secret IDs are mirrored in `FALLBACK_CONFIG` in `api.gs`. Script
Properties are still the normal place to configure a deployment, but the
fallback lets shared spreadsheet operators use the management dialog even if
Apps Script refuses that account's access to its storage service. If you change
the sheet, form, project JSON URL, or default sender, update both Script
Properties and `FALLBACK_CONFIG`.

### **Who may send email (every operator must do this)**

When leadership uses **Tensor Lab → Manage applicants** in the spreadsheet, Apps Script sends mail with Gmail’s **From** set to the address selected in the dialog (`tensorlabucsf@gmail.com` or `tensorlabumsom@gmail.com`). **Gmail only allows that if the Google account that is actually running the script is allowed to send as that address.**

- **Each person** who will send applicant email must use **their own Google account** (the personal or work Gmail they use to open Google Sheets). In **Gmail settings for that personal account**, go to **Settings → See all settings → Accounts and Import → Send mail as → Add another email address**, then add **both** Tensor Lab sender addresses: **`tensorlabucsf@gmail.com`** and **`tensorlabumsom@gmail.com`**. Complete every verification link or code Google sends. Do **not** do this only inside the shared `tensorlabumsom@gmail.com` inbox unless that shared inbox is also the account operating the spreadsheet.
- **Sharing the spreadsheet** or **reauthorizing the Apps Script project** does **not** replace **Send mail as**. Those steps do not grant **From** rights by themselves.
- The **spreadsheet / Apps Script owner** is not a substitute for the steps above: **any other user** who uses the management dialog still needs **Send mail as** on **their personal Gmail account**, unless your org handles this through **Google Workspace** (for example admin-configured **Send as** or delegation).
- Triggers and non-dialog code paths use **`SEND_FROM_EMAIL`**; set that to one allowed address and ensure the **account that runs automated sends** can send as that address the same way.
- The dialog now runs a sender preflight with `GmailApp.getAliases()` and warns when a selected sender is not available for the current account. The **Setup** tab shows the same account readiness checks inside the management UI and includes a **How to set this up** note on every checklist item.

The dialog also has a collapsible **Dummy testing workflow** under
**Closeout and tools**. It creates two synthetic applications from entered test
emails, sends only those two emails through the selected sender, and marks
synthetic rows with `test_` statuses so normal applicant lists and public
counts ignore them. Use **Remove test data and reset projects** afterward to
delete the rows and reopen the tested project if you left it filled.

### New operator onboarding, start to finish

Use this checklist for every teammate who will open **Tensor Lab > Manage
applicants** or send applicant email.

1. Confirm the teammate is using the correct Google account.
   Open Google Sheets with the teammate's own Google account, usually their
   personal or work Gmail. Do not do operator setup inside the shared
   `tensorlabumsom@gmail.com` inbox unless that shared inbox is the account
   that will operate the spreadsheet. If the browser is signed into multiple
   Google accounts, use a fresh Chrome profile or private window to avoid
   authorizing the wrong account.

2. Share the applications spreadsheet.
   The spreadsheet owner should share the applications spreadsheet directly
   with that Google account as **Editor**. Apps Script project editor access is
   helpful for debugging, but spreadsheet Editor access is what the management
   dialog needs for normal use.

3. Set up Gmail **Send mail as** for that same personal account.
   In Gmail for the account that opens the spreadsheet, go to **Settings > See
   all settings > Accounts and Import > Send mail as > Add another email
   address**. Add both `tensorlabumsom@gmail.com` and
   `tensorlabucsf@gmail.com`, then complete Google's verification email or
   code. This is a Gmail setting, not a general Google Account setting.
   This is separate from Apps Script authorization.

4. Open the spreadsheet and run **Tensor Lab > Authorize this account**.
   If Google shows **Google hasn't verified this app**, click **Advanced**,
   then **Go to Tensor Lab Backend 2026 (unsafe)**, then continue through the
   permission screen and click **Allow**. This is expected for an internal
   Apps Script project that has not gone through Google's public verification.

5. If they click **Back to Safety**, run authorization again.
   **Back to Safety** cancels the authorization. It does not grant permissions.
   Close the failed authorization tab, return to the spreadsheet, and click
   **Tensor Lab > Authorize this account** again.

6. If no consent screen appears, check whether it was already approved.
   Google only shows the consent screen when the account has not already
   approved the current script scopes. To force a fresh prompt, open the
   operator's **Google Account > Security > Third-party apps and services**,
   remove **Tensor Lab Backend 2026**, then return to the spreadsheet and run
   **Tensor Lab > Authorize this account** again.

7. Reopen the spreadsheet and check the management dialog.
   Close and reopen the spreadsheet tab, then click **Tensor Lab > Manage
   applicants**. Start on the **Setup** tab, click **Refresh setup status**,
   and work through any **How to set this up** notes.

8. Send a test before contacting applicants.
   On **Invite to interview**, choose a project and applicant, enter the
   reviewer's name and scheduling link, enter a test recipient email, then
   click **Send test email**. Confirm the message arrives from the selected
   Tensor Lab sender and looks correct before sending a real invite.

### 7. Run setup functions, in this order

From the Apps Script editor, pick each function from the dropdown and click
**Run**. Authorize when prompted.

1. `initialSetup` — creates `control`, `redirect_log`, `error_log` tabs and
   appends a `status` column to `applications` if missing. Safe to rerun.
2. `seedControlFromProjects` — adds one row per missing `project_id` from the
   JSON catalog into `control` with `status = open`. Existing rows keep their
   current status.
3. `syncFormChoices` — copies the project dropdown options from
   `projects_YYYY.json` into the three `choice_N` questions on the application
   form.
4. `captureFormLabels` — reads the live dropdown labels back from the form and
   writes them into the `label` column of `control`. The `_extractProjectId`
   helper uses this to translate human readable labels back into slugs.
5. `enableApplicationEditing` — flips on `setAllowResponseEdits(true)` and
   `setCollectEmail(true)` on the application form. Required for F2 edit URLs.
6. `installTriggers` — installs four triggers:
   - `onApplicationSubmit` on the sheet (F3 validation).
   - `handleReselectionSubmit` on the sheet (F2 fallback path).
   - `onControlEdit` on the sheet (F2 auto-fires when leadership edits `control`).
   - `onOpenSpreadsheet` on the sheet (adds the **Tensor Lab** menu,
     including a safe **Authorize this account** first-run helper).

### 8. Deploy the web app

1. Click **Deploy > New deployment**.
2. Type: **Web app**.
3. Description: `YYYY public API`.
4. Execute as: **Me**.
5. Who has access: **Anyone**.
6. Click **Deploy** and copy the `/exec` URL.

### 9. Point the frontend at the web app

Edit `config.json` and `projects-YYYY.html` in the repo root. Paste the
`/exec` URL into:

- `config.json` key `apps_script_web_app_url`.
- `projects-YYYY.html` meta tag:

  ```html
  <meta name="tensor-lab-api" content="https://script.google.com/macros/s/.../exec">
  ```

Also set the application form iframe src in `projects-YYYY.html`:

```html
<iframe data-form-src="https://docs.google.com/forms/d/e/APPLICATION_FORM_ID/viewform?embedded=true" ...></iframe>
```

Use the `/d/e/.../viewform` URL, not the edit URL. Commit and push to main.
GitHub Pages deploys within two minutes.

### 10. Smoke test

Submit one test application. Verify:

- `applications` has a new row with `status = submitted` and a `redirect_token`.
- Projects page counter for the chosen project goes up within 60 seconds.
- Submitting again from the same email without a token hits `status = rejected_duplicate`.
- Submitting with a garbage `project_id` hits `status = rejected_invalid_project`.

Then test F2. Pick any project with at least two applicants, open the sheet,
and in the `control` tab change that row's `status` to `filled` with a
`selected_applicant` email. Every other applicant who ranked that project
should receive an email within about one minute with a link that opens their
original application in edit mode.

---

## Operating the system during the cohort cycle

### Filling a project and rejecting applicants

Open the spreadsheet and click **Tensor Lab > Manage applicants…**. A modal
dialog opens with four top-level tabs: **Setup**, **Interviews**,
**Match projects**, and **Closeout and tools**. The less common dummy testing,
cleanup, and project reset tools live inside collapsible sections under
**Closeout and tools** so the daily workflows stay easier to scan.

First time on a Google account, run **Tensor Lab > Authorize this account**
and accept the OAuth prompt before opening the management dialog. This is per
Google account, not per spreadsheet share, and it is separate from Gmail
`Send mail as`.

Start on the dialog's **Setup** tab. It checks the active account, spreadsheet
tabs, project control rows, application form access, Gmail sender aliases,
installable triggers, and personal defaults storage. Use **Run authorization
check** there if a new operator has not granted OAuth yet, then use **Refresh
setup status** after fixing any warning. Google only shows the consent screen
if the account has not already approved the current script scopes. If no pop-up
appears, the account may already be authorized. To force a fresh prompt, revoke
access to **Tensor Lab Backend 2026** in Google Account security settings, then
run the authorization check again. Google sometimes hides the active account
email from Apps Script; that is informational, not a blocker, as long as the
sender checks pass. Each checklist row includes the next setup action,
including whether the operator can fix it themselves or should ask the Apps
Script owner to run a setup function.

**Match projects.** Pick a project from the dropdown (only unfilled projects
appear, with their live applicant counts). The applicant dropdown then
auto-populates with everyone who ranked that project, annotated with their
rank (1st, 2nd, or 3rd choice). Pick one, review the generated winner and
reselection email drafts, edit any wording you want, send test emails if
needed, then click **Preview recipients**. After the preview looks right,
click **Fill project and send emails**. The real send rechecks the recipient
list and refuses to run if it changed after preview. Behind the scenes this
calls `markProjectFilled`, which:

1. Flips the `control` row to `filled`, stamps `filled_at`, writes
   `selected_applicant`.
2. Stamps the winner's `applications.status` to `selected`.
3. Sends the winner a congratulations email (deduped via `redirect_log`).
4. Sends every other applicant who ranked this project a **reselection**
   email (not a rejection) linking to their original application in edit
   mode, so they can swap in a new choice if they want.
5. Clears the counts cache so the public website flips the project to
   `filled` within a minute.

Non-winners keep `applications.status = submitted`. They are still eligible
for their other two choices and for any later matching round. They are only
rejected when leadership explicitly says so, either by **Decline one applicant**
or by the **Close cohort** action after every project is filled.

All management-dialog email communications are editable before send:
winner congratulations, reselection requests, interview invites, individual
declines, and bulk closeout declines. Placeholders such as `{{first_name}}`,
`{{project}}`, and `{{reselection_link}}` are replaced at send time. Keep
`{{reselection_link}}` in reselection emails so applicants receive their update
link.

**Invite to interview.** Mentors use this tab to send an applicant a meeting
scheduling link (Calendly, Cal.com, SavvyCal, Google Calendar appointment page,
anything with a public link). Pick the project you are interviewing for, pick
an applicant who ranked it, enter your name, and paste your scheduling URL.
The dialog generates a draft subject and body, then the sender can edit every
word before clicking **Send interview invite**. Enter a test recipient and use
**Send test email** to send the current draft there first. The applicant
receives the subject and body shown in the dialog inside a formatted Tensor Lab
email wrapper with the logo, a readable project card, and a scheduling button.
Scheduling links are normalized automatically, so pasted links such as
`https://https://calendly.com/...` are cleaned before sending. Links that still
are not valid `http://` or `https://` URLs are rejected before an email can be
sent. Every invite is appended to an
`interview_log` tab (auto-created on first use) with timestamp, email, project,
reviewer, URL, subject, and body, and every email attempt is also appended to
`email_log`. Your name, link, and test recipient are remembered per Google
account, so repeat invites from the same mentor prefill automatically. Sending an invite does
**not** change the
applicant's status, they stay pending until you separately fill a project or
reject them.

**Decline one applicant.** Under **Closeout and tools**, use this for explicit
decisions to drop an applicant,
for example after a technical screening or when someone becomes unavailable.
Pick a pending applicant from the dropdown (anyone with status `submitted`
or empty, meaning not already selected or rejected). Generate the decline
draft, edit the subject and body, optionally send a test, then click
**Reject and send decline email**. The applicant's row is stamped `rejected`
and the exact draft shown in the dialog goes out. Do not use this just because
a single choice got filled by someone else.

**Close cohort.** Under **Closeout and tools**, this is only enabled after every project in `control` has status
`filled`. The tab shows live progress (e.g. `8 of 14 projects filled`) and
lists remaining open projects. When all projects are closed, generate and edit
the closeout decline draft, send a test if needed, then click **Preview
rejection recipients** to review exactly who will receive it. The real send
rechecks the list and refuses to run if it changed after preview. Clicking the
send button emails every applicant still in pending state and stamps each row
as `rejected`. Server-side guard: the function refuses to run and throws an
error if any project is still open, so even a motivated power user cannot
accidentally bulk-reject the cohort early.

**Power users: direct sheet edit still works.** On the `control` tab you can
paste the selected email into `selected_applicant` and change `status` to
`filled`. The `onControlEdit` trigger runs the same flow as the dialog, but it
uses the default email copy because there is no UI surface for editing drafts.
Use the dialog when you want to customize the applicant emails.

### Reopening a project

Change `status` back to `open` on the `control` row. The `onControlEdit`
trigger only fires on transitions *into* `filled`, so reopening is a no-op
for triggers. Manually clear `filled_at` and `selected_applicant` if you want
the row to look pristine.

To reopen every project after dummy testing or an accidental all-filled state,
use **Tensor Lab > Reopen all projects**, click **Reopen all projects and
resync** under **Closeout and tools > Remove test data and reset projects**, or run
`reopenAllProjects` from the Apps Script editor. Do not use
`seedControlFromProjects` for this, because it preserves existing filled
statuses by design. In the management dialog, this reset tool is now under
**Closeout and tools > Remove test data and reset projects**.

### Changing project list mid-cycle

Edit `data/projects_YYYY.json`, push, then either:

- **One-click:** open the spreadsheet and pick **Tensor Lab > Sync project
  catalog from JSON**. This calls `refreshCatalogFromJson`, which runs all
  three steps below in order, clears the counts cache, and toasts the new
  project count. Safe to rerun, no op if the JSON is unchanged.
- **Manual:** from the Apps Script editor, run in this order:
  1. `seedControlFromProjects` — appends new project rows, does not delete.
  2. `syncFormChoices` — updates the dropdown choices on the application form.
  3. `captureFormLabels` — refreshes the `label` column so `_extractProjectId`
     keeps working.

### Clearing the counts cache

Either wait 60 seconds, or click **Tensor Lab > Refresh applicant counts cache**
in the spreadsheet menu.

---

## Troubleshooting

**Counter shows "Be the first to apply" even though rows exist.**
Check that the `label` column in `control` is populated. Run `captureFormLabels`.
Then redeploy the web app (**Deploy > Manage deployments > pencil > New version**).

**Email goes out but the link opens a blank form.**
`enableApplicationEditing()` was never run, or the form's **Responses > Allow
response editing** was turned back off manually. Run the helper again and
resend the affected emails by manually calling
`notifyDisplacedApplicants('project_id', 'selected_email')`.

**`TypeError: FormApp.getFormById is not a function`.**
That method does not exist. Use `FormApp.openById(id)`.

**`onControlEdit` did not fire when I changed status.**
Simple `onEdit` triggers do not fire, only installable ones do. Rerun
`installTriggers`. If the trigger is installed but still silent, check the
**Executions** tab in the Apps Script editor for permission errors.

**`PERMISSION_DENIED` or `server error occurred while reading from storage`.**
Each person who opens the shared spreadsheet with a different Google account
must authorize the bound Apps Script once. First try **Tensor Lab > Authorize
this account** from the spreadsheet menu, then accept the OAuth prompt and
reopen **Tensor Lab > Manage applicants…**. If the menu item is not available
yet, open **Extensions → Apps Script**, run `authorizeManagementUi`, and accept
the prompt.

Inside the management dialog, the **Setup** tab can also run
`authorizeManagementUi` and then refresh a checklist of sheet, form, trigger,
sender, and account status. The authorization helper intentionally skips Apps
Script storage for shared spreadsheet operators. The dialog uses fallback
configuration when storage is blocked.

Google may not show the consent screen every time. It only appears when the
account has not already approved the current scopes. To force it, open the
Google Account used in Sheets, go to **Security > Third-party apps and services**,
remove access for **Tensor Lab Backend 2026**, then run
**Tensor Lab > Authorize this account** again.

If the user clicked **Back to Safety** on the **Google hasn't verified this
app** screen, authorization was canceled. Nothing was granted. Have them close
that tab and run **Tensor Lab > Authorize this account** again. On the warning
screen they must click **Advanced**, then **Go to Tensor Lab Backend 2026
(unsafe)**, then click **Allow** on the permissions screen.

If the authorization screen still does not appear, make sure the user is in the
same Google account in Sheets and Gmail, then revoke **Tensor Lab Backend 2026**
from **Google Account > Security > Third-party apps and services** and run
authorization again.

If the error specifically mentions **reading from storage**, that is Apps
Script storage, not Gmail `Send mail as`. It can happen even when the user is
an editor on both the spreadsheet and the script. Publish the latest Apps
Script files so management reads the active spreadsheet first, treats
CacheService as optional, and uses `FALLBACK_CONFIG` from `api.gs` when Script
Properties are blocked. This is separate from sheet sharing and from Gmail
`Send mail as` setup.

**Counts endpoint returns `{"ok":false,"error":"unknown_action"}`.**
That is the default response to a GET with no `?action=` param. Hit
`<web-app-url>?action=getProjectCounts` to verify.

---

## Security posture

- The web app runs as the deploying account but is callable anonymously. Every
  `doGet` handler is read only and returns aggregate counts or public form
  URLs, never raw applications.
- All sheet writes route through triggers protected by `LockService`.
- Each applicant row carries a `redirect_token`. The reselection form cannot
  be abused to overwrite an arbitrary row because the trigger keys writes by
  token.
- Script properties hold form and sheet ids. Nothing secret ships in the
  frontend, only the `/exec` URL which is public by design.

---

## Year over year migration checklist

Copy this into an issue at the start of each cycle.

- [ ] Create `data/projects_YYYY.json` and push to main.
- [ ] Create new Google Sheet, Form, and reselection Form for the year.
- [ ] Create new Apps Script project, paste all five `.gs` files, paste manifest.
- [ ] Set five script properties.
- [ ] Run `initialSetup`, `seedControlFromProjects`, `syncFormChoices`,
      `captureFormLabels`, `enableApplicationEditing`, `installTriggers`.
- [ ] Deploy web app as Anyone.
- [ ] Update `config.json` and `projects-YYYY.html` with new URLs.
- [ ] Smoke test submit, duplicate rejection, counter update.
- [ ] Smoke test `control` edit triggers a redirect email.
- [ ] Announce the form link publicly.
