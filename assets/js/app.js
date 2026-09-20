(function(){
  "use strict";

  const REPO_FULL_NAME = "zuni-developer/GitHub-Follow-Checker";
  const API = "https://api.github.com";
  const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  const SAFETY_MAX_PAGES = 100; // 10,000 items — a real safety cap, not a silent truncation trap
  const UNFOLLOW_PACE_MS = 400; // be gentle with GitHub's abuse-detection on write calls

  function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }
  function safeScrollIntoView(el, opts){
    if(el && typeof el.scrollIntoView === "function") el.scrollIntoView(opts);
  }

  // ---------- Theme ----------
  const root = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const themeLabel = document.getElementById("themeLabel");
  let userSetTheme = false;

  function applyTheme(t){
    if(t === "dark"){ root.setAttribute("data-theme","dark"); themeIcon.textContent="☀️"; themeLabel.textContent="Light"; }
    else { root.removeAttribute("data-theme"); themeIcon.textContent="🌙"; themeLabel.textContent="Dark"; }
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("ghfc-theme"); } catch(e) {}
  const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  userSetTheme = !!savedTheme;
  applyTheme(savedTheme || (mql && mql.matches ? "dark" : "light"));

  themeToggle.addEventListener("click", function(){
    const isDark = root.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    userSetTheme = true;
    applyTheme(next);
    try { localStorage.setItem("ghfc-theme", next); } catch(e) {}
  });
  if(mql && mql.addEventListener){
    mql.addEventListener("change", (e) => { if(!userSetTheme) applyTheme(e.matches ? "dark" : "light"); });
  }

  // ---------- DOM refs ----------
  const usernameInput = document.getElementById("username");
  const usernameError = document.getElementById("usernameError");
  const checkBtn = document.getElementById("checkBtn");
  const statusLine = document.getElementById("statusLine");
  const gate = document.getElementById("gate");
  const gateStatus = document.getElementById("gateStatus");
  const recheckStarBtn = document.getElementById("recheckStarBtn");
  const resultsSection = document.getElementById("results");
  const grid = document.getElementById("grid");
  const emptyState = document.getElementById("emptyState");
  const searchBox = document.getElementById("searchBox");
  const chips = Array.from(document.querySelectorAll(".filter-chip"));
  const sortBtn = document.getElementById("sortBtn");
  const exportBtn = document.getElementById("exportBtn");
  const resultCount = document.getElementById("resultCount");
  const truncationNote = document.getElementById("truncationNote");

  const authPill = document.getElementById("authPill");
  const authPillText = document.getElementById("authPillText");
  const authPillClear = document.getElementById("authPillClear");

  const tokenPrompt = document.getElementById("tokenPrompt");
  const tokenPromptMessage = document.getElementById("tokenPromptMessage");
  const tokenScopeHint = document.getElementById("tokenScopeHint");
  const tokenCreateLink = document.getElementById("tokenCreateLink");
  const reactiveTokenInput = document.getElementById("reactiveTokenInput");
  const tokenSubmitBtn = document.getElementById("tokenSubmitBtn");
  const tokenCancelBtn = document.getElementById("tokenCancelBtn");
  const tokenPromptStatus = document.getElementById("tokenPromptStatus");

  const unfollowBanner = document.getElementById("unfollowBanner");
  const openUnfollowBtn = document.getElementById("openUnfollowBtn");
  const unfollowPanel = document.getElementById("unfollowPanel");
  const unfollowList = document.getElementById("unfollowList");
  const selectAllCheckbox = document.getElementById("selectAllCheckbox");
  const unfollowSelectedCount = document.getElementById("unfollowSelectedCount");
  const confirmUnfollowBtn = document.getElementById("confirmUnfollowBtn");
  const cancelUnfollowBtn = document.getElementById("cancelUnfollowBtn");
  const unfollowStatus = document.getElementById("unfollowStatus");

  let lastData = { notBack: [], fans: [], mutual: [] };
  let activeFilter = "not-back";
  let sortAsc = true;
  let searchDebounce = null;
  let activeController = null; // AbortController for the in-flight check
  let unfollowController = null; // separate AbortController for an in-flight unfollow run

  let sessionToken = null;   // in-memory only, never persisted
  let pendingRetry = null;   // zero-arg function to re-run once a token is supplied
  let currentUsername = null; // the account whose results are currently displayed
  let selectedLogins = new Set(); // logins checked in the unfollow review panel
  let lastFollowersCount = 0;
  let lastFollowingCount = 0;

  // ---------- Helpers ----------
  function headers(){
    const h = { "Accept": "application/vnd.github+json" };
    if(sessionToken) h["Authorization"] = "token " + sessionToken;
    return h;
  }

  function setStatus(el, msg, isError){
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
  }

  function setBusyStatus(el, msg){
    el.classList.remove("error");
    el.innerHTML = "";
    const spin = document.createElement("span");
    spin.className = "spinner";
    spin.setAttribute("aria-hidden", "true");
    el.appendChild(spin);
    el.appendChild(document.createTextNode(msg));
  }

  function setInputsDisabled(disabled){
    usernameInput.disabled = disabled;
  }

  function showAuthPill(){
    authPillText.textContent = "Token active (session only)";
    authPill.classList.remove("hidden");
  }
  function hideAuthPill(){
    authPill.classList.add("hidden");
  }
  authPillClear.addEventListener("click", () => {
    sessionToken = null;
    hideAuthPill();
  });

  // A dedicated error type so callers can tell "rate limited" apart from other failures
  // and react by offering a token instead of just showing a dead-end error.
  function RateLimitedError(message){
    const err = new Error(message);
    err.name = "RateLimitedError";
    return err;
  }

  function showTokenPrompt(message, retryFn, opts){
    opts = opts || {};
    pendingRetry = retryFn;
    tokenPromptMessage.textContent = message;
    if(opts.scopeHint){
      tokenScopeHint.innerHTML = "";
      tokenScopeHint.appendChild(document.createTextNode(
        "Unfollowing needs a token with the "));
      const strong = document.createElement("strong");
      strong.textContent = "user:follow";
      tokenScopeHint.appendChild(strong);
      tokenScopeHint.appendChild(document.createTextNode(" scope, authorized as @" + currentUsername + ". "));
      const link = document.createElement("a");
      link.href = "https://github.com/settings/tokens/new?description=GitHub+Follow+Checker&scopes=user%3Afollow";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Create one on GitHub →";
      tokenScopeHint.appendChild(link);
    } else {
      tokenScopeHint.innerHTML = "";
      tokenScopeHint.appendChild(document.createTextNode(
        "A token with no scopes selected (classic) or a read-only fine-grained token is enough to check follow status. "));
      tokenCreateLink.href = "https://github.com/settings/tokens/new?description=GitHub+Follow+Checker&scopes=";
      tokenCreateLink.textContent = "Create one on GitHub →";
      tokenScopeHint.appendChild(tokenCreateLink);
    }
    setStatus(tokenPromptStatus, "");
    reactiveTokenInput.value = "";
    tokenPrompt.hidden = false;
    safeScrollIntoView(tokenPrompt, { behavior: "smooth", block: "center" });
    reactiveTokenInput.focus();
  }

  function hideTokenPrompt(){
    tokenPrompt.hidden = true;
    pendingRetry = null;
  }

  tokenSubmitBtn.addEventListener("click", () => {
    const val = reactiveTokenInput.value.trim();
    if(!val){
      setStatus(tokenPromptStatus, "Paste a token first, or Cancel.", true);
      return;
    }
    sessionToken = val;
    showAuthPill();
    const retry = pendingRetry;
    hideTokenPrompt();
    if(retry) retry();
  });

  tokenCancelBtn.addEventListener("click", () => {
    hideTokenPrompt();
  });

  reactiveTokenInput.addEventListener("keydown", e => { if(e.key === "Enter") tokenSubmitBtn.click(); });

  // ---------- Networking ----------
  async function ghFetch(url, signal){
    let res;
    try {
      res = await fetch(url, { headers: headers(), signal });
    } catch(err){
      if(err.name === "AbortError") throw err;
      console.error("GitHub Follow Checker: fetch failed for", url, err);
      if(navigator.onLine === false){
        throw new Error("You appear to be offline. Reconnect and try again.");
      }
      throw new Error("Couldn't reach GitHub. This is usually an ad blocker/privacy extension blocking api.github.com, or a restrictive network. Check the browser console for the underlying error.");
    }
    if(res.status === 403){
      const retryAfter = res.headers.get("retry-after");
      const remaining = res.headers.get("x-ratelimit-remaining");
      if(retryAfter){
        throw new Error("GitHub is temporarily throttling requests. Try again in " + retryAfter + "s.");
      }
      if(remaining === "0"){
        const reset = res.headers.get("x-ratelimit-reset");
        const resetDate = reset ? new Date(parseInt(reset,10)*1000) : null;
        const when = resetDate ? resetDate.toLocaleTimeString() : "shortly";
        throw RateLimitedError(
          sessionToken
            ? "Even the authenticated rate limit was hit. It resets around " + when + "."
            : "GitHub's public rate limit (60 requests/hour) was hit. It resets around " + when + " — or add a token below to continue right away."
        );
      }
      throw new Error("GitHub blocked this request (403). Please try again in a moment.");
    }
    if(res.status === 401){
      throw new Error("That token was rejected by GitHub — it may be invalid or expired.");
    }
    if(res.status === 404){
      throw new Error("NOT_FOUND");
    }
    if(!res.ok){
      throw new Error("GitHub returned an unexpected error (" + res.status + "). Please try again.");
    }
    return res;
  }

  // Paginate to the natural end of a list (a page with fewer than 100 items),
  // with a generous safety cap so a genuinely huge account can't loop forever.
  // Returns { items, truncated } — truncated is only true if the safety cap was hit,
  // so callers can be honest about incomplete data instead of hiding it.
  async function fetchAllPages(path, signal){
    let items = [];
    let truncated = false;
    for(let page=1; page<=SAFETY_MAX_PAGES; page++){
      const url = API + path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page;
      const res = await ghFetch(url, signal);
      const data = await res.json();
      if(!Array.isArray(data) || data.length === 0) break;
      items = items.concat(data);
      if(data.length < 100) break;
      if(page === SAFETY_MAX_PAGES) truncated = true;
    }
    return { items, truncated };
  }

  async function hasStarredRepo(username, signal){
    const target = REPO_FULL_NAME.toLowerCase();
    for(let page=1; page<=30; page++){
      const url = API + "/users/" + encodeURIComponent(username) + "/starred?per_page=100&page=" + page;
      const res = await ghFetch(url, signal);
      const data = await res.json();
      if(!Array.isArray(data) || data.length === 0) return false;
      if(data.some(r => r.full_name && r.full_name.toLowerCase() === target)) return true;
      if(data.length < 100) return false;
    }
    return false; // gave up after 3,000 starred repos checked
  }

  async function getAuthenticatedLogin(signal){
    const res = await ghFetch(API + "/user", signal);
    const data = await res.json();
    return data.login;
  }

  // ---------- Rendering (DOM-based, never innerHTML with API data) ----------
  function renderStats(followersCount, followingCount){
    document.getElementById("statFollowers").textContent = followersCount;
    document.getElementById("statFollowing").textContent = followingCount;
    document.getElementById("statNotBack").textContent = lastData.notBack.length;
    document.getElementById("statFans").textContent = lastData.fans.length;
  }

  function buildCard(user, tagText, tagClass, delayMs){
    const a = document.createElement("a");
    a.className = "glass user-card " + tagClass;
    a.style.animationDelay = delayMs + "ms";
    a.href = user.html_url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = user.avatar_url + "&s=88";
    img.alt = "";
    img.loading = "lazy";
    a.appendChild(img);

    const span = document.createElement("span");
    const uname = document.createElement("span");
    uname.className = "uname";
    uname.textContent = "@" + user.login;
    const utag = document.createElement("span");
    utag.className = "utag " + tagClass;
    utag.textContent = tagText;
    span.appendChild(uname);
    span.appendChild(utag);
    a.appendChild(span);
    return a;
  }

  function currentList(){
    if(activeFilter === "not-back") return { list: lastData.notBack, tagText: "doesn't follow back", tagClass: "coral" };
    if(activeFilter === "fans") return { list: lastData.fans, tagText: "follows you", tagClass: "teal" };
    return { list: lastData.mutual, tagText: "mutual", tagClass: "violet" };
  }

  function renderGrid(){
    const q = searchBox.value.trim().toLowerCase();
    const { list, tagText, tagClass } = currentList();

    let filtered = q ? list.filter(u => u.login.toLowerCase().includes(q)) : list.slice();
    filtered.sort((a,b) => sortAsc ? a.login.localeCompare(b.login) : b.login.localeCompare(a.login));

    resultCount.textContent = filtered.length + (list.length !== filtered.length ? " of " + list.length : "") +
      (filtered.length === 1 ? " account" : " accounts");

    grid.innerHTML = "";
    if(filtered.length === 0){
      emptyState.style.display = "block";
      emptyState.textContent = list.length === 0
        ? (activeFilter === "not-back" ? "Everyone you follow follows you back. 🎉" :
           activeFilter === "fans" ? "No fans outside who you already follow." : "No mutual follows yet.")
        : "No usernames match that filter.";
    } else {
      emptyState.style.display = "none";
      const frag = document.createDocumentFragment();
      filtered.forEach((u,i) => frag.appendChild(buildCard(u, tagText, tagClass, i*20)));
      grid.appendChild(frag);
    }

    unfollowBanner.hidden = !(activeFilter === "not-back" && lastData.notBack.length > 0);
  }

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      activeFilter = chip.dataset.filter;
      renderGrid();
    });
  });

  searchBox.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(renderGrid, 150);
  });

  sortBtn.addEventListener("click", () => {
    sortAsc = !sortAsc;
    sortBtn.textContent = sortAsc ? "A–Z ↓" : "Z–A ↑";
    renderGrid();
  });

  exportBtn.addEventListener("click", () => {
    const { list } = currentList();
    const q = searchBox.value.trim().toLowerCase();
    const filtered = (q ? list.filter(u => u.login.toLowerCase().includes(q)) : list)
      .slice().sort((a,b) => sortAsc ? a.login.localeCompare(b.login) : b.login.localeCompare(a.login));
    const rows = ["username,profile_url"].concat(filtered.map(u => u.login + "," + u.html_url));
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "github-" + activeFilter + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ---------- Validation ----------
  function validateUsername(raw){
    if(!raw){ return "Enter a GitHub username first."; }
    if(!USERNAME_RE.test(raw)){ return "That doesn't look like a valid GitHub username."; }
    return null;
  }

  usernameInput.addEventListener("input", () => {
    usernameInput.classList.remove("invalid");
    usernameError.textContent = "";
  });

  // ---------- Main flow ----------
  async function runCheck(){
    const username = usernameInput.value.trim().replace(/^@/, "");

    const validationError = validateUsername(username);
    if(validationError){
      usernameInput.classList.add("invalid");
      usernameError.textContent = validationError;
      usernameInput.focus();
      return;
    }

    if(activeController) activeController.abort();
    activeController = new AbortController();
    const signal = activeController.signal;

    gate.classList.remove("show");
    resultsSection.classList.remove("show");
    unfollowPanel.hidden = true;
    checkBtn.disabled = true;
    setInputsDisabled(true);
    setBusyStatus(statusLine, "Verifying the repo star…");

    try {
      const starred = await hasStarredRepo(username, signal);
      if(!starred){
        setStatus(statusLine, "");
        gate.classList.add("show");
        safeScrollIntoView(gate, { behavior: "smooth", block: "center" });
        return;
      }
      await loadFollowData(username, signal);
    } catch(err){
      if(err.name === "AbortError") return;
      if(err.name === "RateLimitedError"){
        showTokenPrompt(err.message, () => runCheck());
        return;
      }
      if(err.message === "NOT_FOUND"){
        setStatus(statusLine, "Couldn't find a GitHub user with that username.", true);
      } else {
        setStatus(statusLine, err.message, true);
      }
    } finally {
      checkBtn.disabled = false;
      setInputsDisabled(false);
    }
  }

  async function loadFollowData(username, signal){
    setBusyStatus(statusLine, "Fetching followers…");
    const followersResult = await fetchAllPages("/users/" + encodeURIComponent(username) + "/followers", signal);
    setBusyStatus(statusLine, "Fetching following…");
    const followingResult = await fetchAllPages("/users/" + encodeURIComponent(username) + "/following", signal);

    const followers = followersResult.items;
    const following = followingResult.items;

    const followerLogins = new Set(followers.map(u => u.login.toLowerCase()));
    const followingLogins = new Set(following.map(u => u.login.toLowerCase()));

    lastData.notBack = following.filter(u => !followerLogins.has(u.login.toLowerCase()));
    lastData.fans = followers.filter(u => !followingLogins.has(u.login.toLowerCase()));
    lastData.mutual = following.filter(u => followerLogins.has(u.login.toLowerCase()));

    currentUsername = username;
    lastFollowersCount = followers.length;
    lastFollowingCount = following.length;

    renderStats(followers.length, following.length);

    if(followersResult.truncated || followingResult.truncated){
      truncationNote.hidden = false;
      truncationNote.textContent = "⚠️ This account is large enough that we stopped after 10,000 entries on " +
        (followersResult.truncated && followingResult.truncated ? "followers and following" :
         followersResult.truncated ? "followers" : "following") +
        " to stay within a safe limit — counts above may be undercounts.";
    } else {
      truncationNote.hidden = true;
    }

    activeFilter = "not-back";
    chips.forEach(c => c.setAttribute("aria-pressed", c.dataset.filter === "not-back" ? "true" : "false"));
    searchBox.value = "";
    sortAsc = true;
    sortBtn.textContent = "A–Z ↓";
    renderGrid();

    setStatus(statusLine, "");
    resultsSection.classList.add("show");
    safeScrollIntoView(resultsSection, { behavior: "smooth", block: "start" });
  }

  checkBtn.addEventListener("click", runCheck);
  usernameInput.addEventListener("keydown", e => { if(e.key === "Enter") runCheck(); });

  recheckStarBtn.addEventListener("click", async function(){
    const username = usernameInput.value.trim().replace(/^@/, "");
    if(!username) return;

    if(activeController) activeController.abort();
    activeController = new AbortController();
    const signal = activeController.signal;

    recheckStarBtn.disabled = true;
    setBusyStatus(gateStatus, "Checking again…");
    try {
      const starred = await hasStarredRepo(username, signal);
      if(starred){
        gate.classList.remove("show");
        setStatus(gateStatus, "");
        await loadFollowData(username, signal);
      } else {
        setStatus(gateStatus, "Still not seeing a star from this account. Give it a second after starring, then try again.", true);
      }
    } catch(err){
      if(err.name === "AbortError") return;
      if(err.name === "RateLimitedError"){
        setStatus(gateStatus, "");
        showTokenPrompt(err.message, () => recheckStarBtn.click());
        return;
      }
      setStatus(gateStatus, err.message === "NOT_FOUND" ? "Couldn't find that username." : err.message, true);
    } finally {
      recheckStarBtn.disabled = false;
    }
  });

  // ---------- Unfollow feature (opt-in, confirm-gated, always previewed) ----------
  openUnfollowBtn.addEventListener("click", async () => {
    if(!currentUsername) return;

    if(!sessionToken){
      showTokenPrompt(
        "Unfollowing accounts requires a token authorized as @" + currentUsername + " with the user:follow scope.",
        () => openUnfollowBtn.click(),
        { scopeHint: true }
      );
      return;
    }

    openUnfollowBtn.disabled = true;
    const prevLabel = openUnfollowBtn.textContent;
    openUnfollowBtn.textContent = "Verifying token…";

    const controller = new AbortController();
    try {
      const authedLogin = await getAuthenticatedLogin(controller.signal);
      if(authedLogin.toLowerCase() !== currentUsername.toLowerCase()){
        alert(
          "This token belongs to @" + authedLogin + ", but you're checking @" + currentUsername + ".\n\n" +
          "Unfollowing only works for your own account — sign in with a token that matches the username you're checking."
        );
        return;
      }
      openUnfollowPanel();
    } catch(err){
      if(err.name === "RateLimitedError"){
        showTokenPrompt(err.message, () => openUnfollowBtn.click());
      } else {
        alert(err.message === "NOT_FOUND" ? "Couldn't verify the token." : err.message);
      }
    } finally {
      openUnfollowBtn.disabled = false;
      openUnfollowBtn.textContent = prevLabel;
    }
  });

  function updateSelectedCount(){
    unfollowSelectedCount.textContent = selectedLogins.size + " of " + lastData.notBack.length + " selected";
    confirmUnfollowBtn.disabled = selectedLogins.size === 0;
  }

  function openUnfollowPanel(){
    selectedLogins = new Set(lastData.notBack.map(u => u.login));
    selectAllCheckbox.checked = true;
    setStatus(unfollowStatus, "");
    confirmUnfollowBtn.disabled = false;
    confirmUnfollowBtn.textContent = "Unfollow selected";
    cancelUnfollowBtn.disabled = false;
    selectAllCheckbox.disabled = false;

    unfollowList.innerHTML = "";
    const frag = document.createDocumentFragment();
    lastData.notBack.forEach(user => {
      const row = document.createElement("label");
      row.className = "unfollow-row";
      row.dataset.login = user.login;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.addEventListener("change", () => {
        if(cb.checked) selectedLogins.add(user.login);
        else selectedLogins.delete(user.login);
        selectAllCheckbox.checked = selectedLogins.size === lastData.notBack.length;
        updateSelectedCount();
      });

      const img = document.createElement("img");
      img.src = user.avatar_url + "&s=64";
      img.alt = "";
      img.loading = "lazy";

      const uname = document.createElement("span");
      uname.className = "uname";
      uname.textContent = "@" + user.login;

      row.appendChild(cb);
      row.appendChild(img);
      row.appendChild(uname);
      frag.appendChild(row);
    });
    unfollowList.appendChild(frag);
    updateSelectedCount();

    unfollowPanel.hidden = false;
    safeScrollIntoView(unfollowPanel, { behavior: "smooth", block: "center" });
  }

  selectAllCheckbox.addEventListener("change", () => {
    const checked = selectAllCheckbox.checked;
    selectedLogins = checked ? new Set(lastData.notBack.map(u => u.login)) : new Set();
    unfollowList.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = checked; });
    updateSelectedCount();
  });

  cancelUnfollowBtn.addEventListener("click", () => {
    if(unfollowController) unfollowController.abort();
    unfollowPanel.hidden = true;
  });

  confirmUnfollowBtn.addEventListener("click", async () => {
    const targets = Array.from(selectedLogins);
    if(targets.length === 0) return;

    const ok = confirm(
      "Unfollow " + targets.length + " account" + (targets.length === 1 ? "" : "s") + " on GitHub?\n\n" +
      "This happens immediately and isn't reversible in bulk — you'd need to re-follow each one manually."
    );
    if(!ok) return;

    confirmUnfollowBtn.disabled = true;
    cancelUnfollowBtn.textContent = "Stop";
    selectAllCheckbox.disabled = true;
    unfollowList.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.disabled = true; });

    unfollowController = new AbortController();
    const signal = unfollowController.signal;

    let succeeded = [];
    let failed = [];
    let stoppedEarly = false;

    for(let i=0; i<targets.length; i++){
      if(signal.aborted){ stoppedEarly = true; break; }
      const login = targets[i];
      setStatus(unfollowStatus, "Unfollowing " + (i+1) + " of " + targets.length + " — @" + login + "…");
      const row = unfollowList.querySelector('.unfollow-row[data-login="' + CSS.escape(login) + '"]');

      try {
        const res = await fetch(API + "/user/following/" + encodeURIComponent(login), {
          method: "DELETE",
          headers: headers(),
          signal
        });
        if(res.status === 204 || res.status === 404){
          succeeded.push(login);
          if(row) row.classList.add("done");
        } else if(res.status === 401){
          failed.push(login);
          if(row) row.classList.add("failed");
          setStatus(unfollowStatus, "Token was rejected — stopped to be safe.", true);
          stoppedEarly = true;
          break;
        } else if(res.status === 403){
          failed.push(login);
          if(row) row.classList.add("failed");
          const retryAfter = res.headers.get("retry-after");
          setStatus(unfollowStatus, "GitHub is throttling this action" + (retryAfter ? " (retry after " + retryAfter + "s)" : "") + " — stopped to be safe.", true);
          stoppedEarly = true;
          break;
        } else {
          failed.push(login);
          if(row) row.classList.add("failed");
        }
      } catch(err){
        if(err.name === "AbortError"){ stoppedEarly = true; break; }
        failed.push(login);
        if(row) row.classList.add("failed");
      }

      if(i < targets.length - 1) await sleep(UNFOLLOW_PACE_MS);
    }

    // Reflect successes in the underlying data + stats immediately.
    if(succeeded.length > 0){
      const succeededSet = new Set(succeeded.map(l => l.toLowerCase()));
      lastData.notBack = lastData.notBack.filter(u => !succeededSet.has(u.login.toLowerCase()));
      renderStats(lastFollowersCount, lastFollowingCount);
    }

    let summary = succeeded.length + " unfollowed";
    if(failed.length) summary += ", " + failed.length + " failed";
    if(stoppedEarly && failed.length === 0) summary += " (stopped early)";
    setStatus(unfollowStatus, summary + ".", failed.length > 0);

    confirmUnfollowBtn.textContent = "Done";
    cancelUnfollowBtn.textContent = "Close";
    selectAllCheckbox.disabled = false;

    // Close after a moment and refresh the grid so the list reflects reality.
    setTimeout(() => {
      unfollowPanel.hidden = true;
      renderGrid();
    }, succeeded.length > 0 ? 1400 : 0);
  });
})();
