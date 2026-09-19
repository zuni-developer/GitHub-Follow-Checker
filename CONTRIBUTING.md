# Contributing to GitHub Follow Checker

Thanks for considering a contribution — this is a small, dependency-free static project, so
getting set up takes about a minute.

## Ground rules

- Be respectful. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- No build step, no framework, no runtime dependencies. Keep it that way unless there's a strong
  reason not to — the whole point of this project is that anyone can open `index.html`, read it
  top to bottom, and trust it.
- Anything that touches the token field, the star-check, or how data is fetched/stored needs extra
  care — see the [Security](#security-sensitive-changes) note below.

## Getting set up

```bash
git clone https://github.com/YOUR_USERNAME/github-follow-checker.git
cd github-follow-checker
npm run dev   # or: python3 -m http.server 5173
```

Open the printed local URL. Edits to `index.html`, `assets/css/styles.css`, or `assets/js/app.js`
just need a browser refresh — no build/watch process.

## Project structure

```
index.html              markup only
assets/css/styles.css   all styling, theme tokens as CSS custom properties
assets/js/app.js         all logic, plain JS, one IIFE, no globals leaked
```

## Making a change

1. Fork the repo and create a branch off `main`: `git checkout -b fix/short-description`.
2. Make your change. Keep commits focused — one logical change per commit.
3. Test manually in a real browser against a real GitHub username (see
   [Manual test checklist](#manual-test-checklist) below).
4. Open a pull request using the provided template. Explain *what* changed and *why*, and note
   which manual tests you ran.

## Manual test checklist

There's no automated test suite yet (contributions welcome!). Before opening a PR, please verify
in at least one Chromium-based browser and one other engine (Firefox/Safari) if the change touches
JS or CSS:

- [ ] Entering a username that **hasn't** starred the repo shows the star-gate, and "check again"
      re-verifies correctly
- [ ] Entering a username that **has** starred it goes straight to results
- [ ] Entering a nonexistent username shows a clear "not found" message, not a crash
- [ ] Filter chips (Not following back / Fans / Mutual), search, sort, and CSV export all work
- [ ] Light/dark toggle works, and reflects OS preference on first load
- [ ] Keyboard-only navigation reaches every interactive element with visible focus states
- [ ] No errors in the browser console under normal use

## Security-sensitive changes

This project's entire trust model rests on: *nothing typed into this page ever leaves the
visitor's browser except direct calls to `api.github.com`.* If your change touches:

- the token input or how it's used,
- `localStorage`/`sessionStorage` usage,
- any new network call or third-party script/resource,

please call this out explicitly in your PR description. See [SECURITY.md](SECURITY.md) for how to
report an actual vulnerability privately instead of in a public issue.

## Reporting bugs / requesting features

Please use the issue templates — they ask for just enough detail to act on the report quickly.
