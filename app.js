const form = document.getElementById("pattern-form");
const urlInput = document.getElementById("url-input");
const patternOutput = document.getElementById("pattern-output");
const indexOutput = document.getElementById("index-output");
const message = document.getElementById("message");
const image = document.getElementById("gallery-image");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

const state = {
  pattern: "",
  placeholders: [],
  currentIndex: 1,
  maxIndex: null,
  cache: new Map(),
};

function setMessage(text) {
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
  patternOutput.textContent = state.pattern || "-";
  indexOutput.textContent = state.pattern ? String(state.currentIndex) : "-";
  prevBtn.disabled = !state.pattern || state.currentIndex <= 1;
  nextBtn.disabled = !state.pattern || (state.maxIndex !== null && state.currentIndex >= state.maxIndex);
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
  if (!input) {
    setMessage("Inserisci un URL valido.");
    return;
  }

  let pattern = input;
  if (!containsPlaceholder(pattern)) {
    const detected = detectPatternFromUrl(input);
    if (!detected) {
      setMessage("Impossibile rilevare un blocco numerico da sostituire.");
      return;
    }

    pattern = detected;
  }

  const placeholders = extractPlaceholders(pattern);
  if (placeholders.length === 0) {
    setMessage("Pattern non valido: manca almeno un placeholder tra {}.");
    return;
  }

  state.pattern = pattern;
  state.placeholders = placeholders;
  resetNavigationState();

  setMessage("Pattern caricato. Provo a mostrare la prima immagine...");
  updateUi();
  await renderCurrentIndex();
}

async function goPrevious() {
  if (state.currentIndex <= 1) {
    return;
  }

  state.currentIndex -= 1;
  setMessage("");
  await renderCurrentIndex();
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
}

form.addEventListener("submit", handleSubmit);
prevBtn.addEventListener("click", goPrevious);
nextBtn.addEventListener("click", goNext);

updateUi();
