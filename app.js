const form = document.getElementById("pattern-form");
const urlInput = document.getElementById("url-input");
// const indexOutput = document.getElementById("index-output");
const message = document.getElementById("message");
const image = document.getElementById("gallery-image");
const appShell = document.querySelector(".app-shell");
const imageStage = document.querySelector(".image-stage");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const querySyncToggleBtn = document.getElementById("query-sync-toggle");
const querySyncInput = document.getElementById("query-sync");
const fullscreenToggleBtn = document.getElementById("fullscreen-toggle");
const themeModeInputs = [...document.querySelectorAll('input[name="theme-mode"]')];

const THEME_STORAGE_KEY = "gallery-theme";
const URL_PATTERN_PARAM = "pattern";
const URL_INDEX_PARAM = "index";
const root = document.documentElement;
const darkSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const state = {
  pattern: "",
  placeholders: [],
  currentIndex: 1,
  maxIndex: null,
  cache: new Map(),
  querySyncEnabled: false,
  fullscreenEnabled: false,
};

const swipeState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  active: false,
};

function normalizeThemeMode(value) {
  if (value === "auto" || value === "light" || value === "dark") {
    return value;
  }

  return "auto";
}

const themeState = {
  mode: normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY)),
};

function getSystemTheme() {
  return darkSchemeQuery.matches ? "dark" : "light";
}

function getActiveTheme() {
  return themeState.mode === "auto" ? getSystemTheme() : themeState.mode;
}

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
}

function initializeTheme() {
  const selectedThemeInput = themeModeInputs.find((input) => input.value === themeState.mode);
  if (selectedThemeInput) {
    selectedThemeInput.checked = true;
  }

  applyTheme(getActiveTheme());
}

function handleThemeModeChange(event) {
  const target = event.target;
  if (!target || target.name !== "theme-mode") {
    return;
  }

  themeState.mode = normalizeThemeMode(target.value);
  localStorage.setItem(THEME_STORAGE_KEY, themeState.mode);
  applyTheme(getActiveTheme());
}

function handleSystemThemeChange() {
  if (themeState.mode !== "auto") {
    return;
  }

  applyTheme(getSystemTheme());
}

function setMessage(text) {
  if (!message) {
    return;
  }

  message.textContent = text;
}

function containsPlaceholder(urlOrPattern) {
  return /\{[^{}]*\}/.test(urlOrPattern);
}

function detectPatternFromUrl(url) {
  const matches = [...url.matchAll(/\d+/g)];

  if (matches.length === 0) {
    return null;
  }

  const target = matches[matches.length - 1];
  const value = target[0];
  const start = target.index;
  const end = start + value.length;
  const format = "0".repeat(value.length);

  return `${url.slice(0, start)}{${format}}${url.slice(end)}`;
}

function extractPlaceholders(pattern) {
  return [...pattern.matchAll(/\{([^{}]*)\}/g)].map((match) => ({
    token: match[0],
    format: match[1],
  }));
}

function formatByToken(index, format) {
  const raw = String(index);

  if (!format) {
    return raw;
  }

  if (/^0+$/.test(format)) {
    return raw.padStart(format.length, "0");
  }

  return raw;
}

function applyPattern(pattern, index) {
  return pattern.replace(/\{([^{}]*)\}/g, (_, format) => formatByToken(index, format));
}

function resetNavigationState() {
  state.currentIndex = 1;
  state.maxIndex = null;
  state.cache.clear();
  image.removeAttribute("src");
  image.style.display = "none";
}

function updateUi() {
  // indexOutput.textContent = state.pattern ? `Indice: ${state.currentIndex}` : "Indice: -";
  prevBtn.disabled = !state.pattern || state.currentIndex <= 1;
  nextBtn.disabled = !state.pattern || (state.maxIndex !== null && state.currentIndex >= state.maxIndex);
}

function updateFullscreenUi() {
  if (!fullscreenToggleBtn) {
    return;
  }

  fullscreenToggleBtn.setAttribute("aria-pressed", String(state.fullscreenEnabled));
  fullscreenToggleBtn.setAttribute(
    "aria-label",
    state.fullscreenEnabled ? "Esci dallo schermo intero" : "Attiva schermo intero"
  );
  fullscreenToggleBtn.title = state.fullscreenEnabled ? "Esci dallo schermo intero" : "Attiva schermo intero";
  fullscreenToggleBtn.textContent = state.fullscreenEnabled ? "⤡" : "⛶";
}

function setQuerySyncEnabled(enabled) {
  state.querySyncEnabled = Boolean(enabled);

  if (querySyncToggleBtn) {
    querySyncToggleBtn.setAttribute("aria-pressed", String(state.querySyncEnabled));
    querySyncToggleBtn.textContent = state.querySyncEnabled ? "★" : "☆";
  }

  if (querySyncInput) {
    querySyncInput.checked = state.querySyncEnabled;
  }
}

function parseStartIndex(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function parsePatternInput(input) {
  if (!input) {
    return { pattern: "", error: "Inserisci un URL valido." };
  }

  let pattern = input;
  if (!containsPlaceholder(pattern)) {
    const detected = detectPatternFromUrl(input);
    if (!detected) {
      return { pattern: "", error: "Impossibile rilevare un blocco numerico da sostituire." };
    }

    pattern = detected;
  }

  const placeholders = extractPlaceholders(pattern);
  if (placeholders.length === 0) {
    return { pattern: "", error: "Pattern non valido: manca almeno un placeholder tra {}." };
  }

  return { pattern, placeholders, error: "" };
}

function syncPatternToQuery() {
  const params = new URLSearchParams(window.location.search);

  if (state.querySyncEnabled && state.pattern) {
    params.set(URL_PATTERN_PARAM, state.pattern);
    params.set(URL_INDEX_PARAM, String(state.currentIndex));
  } else {
    params.delete(URL_PATTERN_PARAM);
    params.delete(URL_INDEX_PARAM);
  }

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  history.replaceState(null, "", nextUrl);
}

async function loadPattern(pattern, startIndex, loadingMessage) {
  const parsed = parsePatternInput(pattern.trim());
  if (parsed.error) {
    setMessage(parsed.error);
    return false;
  }

  state.pattern = parsed.pattern;
  state.placeholders = parsed.placeholders;
  resetNavigationState();
  state.currentIndex = parseStartIndex(startIndex);
  urlInput.value = parsed.pattern;

  setMessage(loadingMessage);
  updateUi();
  await renderCurrentIndex();
  syncPatternToQuery();
  return true;
}

function getStartupParams() {
  const params = new URLSearchParams(window.location.search);
  const pattern = (params.get(URL_PATTERN_PARAM) || "").trim();
  const index = parseStartIndex(params.get(URL_INDEX_PARAM));
  return { pattern, index };
}

async function initializeFromQuery() {
  const startup = getStartupParams();
  if (!startup.pattern) {
    return;
  }

  setQuerySyncEnabled(true);
  await loadPattern(startup.pattern, startup.index, "Pattern caricato dall'URL.");
}

function handleQuerySyncToggle() {
  setQuerySyncEnabled(!state.querySyncEnabled);
  syncPatternToQuery();
}

function handleQuerySyncCheckboxChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  setQuerySyncEnabled(target.checked);
  syncPatternToQuery();
}

function isFullscreenActive() {
  return document.fullscreenElement === appShell;
}

function syncFullscreenState() {
  state.fullscreenEnabled = isFullscreenActive();
  updateFullscreenUi();
}

async function enterFullscreen() {
  if (!appShell || !appShell.requestFullscreen || isFullscreenActive()) {
    return;
  }

  try {
    await appShell.requestFullscreen();
  } catch {
    syncFullscreenState();
  }
}

async function exitFullscreen() {
  if (!document.fullscreenElement) {
    return;
  }

  try {
    await document.exitFullscreen();
  } catch {
    syncFullscreenState();
  }
}

async function toggleFullscreen() {
  if (isFullscreenActive()) {
    await exitFullscreen();
    return;
  }

  await enterFullscreen();
}

function probeImage(url) {
  return new Promise((resolve) => {
    const probe = new Image();
    let finished = false;

    const complete = (exists) => {
      if (finished) {
        return;
      }

      finished = true;
      resolve(exists);
    };

    const timeout = setTimeout(() => complete(false), 8000);

    probe.onload = () => {
      clearTimeout(timeout);
      complete(true);
    };

    probe.onerror = () => {
      clearTimeout(timeout);
      complete(false);
    };

    probe.src = url;
  });
}

async function ensureIndexInCache(index) {
  if (!state.pattern) {
    return { exists: false, url: "" };
  }

  if (state.cache.has(index)) {
    return state.cache.get(index);
  }

  const url = applyPattern(state.pattern, index);
  const exists = await probeImage(url);
  const result = { exists, url };
  state.cache.set(index, result);
  return result;
}

async function renderCurrentIndex() {
  const current = await ensureIndexInCache(state.currentIndex);

  if (!current.exists) {
    image.style.display = "none";
    setMessage(`Nessuna immagine trovata per indice ${state.currentIndex}.`);
    updateUi();
    return;
  }

  image.src = current.url;
  image.style.display = "block";
  setMessage(state.maxIndex === null ? "" : `Fine gallery rilevata a indice ${state.maxIndex}.`);
  updateUi();
}

async function handleSubmit(event) {
  event.preventDefault();

  const input = urlInput.value.trim();
  await loadPattern(input, 1, "Pattern caricato. Provo a mostrare la prima immagine...");
}

async function goPrevious() {
  if (state.currentIndex <= 1) {
    return;
  }

  state.currentIndex -= 1;
  setMessage("");
  await renderCurrentIndex();
  syncPatternToQuery();
}

async function goNext() {
  if (state.maxIndex !== null && state.currentIndex >= state.maxIndex) {
    return;
  }

  const target = state.currentIndex + 1;
  const next = await ensureIndexInCache(target);

  if (!next.exists) {
    state.maxIndex = state.currentIndex;
    setMessage(`Nessuna immagine all'indice ${target}. Ultima valida: ${state.maxIndex}.`);
    updateUi();
    return;
  }

  state.currentIndex = target;
  await renderCurrentIndex();
  syncPatternToQuery();
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.matches("input, textarea, select, [contenteditable='true']");
}

function handleArrowNavigation(event) {
  if (!state.pattern || isTypingTarget(event.target)) {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    void goPrevious();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    void goNext();
  }
}

function handleFullscreenChange() {
  syncFullscreenState();
}

function handleSwipeStart(event) {
  if (!event.isPrimary || event.pointerType !== "touch") {
    return;
  }

  swipeState.pointerId = event.pointerId;
  swipeState.startX = event.clientX;
  swipeState.startY = event.clientY;
  swipeState.active = true;
}

function handleSwipeEnd(event) {
  if (!swipeState.active || swipeState.pointerId !== event.pointerId) {
    return;
  }

  swipeState.active = false;
  swipeState.pointerId = null;

  const deltaX = event.clientX - swipeState.startX;
  const deltaY = event.clientY - swipeState.startY;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  const swipeThreshold = 40;

  if (horizontalDistance < swipeThreshold || horizontalDistance <= verticalDistance) {
    return;
  }

  if (deltaX < 0) {
    void goNext();
    return;
  }

  void goPrevious();
}

function handleSwipeCancel(event) {
  if (swipeState.pointerId !== event.pointerId) {
    return;
  }

  swipeState.active = false;
  swipeState.pointerId = null;
}

form.addEventListener("submit", handleSubmit);
prevBtn.addEventListener("click", goPrevious);
nextBtn.addEventListener("click", goNext);
if (querySyncToggleBtn) {
  querySyncToggleBtn.addEventListener("click", handleQuerySyncToggle);
}
if (querySyncInput) {
  querySyncInput.addEventListener("change", handleQuerySyncCheckboxChange);
}
if (fullscreenToggleBtn) {
  fullscreenToggleBtn.addEventListener("click", () => {
    void toggleFullscreen();
  });
}
if (imageStage) {
  imageStage.addEventListener("pointerdown", handleSwipeStart);
  imageStage.addEventListener("pointerup", handleSwipeEnd);
  imageStage.addEventListener("pointercancel", handleSwipeCancel);
  imageStage.addEventListener("pointerleave", handleSwipeCancel);
}
window.addEventListener("keydown", handleArrowNavigation);
document.addEventListener("fullscreenchange", handleFullscreenChange);
themeModeInputs.forEach((input) => {
  input.addEventListener("change", handleThemeModeChange);
});
darkSchemeQuery.addEventListener("change", handleSystemThemeChange);

initializeTheme();
setQuerySyncEnabled(false);
syncFullscreenState();
updateUi();
void initializeFromQuery();
