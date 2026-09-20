# 🛰️ GitHub Follow Checker

See who isn't following you back on GitHub, client-side, no login required by default.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Issues Welcome](https://img.shields.io/badge/Issues-welcome-blue.svg)](../../issues)

## Features

- Compares followers vs. following for any public GitHub username
- Filterable, sortable, searchable results (not following back / fans / mutual)
- CSV export of any filtered view
- Optional, opt-in bulk unfollow with a preview/confirm step
- Light/dark mode (follows system preference, overridable)
- No backend: every request goes straight from the visitor's browser to `api.github.com`

## The "star gate"

Before running a check, the app verifies (via the GitHub API) that the entered account has starred
this repo. If not, it shows a friendly prompt with a link to star it and a button to re-check, no
login required, and nothing enforced silently.

## The optional token

By default, checking follows GitHub's public, unauthenticated API, no credentials collected, full
stop. A personal access token is only ever asked for **reactively**, if GitHub's 60-requests/hour
anonymous limit is actually hit mid-check. When that happens:

- The app shows exactly why, and offers a field to paste a token
- The token is used only in-memory for that browser session, never written to `localStorage`,
  `sessionStorage`, cookies, or sent anywhere except `api.github.com`
- For checking only, the token needs **no scopes at all** (classic) or a read-only fine-grained
  token, it only raises your rate limit, it never grants write access for that purpose
- Declining is always an option, the check just waits for the rate limit to reset instead

## Unfollowing (opt-in)

Once results are in, a "Review & unfollow" option appears under the "Not following back" list.
This is a separate, higher-stakes feature from checking, so it's built with extra guardrails:

- Requires its own token, this time with the **`user:follow`** scope (write access to your
  following list), the app links directly to GitHub's token creation page with that scope
  pre-selected
- Verifies the token actually belongs to the account you're checking before allowing anything,
  and refuses (with a clear message) if it belongs to someone else
- Always shows a checklist preview first, nothing is unfollowed without an explicit selection and
  a final confirmation
- Unfollows one account at a time with a short pace between requests, and can be stopped mid-run
- Reports exactly what succeeded and what failed, and updates the results immediately after

This is a real, irreversible-in-bulk action against your GitHub account, read the in-app warning
before using it.

## Large accounts

Followers/following lists are paginated to their natural end (not an arbitrary early cutoff), up
to a generous safety cap of 10,000 entries per list. If an account is large enough to hit that cap,
the app says so explicitly rather than silently showing incomplete numbers as if they were final.
Very large accounts (several thousand combined followers/following) may also need the optional
token just to get through pagination within GitHub's hourly limit, see
[The optional token](#the-optional-token) above.

## Security

- No server component. By default, no credentials of any kind are collected, checking uses
  GitHub's public, unauthenticated API.
- A token (for continuing past a rate limit, or for unfollowing) lives only in an in-memory JS
  variable for that browser session. It is never written to `localStorage`, `sessionStorage`,
  cookies, or sent anywhere except direct calls to `api.github.com`. Refreshing the page clears it.
- The unfollow feature verifies the token's identity matches the account being checked before
  allowing any action, and always requires an explicit selection + confirmation, nothing runs
  automatically.
- Only the theme preference (light/dark) is persisted, via `localStorage`, on the visitor's own
  device.

Found an actual vulnerability? Please report it privately, see [SECURITY.md](SECURITY.md) rather
than opening a public issue.

## Contributing

This project does not accept pull requests, see [CONTRIBUTING.md](CONTRIBUTING.md) for why and
for what "contributing" means here instead. Found a bug or have an idea? Please
[open an issue](../../issues/new/choose) using the bug report or feature request template.
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

**Rate limit reached**, unauthenticated requests are capped at 60/hour by GitHub, enforced per IP
address and shared across however many people are using the same network. The app will offer an
optional token right in the UI when this happens, see [The optional token](#the-optional-token).
Declining just means waiting for the reset time shown in the message.