# DEPLOY

How to ship changes to `thetensorlab.org` and the Apps Script web app.

## Frontend, thetensorlab.org

The site is a static site served from GitHub Pages on the `main` branch.

1. Commit your changes locally.
2. Push to `origin/main`.
3. GitHub Actions builds and deploys within about 1 to 2 minutes.
4. Hard refresh `thetensorlab.org` to see the change.

### Files touched by the 2026 features

- `projects-2026.html` marketplace page.
- `projects-2026.js` card hydration from JSON.
- `applicantCounter.js` polling module.
- `styles.css` badge and card state styles.
- `data/projects_2026.json` source of truth for project metadata.
- `index.html` added nav links to the 2026 projects page.

### Updating the live counter endpoint

Open `projects-2026.html` and set the `content` attribute on the API meta tag to your deployed web app URL.

```html
<meta name="tensor-lab-api" content="https://script.google.com/macros/s/AKfycb.../exec">
```

The same URL also lives in `config.json` for ops reference.

### Updating the embedded form

Open `projects-2026.html`, find the iframe inside `#application-embed`, and replace `REPLACE_WITH_FORM_ID` in the `data-form-src` attribute with the Google Form embed URL.

## Backend, Google Apps Script

The backend is a single Apps Script project deployed as a web app. Code lives under `apps-script/` in this repo for version control.

### Initial deploy

1. Create a new Apps Script project at `script.google.com`.
2. Copy the contents of `apps-script/api.gs`, `triggers.gs`, `email.gs`, and `setup.gs` into matching files in the project.
3. Replace the manifest with `apps-script/appsscript.json` via Project Settings, Show appsscript.json.
4. Set Script properties under Project Settings:
   - `SPREADSHEET_ID`
   - `APPLICATION_FORM_ID`
   - `RESELECTION_FORM_ID`
   - `PROJECTS_JSON_URL` (for example `https://thetensorlab.org/data/projects_2026.json`)
5. From the editor, run `initialSetup` once. Authorize the scopes.
6. Run `syncFormChoices` to populate the three dropdown questions.
7. Run `installTriggers` once.
8. Click Deploy, New deployment, Web app. Execute as: Me. Who has access: Anyone. Copy the web app URL.
9. Paste that URL into `projects-2026.html` (meta tag) and `config.json`.

### Redeploying the web app

After any change to `api.gs` or `triggers.gs`:

1. In the Apps Script editor click Deploy, Manage deployments.
2. On the existing deployment click the pencil icon.
3. Pick a new version and click Deploy.
4. The URL does not change, so the frontend needs no update.

### Rotating credentials

See the matching section in `README.md`. In short, swap the Script properties values and run `installTriggers` again if form or sheet ids changed.
