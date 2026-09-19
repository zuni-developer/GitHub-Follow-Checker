# 🛰️ GitHub Follow Checker

See who isn't following you back on GitHub — entirely client-side, no backend, no data collection.

Built on top of [zuni-developer/GitHub-Follow-Checker](https://github.com/zuni-developer/GitHub-Follow-Checker).

## Features

- Compares followers vs. following for any public GitHub username
- Filterable, sortable, searchable results (not following back / fans / mutual)
- CSV export of any filtered view
- Optional personal access token for a higher API rate limit (used only in-memory, never stored)
- Live rate-limit indicator
- Light/dark mode (follows system preference, overridable)
- No backend: every request goes straight from the visitor's browser to `api.github.com`

### The "star gate"

Before running a check, the app verifies (via the GitHub API) that the entered account has starred this
repo. If not, it shows a friendly prompt with a link to star it, and a button to re-check — no login
required, no attempt to enforce it silently.

## Project structure

```
github-follow-checker/
├── index.html              # markup
├── assets/
│   ├── css/styles.css      # all styling (glassmorphic, light + dark theme tokens)
│   └── js/app.js           # all logic (vanilla JS, no build step, no dependencies)
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages deploy on push to main
├── LICENSE
└── package.json
```

No build step, no framework, no dependencies — just static files.

## Running locally

Because the app calls `fetch()` against `api.github.com`, it works best served over `http://`
rather than opened directly as a `file://` URL (some browsers and privacy extensions treat the
`file://` origin inconsistently for fetch requests).

```bash
npx serve .
# or: python3 -m http.server 5173
```

Then open the printed local URL in your browser.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` — the included workflow (`.github/workflows/deploy.yml`) builds and deploys
   automatically. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

## Security notes

- No server component. Nothing you type is ever sent anywhere except `api.github.com`.
- A pasted personal access token lives only in a JS variable for the duration of the check — it is
  never written to `localStorage`, `sessionStorage`, cookies, or any request other than the direct
  GitHub API calls it authorizes. A token with **no scopes** (classic) or a **read-only fine-grained
  token** is all this tool ever needs.
- Only the theme preference (light/dark) is persisted, via `localStorage`, on the visitor's own device.

## Troubleshooting

**"Couldn't reach GitHub"** — this means the `fetch()` call itself failed before getting a response.
Common causes, roughly in order of likelihood:
- An ad blocker or privacy extension (uBlock, Brave Shields, etc.) blocking requests to `api.github.com`
- Running the file directly from disk (`file://`) instead of serving it — see "Running locally" above
- A restrictive corporate/school network or DNS filter
- Actually being offline

Check the browser console (F12) — the underlying error is logged there for debugging.

## License

MIT — see [LICENSE](LICENSE).
