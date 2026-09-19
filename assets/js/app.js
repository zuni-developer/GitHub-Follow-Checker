(function(){
  "use strict";

  const REPO_FULL_NAME = "zuni-developer/GitHub-Follow-Checker";
  const API = "https://api.github.com";
  const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

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
  const tokenInput = document.getElementById("token");
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
  const rateLimitPill = document.getElementById("rateLimitPill");
  const rateLimitText = document.getElementById("rateLimitText");

  let lastData = { notBack: [], fans: [], mutual: [] };
  let activeFilter = "not-back";
  let sortAsc = true;
  let searchDebounce = null;
  let activeController = null; // AbortController for in-flight run

  // ---------- Helpers ----------
  function headers(token){
    const h = { "Accept": "application/vnd.github+json" };
    if(token) h["Authorization"] = "token " + token;
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

  function updateRateLimitFromHeaders(h){
    const remaining = h.get("x-ratelimit-remaining");
    const limit = h.get("x-ratelimit-limit");
    if(remaining === null || limit === null) return;
    rateLimitPill.classList.remove("hidden");
    rateLimitPill.classList.toggle("warn", parseInt(remaining,10) < 10);
    rateLimitText.textContent = remaining + " / " + limit + " API calls left";
  }

  function setInputsDisabled(disabled){
    usernameInput.disabled = disabled;
    tokenInput.disabled = disabled;
  }

  // ---------- Networking ----------
  async function ghFetch(url, token, signal){
    let res;
    try {
      res = await fetch(url, { headers: headers(token), signal });
    } catch(err){
      if(err.name === "AbortError") throw err;
      console.error("GitHub Follow Checker: fetch failed for", url, err);
      if(navigator.onLine === false){
        throw new Error("You appear to be offline. Reconnect and try again.");
      }
      throw new Error("Couldn't reach GitHub. This is usually an ad blocker/privacy extension blocking api.github.com, or a restrictive network. Check the browser console for the underlying error.");
    }
    updateRateLimitFromHeaders(res.headers);
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
        throw new Error("GitHub's rate limit was hit. It resets around " + when + ". Adding a token above raises the limit.");
      }
      throw new Error("GitHub blocked this request (403). If this keeps happening, try adding a token.");
    }
    if(res.status === 404){
      throw new Error("NOT_FOUND");
    }
    if(!res.ok){
      throw new Error("GitHub returned an unexpected error (" + res.status + "). Please try again.");
    }
    return res;
  }

  async function fetchAllPages(path, token, maxPages, signal){
    let items = [];
    for(let page=1; page<=maxPages; page++){
      const url = API + path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page;
      const res = await ghFetch(url, token, signal);
      const data = await res.json();
      if(!Array.isArray(data) || data.length === 0) break;
      items = items.concat(data);
      if(data.length < 100) break;
    }
    return items;
  }

  async function hasStarredRepo(username, token, signal){
    const target = REPO_FULL_NAME.toLowerCase();
    for(let page=1; page<=15; page++){
      const url = API + "/users/" + encodeURIComponent(username) + "/starred?per_page=100&page=" + page;
      const res = await ghFetch(url, token, signal);
      const data = await res.json();
      if(!Array.isArray(data) || data.length === 0) return false;
      if(data.some(r => r.full_name && r.full_name.toLowerCase() === target)) return true;
      if(data.length < 100) return false;
    }
    return false; // gave up after ~1500 starred repos checked
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
    const token = tokenInput.value.trim();

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
    checkBtn.disabled = true;
    setInputsDisabled(true);
    setBusyStatus(statusLine, "Verifying the repo star…");

    try {
      const starred = await hasStarredRepo(username, token, signal);
      if(!starred){
        setStatus(statusLine, "");
        gate.classList.add("show");
        gate.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      await loadFollowData(username, token, signal);
    } catch(err){
      if(err.name === "AbortError") return;
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

  async function loadFollowData(username, token, signal){
    setBusyStatus(statusLine, "Fetching followers…");
    const followers = await fetchAllPages("/users/" + encodeURIComponent(username) + "/followers", token, 20, signal);
    setBusyStatus(statusLine, "Fetching following…");
    const following = await fetchAllPages("/users/" + encodeURIComponent(username) + "/following", token, 20, signal);

    const followerLogins = new Set(followers.map(u => u.login.toLowerCase()));
    const followingLogins = new Set(following.map(u => u.login.toLowerCase()));

    lastData.notBack = following.filter(u => !followerLogins.has(u.login.toLowerCase()));
    lastData.fans = followers.filter(u => !followingLogins.has(u.login.toLowerCase()));
    lastData.mutual = following.filter(u => followerLogins.has(u.login.toLowerCase()));

    renderStats(followers.length, following.length);
    activeFilter = "not-back";
    chips.forEach(c => c.setAttribute("aria-pressed", c.dataset.filter === "not-back" ? "true" : "false"));
    searchBox.value = "";
    sortAsc = true;
    sortBtn.textContent = "A–Z ↓";
    renderGrid();

    setStatus(statusLine, "");
    resultsSection.classList.add("show");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  checkBtn.addEventListener("click", runCheck);
  usernameInput.addEventListener("keydown", e => { if(e.key === "Enter") runCheck(); });
  tokenInput.addEventListener("keydown", e => { if(e.key === "Enter") runCheck(); });

  recheckStarBtn.addEventListener("click", async function(){
    const username = usernameInput.value.trim().replace(/^@/, "");
    const token = tokenInput.value.trim();
    if(!username) return;

    if(activeController) activeController.abort();
    activeController = new AbortController();
    const signal = activeController.signal;

    recheckStarBtn.disabled = true;
    setBusyStatus(gateStatus, "Checking again…");
    try {
      const starred = await hasStarredRepo(username, token, signal);
      if(starred){
        gate.classList.remove("show");
        setStatus(gateStatus, "");
        await loadFollowData(username, token, signal);
      } else {
        setStatus(gateStatus, "Still not seeing a star from this account. Give it a second after starring, then try again.", true);
      }
    } catch(err){
      if(err.name === "AbortError") return;
      setStatus(gateStatus, err.message === "NOT_FOUND" ? "Couldn't find that username." : err.message, true);
    } finally {
      recheckStarBtn.disabled = false;
    }
  });
})();
