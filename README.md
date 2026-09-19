# 🛰️ GitHub Follow Checker

See who isn't following you back on GitHub,  entirely client-side, no backend, no data collection.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## Features

- Compares followers vs. following for any public GitHub username
- Filterable, sortable, searchable results (not following back / fans / mutual)
- CSV export of any filtered view
- Optional personal access token for a higher API rate limit (used only in-memory, never stored)
- Live rate-limit indicator
- Light/dark mode (follows system preference, overridable)
- No backend: every request goes straight from the visitor's browser to `api.github.com`

## The "star gate"

Before running a check, the app verifies (via the GitHub API) that the entered account has starred
this repo. If not, it shows a friendly prompt with a link to star it and a button to re-check, no
login required, and nothing enforced silently.

## Security

- No server component. Nothing typed into the page is ever sent anywhere except `api.github.com`.
- A pasted personal access token lives only in a JS variable for the duration of the check, never
  written to `localStorage`, `sessionStorage`, cookies, or any request other than the GitHub API
  calls it authorizes. A token with **no scopes** (classic) or a **read-only fine-grained token**
  is all this tool ever needs.
- Only the theme preference (light/dark) is persisted, via `localStorage`, on the visitor's own
  device.

Found an actual vulnerability? Please report it privately, see [SECURITY.md](SECURITY.md) rather
than opening a public issue.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, manual
test checklist, and notes on the security-sensitive parts of the codebase before opening a PR.
This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Troubleshooting

**"Couldn't reach GitHub"**, this means the `fetch()` call itself failed before getting a
response. Common causes, roughly in order of likelihood:

- An ad blocker or privacy extension (uBlock, Brave Shields, etc.) blocking requests to
  `api.github.com`
- Running the file directly from disk (`file://`) instead of serving it, see
  [Running locally](#running-locally) above
- A restrictive corporate/school network or DNS filter
- Actually being offline

Check the browser console (F12), the underlying error is logged there for debugging.

**Rate limit reached**, unauthenticated requests are capped at 60/hour by GitHub, shared across
however many people are using the same network/IP. Add a personal access token in the "Advanced"
section of the app for a much higher limit (5,000/hour).