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
| `management.gs` | In-sheet dialog for leadership: pick projects and applicants from dropdowns, fill projects, reject applicants, close the cohort. |
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

The spreadsheet management dialog lets leadership choose
`tensorlabucsf@gmail.com` or `tensorlabumsom@gmail.com` for each send. Email is
sent with Gmail's `from` option, so both accounts must be available to the
executing account as verified Gmail send-as aliases, or the script/triggers must
be authorized from the matching Gmail account. Otherwise Google rejects the send
instead of silently sending from a personal account. If you see
`Exception: Invalid argument: name@gmail.com`, that address is not yet a verified
**Send mail as** alias for the Google account that runs and authorizes the
script, add it in Gmail settings on that same account, or reauthorize while
signed into that mailbox.

The dialog also has a **Test workflow** tab. It creates two synthetic
applications from entered test emails, sends only those two emails through the
selected sender, and marks synthetic rows with `test_` statuses so normal
applicant lists and public counts ignore them. Use **Remove test data** afterward
to delete the rows and reopen the tested project if you left it filled.

### 7. Run setup functions, in this order

From the Apps Script editor, pick each function from the dropdown and click
**Run**. Authorize when prompted.

1. `initialSetup` — creates `control`, `redirect_log`, `error_log` tabs and
   appends a `status` column to `applications` if missing. Safe to rerun.
2. `seedControlFromProjects` — adds one row per `project_id` from the JSON
   catalog into `control` with `status = open`.
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
   - `onOpenSpreadsheet` on the sheet (adds the **Tensor Lab** menu).

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
dialog opens with four tabs: **Fill project**, **Invite to interview**,
**Reject applicant**, and **Close cohort**.

**Fill project.** Pick a project from the dropdown (only unfilled projects
appear, with their live applicant counts). The applicant dropdown then
auto-populates with everyone who ranked that project, annotated with their
rank (1st, 2nd, or 3rd choice). Pick one and click **Fill project and send
emails**. Behind the scenes this calls `markProjectFilled`, which:

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
rejected when leadership explicitly says so, either by the Reject applicant
tab or by the Close cohort action after every project is filled.

**Invite to interview.** Mentors use this tab to send an applicant a meeting
scheduling link (Calendly, Cal.com, SavvyCal, Google Calendar appointment page,
anything with a public link). Pick the project you are interviewing for, pick
an applicant who ranked it, enter your name and paste your scheduling URL,
optionally add a short personal note, and click **Send interview invite**.
The applicant receives a warm email introducing you, the project, and the
link. Every invite is appended to an `interview_log` tab (auto-created on
first use) with timestamp, email, project, reviewer, and URL. Your name and
link are remembered per Google account, so repeat invites from the same
mentor prefill automatically. Sending an invite does **not** change the
applicant's status, they stay pending until you separately fill a project or
reject them.

**Reject applicant.** Use this for explicit decisions to drop an applicant,
for example after a technical screening or when someone becomes unavailable.
Pick a pending applicant from the dropdown (anyone with status `submitted`
or empty, i.e. not already selected or rejected). Optionally write a short
reviewer note to include in the email body as a personal aside. Click
**Reject and send decline email**. The applicant's row is stamped `rejected`
and the decline email goes out. Do not use this just because a single choice
got filled by someone else.

**Close cohort.** Only enabled after every project in `control` has status
`filled`. The tab shows live progress (e.g. `8 of 14 projects filled`) and
lists remaining open projects. When all projects are closed, clicking the
button sends the standard decline email to every applicant still in pending
state and stamps each row as `rejected`. Server-side guard: the function
refuses to run and throws an error if any project is still open, so even a
motivated power user cannot accidentally bulk-reject the cohort early.

**Power users: direct sheet edit still works.** On the `control` tab you can
paste the selected email into `selected_applicant` and change `status` to
`filled`. The `onControlEdit` trigger runs the same flow as the dialog.

### Reopening a project

Change `status` back to `open` on the `control` row. The `onControlEdit`
trigger only fires on transitions *into* `filled`, so reopening is a no-op
for triggers. Manually clear `filled_at` and `selected_applicant` if you want
the row to look pristine.

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
