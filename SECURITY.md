# Security Policy

## Our security model

This project has no backend and no database. Every network request the page makes goes directly
from the visitor's browser to `api.github.com`. Checking follow status by default uses GitHub's
public, unauthenticated API — no credentials collected. A personal access token is only asked for
in two specific, opt-in situations, and in both cases lives only in an in-memory JS variable for
that browser session — never written to storage, cookies, or any request other than the direct
GitHub API calls it authorizes:

1. **Reactively, if GitHub's public rate limit is hit** — the app offers a token to continue, but
   never requires one up front.
2. **For the "unfollow" feature** — which additionally requires the `user:follow` scope, verifies
   the token's identity matches the account being checked, and always requires an explicit
   selection and confirmation before taking any action.

The only thing persisted on a visitor's device is their light/dark theme preference, in
`localStorage`.

If a change breaks any part of that model, it's a security regression regardless of whether it was
intentional.

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability. Instead:

1. Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
   on this repository (Security tab → "Report a vulnerability"), if enabled, **or**
2. Contact a maintainer directly with details.

Please include:

- A description of the issue and its potential impact
- Steps to reproduce
- Any relevant browser/environment details

We'll acknowledge reports as promptly as we can and keep you updated as the issue is addressed.

## Supported versions

This project is a single, actively maintained static site with no versioned releases — the `main`
branch is always the supported version.
