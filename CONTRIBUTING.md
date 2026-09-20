# Contributing to GitHub Follow Checker

This project does not accept pull requests. All code changes are made by the maintainer only.
That's a deliberate choice, not a lack of gratitude:

- It's a small, security-sensitive, dependency-free static app (see
  [Security-sensitive areas](#security-sensitive-areas) below), the whole point is that anyone
  can open `index.html`, read it top to bottom, and trust it. Keeping a single author keeps that
  guarantee simple to reason about.
- It keeps review load manageable for a one-person project.

You're still very welcome to help by reporting bugs and requesting features, that's the most
useful contribution you can make here, and it's genuinely wanted.

## How to help

- **Found a bug?** [Open an issue](../../issues/new/choose) using the Bug Report template.
- **Have an idea or a feature request?** [Open an issue](../../issues/new/choose) using the
  Feature Request template.
- **Found an actual security vulnerability?** Don't open a public issue, see
  [SECURITY.md](SECURITY.md) for how to report it privately.
- Please be respectful, see the [Code of Conduct](CODE_OF_CONDUCT.md).

Pull requests, forks submitted as PRs, and unsolicited patches will be closed without review. 

## Writing a good issue

A good bug report or feature request gets acted on much faster. Please include:

- What you expected to happen vs. what actually happened
- Steps to reproduce (for bugs), including the browser/engine used
- Whether the issue happens with an unauthenticated check, a rate-limit token, or the unfollow
  flow (see [Security-sensitive areas](#security-sensitive-areas), problems here get priority)
- Console errors, if any (F12 → Console)

## Project structure

For context, in case it helps you describe *where* something is going wrong:

```
index.html              markup only
assets/css/styles.css   all styling, theme tokens as CSS custom properties
assets/js/app.js        all logic, plain JS, one IIFE, no globals leaked
```

## Security-sensitive areas

This project's trust model is: *no credentials are collected by default, and any token that is
collected (reactively for rate limits, or for the unfollow feature) lives only in memory for that
session, is verified against the account being acted on where relevant, and never triggers a
write action without explicit per-item confirmation.* Issues touching any of the following get
priority:

- how or when a token is requested, stored, or attached to requests,
- the identity-verification check before unfollowing,
- the confirm/preview step before any write action,
- `localStorage`/`sessionStorage` usage,
- any new or unexpected network call or third-party script/resource.

Again, an actual exploitable vulnerability should go to [SECURITY.md](SECURITY.md), not a public
issue.
