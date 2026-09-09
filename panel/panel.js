/* glint-panel
 *
 * Edita a config da status line. Três regras guiam a interação:
 * o card gruda no dedo 1:1 enquanto arrasta, a lista se reorganiza durante o
 * gesto (não no fim), e tudo pode ser agarrado de novo no meio do caminho.
 * O preview roda o script de verdade, então o que aparece aqui é o que vai
 * aparecer no terminal.
 */

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* id, símbolo que aparece no card, nome, explicação */
const JOINS = [
  ["block", "▏", "new block", "starts a block: may move to another pill"],
  ["pipe", "│", "divider", "attaches with a │ divider"],
  ["space", "␣", "space", "attaches with a space"],
  ["none", "·", "tight", "attaches with no gap"],
];

const state = {
  catalog: [],
  defaults: null,
  presets: [],
  config: null,
  saved: null,
  scenario: "normal",
  columns: 135,
};

/* Undo/redo sobre a config inteira: barato (a config é pequena) e cobre
   qualquer mudança, inclusive preset e import, sem cada ação saber desfazer. */
const history = { past: [], future: [], lastPush: 0, lastTag: null };

const $ = (sel) => document.querySelector(sel);
const clone = (v) => JSON.parse(JSON.stringify(v));
const meta = (id) => state.catalog.find((p) => p.id === id) || { id, label: id, about: "", opts: [] };

/* ---------- mola: alvo pode mudar no meio do voo, a velocidade continua ---------- */
function spring(el, { from, to, velocity = 0, response = 0.4, damping = 1 }) {
  if (REDUCED) {
    el.style.transform = to ? `translateY(${to}px)` : "";
    return Promise.resolve();
  }
  const w = (2 * Math.PI) / response;
  let x = from;
  let v = velocity;
  let last = performance.now();
  return new Promise((done) => {
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const a = -w * w * (x - to) - 2 * damping * w * v;
      v += a * dt;
      x += v * dt;
      if (Math.abs(x - to) < 0.4 && Math.abs(v) < 6) {
        el.style.transform = to ? `translateY(${to}px)` : "";
        done();
        return;
      }
      el.style.transform = `translateY(${x}px)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* Resistência crescente além da borda: para, mas sem parecer travado. */
const rubberband = (over, size, k = 0.55) => (over * size * k) / (size + k * Math.abs(over));

/* ---------- config ---------- */
function activeParts() {
  return state.config.parts.filter((p) => p.on !== false);
}

function inactiveParts() {
  const inList = new Set(state.config.parts.map((p) => p.id));
  const off = state.config.parts.filter((p) => p.on === false);
  const missing = state.catalog.filter((c) => !inList.has(c.id)).map((c) => ({ id: c.id, on: false, join: "space" }));
  return [...off, ...missing];
}

function dirty() {
  return JSON.stringify(state.config) !== JSON.stringify(state.saved);
}

/* Digitar num campo de número não empilha um estado por tecla: mudanças
   seguidas com a mesma etiqueta, dentro de 800ms, viram um passo só. */
function mutate(fn, tag = null) {
  const now = performance.now();
  const junta = tag && tag === history.lastTag && now - history.lastPush < 800;
  if (!junta) {
    history.past.push(clone(state.config));
    if (history.past.length > 60) history.past.shift();
    history.future.length = 0;
  }
  history.lastPush = now;
  history.lastTag = tag;
  fn();
  commit(tag ? { keepFocus: true } : undefined);
}

function undo() {
  if (!history.past.length) return;
  history.future.push(clone(state.config));
  state.config = history.past.pop();
  history.lastTag = null;
  commit();
  setMsg("Undone.");
}

function redo() {
  if (!history.future.length) return;
  history.past.push(clone(state.config));
  state.config = history.future.pop();
  history.lastTag = null;
  commit();
  setMsg("Redone.");
}

/* Guardar uma parte manda o card para o fim da página; sem seguir o movimento
   parece que ele sumiu. */
function revelar(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`.item[data-id="${id}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: REDUCED ? "auto" : "smooth" });
  });
}

/* ---------- desenho ---------- */
function joinChip(part, primeiro) {
  const spec = JOINS.find((j) => j[0] === (part.join || "space")) || JOINS[2];
  const chip = document.createElement("button");
  chip.className = "chip";
  chip.dataset.join = spec[0];
  if (primeiro) {
    chip.classList.add("chip-first");
    chip.disabled = true;
    chip.innerHTML = `<i>◂</i>first`;
    chip.title = "the first part has nothing to attach to";
    return chip;
  }
  chip.innerHTML = `<i></i><span></span>`;
  chip.querySelector("i").textContent = spec[1];
  chip.querySelector("span").textContent = spec[2];
  chip.title = `${spec[3]} (click to change)`;
  chip.setAttribute("aria-label", `Join: ${spec[2]}. ${spec[3]}. Click to change.`);
  chip.addEventListener("click", (ev) => {
    ev.stopPropagation();
    mutate(() => {
      const at = JOINS.findIndex((j) => j[0] === (part.join || "space"));
      part.join = JOINS[(at + 1) % JOINS.length][0];
    });
  });
  return chip;
}

function powerSwitch(part, ligada, info) {
  const sw = document.createElement("button");
  sw.className = "switch";
  sw.setAttribute("role", "switch");
  sw.setAttribute("aria-checked", String(ligada));
  sw.setAttribute("aria-label", ligada ? `Take ${info.label} out of the bar` : `Put ${info.label} back in the bar`);
  sw.title = ligada ? "take out of the bar" : "put back in the bar";
  sw.addEventListener("click", (ev) => {
    ev.stopPropagation();
    mutate(() => {
      const found = state.config.parts.find((x) => x.id === part.id);
      if (found) found.on = !ligada;
      else state.config.parts.push({ id: part.id, on: true, join: "space" });
    });
    setMsg(ligada ? `${info.label} is out of the bar.` : `${info.label} is back, at the end.`);
    revelar(part.id);
  });
  return sw;
}

function optionRow(part, info) {
  const opts = document.createElement("div");
  opts.className = "opts";
  for (const o of info.opts) {
    const cur = (part.opts || {})[o.key] ?? o.default;
    const wrap = document.createElement("label");
    wrap.className = "opt";
    if (o.kind === "bool") {
      const b = document.createElement("button");
      b.className = "switch small";
      b.setAttribute("role", "switch");
      b.setAttribute("aria-checked", String(!!cur));
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        mutate(() => { part.opts = { ...(part.opts || {}), [o.key]: !cur }; });
      });
      wrap.append(document.createTextNode(o.key), b);
    } else {
      const n = document.createElement("input");
      n.type = "number";
      n.id = `opt-${part.id}-${o.key}`;
      n.name = n.id;
      n.min = "1";
      n.max = "40";
      n.value = String(cur);
      n.addEventListener("input", () => {
        mutate(() => {
          part.opts = { ...(part.opts || {}), [o.key]: Number(n.value) || o.default };
        }, `${part.id}:${o.key}`);
      });
      n.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      wrap.append(document.createTextNode(o.key), n);
    }
    opts.append(wrap);
  }
  return opts;
}

function itemBody(info) {
  const body = document.createElement("div");
  body.innerHTML = `<div class="name"></div><div class="about"></div>`;
  body.querySelector(".name").textContent = info.label;
  body.querySelector(".about").textContent = info.about;
  return body;
}

/* Arraste e setas só existem para a parte que está na barra: a guardada não
   tem posição para trocar. */
function enableReorder(li, part, grip) {
  grip.textContent = "⠿";
  grip.title = "drag to reorder (or ⌥↑ / ⌥↓)";
  grip.addEventListener("pointerdown", (ev) => startDrag(ev, li));
  li.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest("button, input")) return;
    startDrag(ev, li);
  });
  li.addEventListener("keydown", (ev) => {
    if (!ev.altKey || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
    ev.preventDefault();
    moveBy(part.id, ev.key === "ArrowUp" ? -1 : 1);
  });
}

function itemNode(part, index, { ligada }) {
  const info = meta(part.id);
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = part.id;
  li.dataset.index = String(index);
  li.dataset.on = String(ligada);
  li.tabIndex = 0;
  li.setAttribute("aria-label", `${info.label}. ${ligada ? "position " + (index + 1) : "out of the bar"}`);

  const grip = document.createElement("div");
  grip.className = "grip";

  const side = document.createElement("div");
  side.className = "side";
  if (ligada) side.append(joinChip(part, index === 0));
  side.append(powerSwitch(part, ligada, info));

  li.append(grip, itemBody(info), side);
  if (!ligada) return li;

  if (info.opts.length) li.append(optionRow(part, info));
  enableReorder(li, part, grip);
  return li;
}

/* Reordenar pelo teclado: mesma operação do arraste, sem o gesto. */
function moveBy(id, delta) {
  const list = activeParts();
  const at = list.findIndex((p) => p.id === id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= list.length) return;
  mutate(() => {
    const [moved] = list.splice(at, 1);
    list.splice(to, 0, moved);
    state.config.parts = [...list, ...state.config.parts.filter((p) => p.on === false)];
  });
  const el = document.querySelector(`#active [data-id="${id}"]`);
  if (el) el.focus();
  setMsg(`${meta(id).label} moved to position ${to + 1}.`);
}

function render({ keepFocus = false } = {}) {
  const focus = keepFocus ? document.activeElement : null;
  const focusKey = focus && focus.closest(".item")
    ? `${focus.closest(".item").dataset.id}|${focus.previousSibling?.textContent || ""}`
    : null;

  const list = $("#active");
  list.textContent = "";
  activeParts().forEach((p, i) => list.append(itemNode(p, i, { ligada: true })));
  $("#active-empty").hidden = activeParts().length > 0;

  const off = $("#inactive");
  off.textContent = "";
  const guardadas = inactiveParts();
  guardadas.forEach((p, i) => off.append(itemNode(p, i, { ligada: false })));
  $("#off-head").hidden = guardadas.length === 0;

  const theme = state.config.theme || {};
  setSwitch("#th-flat", !!theme.flat);
  setSwitch("#th-links", theme.links !== false);
  setSwitch("#th-ascii", !!theme.ascii);

  const mudou = dirty();
  $("#save").disabled = !mudou;
  $("#revert").disabled = !mudou;
  $("#undo").disabled = history.past.length === 0;
  $("#redo").disabled = history.future.length === 0;
  $("#dot").dataset.state = mudou ? "unsaved" : "saved";

  if (focusKey) {
    for (const el of document.querySelectorAll(".item input")) {
      const key = `${el.closest(".item").dataset.id}|${el.previousSibling?.textContent || ""}`;
      if (key === focusKey) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }
}

function setSwitch(sel, on) {
  $(sel).setAttribute("aria-checked", String(on));
}

function commit(opts) {
  render(opts);
  preview();
  if (dirty()) setMsg("Unsaved changes.");
}

/* ---------- arraste ---------- */
let drag = null;

function startDrag(ev, li) {
  if (ev.button !== 0 || drag) return;
  const items = [...$("#active").children];
  const rects = items.map((el) => el.getBoundingClientRect());
  const index = items.indexOf(li);
  if (index < 0) return;
  drag = {
    li,
    items,
    rects,
    index,
    target: index,
    height: rects[index].height + 8,
    startY: ev.clientY,
    dy: 0,
    vy: 0,
    lastY: ev.clientY,
    lastT: performance.now(),
    moved: false,
  };
  try { li.setPointerCapture(ev.pointerId); } catch {}
  li.dataset.dragging = "true";
  ev.preventDefault();
}

function onMove(ev) {
  if (!drag) return;
  const now = performance.now();
  const dt = Math.max(now - drag.lastT, 1);
  drag.vy = ((ev.clientY - drag.lastY) / dt) * 1000;
  drag.lastY = ev.clientY;
  drag.lastT = now;

  let dy = ev.clientY - drag.startY;
  if (Math.abs(dy) > 4) drag.moved = true;

  const min = -drag.index * drag.height;
  const max = (drag.items.length - 1 - drag.index) * drag.height;
  if (dy < min) dy = min + rubberband(dy - min, 300);
  if (dy > max) dy = max + rubberband(dy - max, 300);
  drag.dy = dy;
  drag.li.style.transform = `translateY(${dy}px)`;

  const target = Math.max(0, Math.min(drag.items.length - 1, drag.index + Math.round(dy / drag.height)));
  if (target !== drag.target) {
    drag.target = target;
    shiftOthers();
  }
}

/* Os outros abrem espaço durante o gesto, não depois dele. */
function shiftOthers() {
  drag.items.forEach((el, i) => {
    if (i === drag.index) return;
    let to = 0;
    if (drag.index < drag.target && i > drag.index && i <= drag.target) to = -drag.height;
    if (drag.index > drag.target && i >= drag.target && i < drag.index) to = drag.height;
    const from = currentY(el);
    if (Math.abs(from - to) < 0.5) return;
    spring(el, { from, to, response: 0.32, damping: 1 });
  });
}

function currentY(el) {
  const m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform || "");
  return m ? Number(m[1]) : 0;
}

async function endDrag(ev) {
  if (!drag) return;
  const d = drag;
  drag = null;
  try {
    d.li.releasePointerCapture(ev.pointerId);
  } catch {}

  if (!d.moved) {
    d.li.dataset.dragging = "false";
    d.li.style.transform = "";
    return;
  }

  const settle = (d.target - d.index) * d.height;
  await spring(d.li, { from: d.dy, to: settle, velocity: d.vy, damping: d.vy ? 0.82 : 1 });
  d.li.dataset.dragging = "false";

  if (d.target !== d.index) {
    mutate(() => {
      const list = activeParts();
      const [moved] = list.splice(d.index, 1);
      list.splice(d.target, 0, moved);
      state.config.parts = [...list, ...state.config.parts.filter((p) => p.on === false)];
    });
    return;
  }
  commit();
}

addEventListener("pointermove", onMove, { passive: true });
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);

/* ---------- preview: ANSI de verdade, vindo do script ---------- */
/* Interpreta os códigos que o script emite: cor de 24 bits, negrito e reset.
   O link (OSC 8) sai fora, porque no preview ele não leva a lugar nenhum. */
const SGR = {
  0: (s) => { s.fg = s.bg = null; s.bold = false; },
  1: (s) => { s.bold = true; },
  22: (s) => { s.bold = false; },
  39: (s) => { s.fg = null; },
  49: (s) => { s.bg = null; },
};

function applySgr(codes, style) {
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (SGR[c]) { SGR[c](style); continue; }
    if ((c === 38 || c === 48) && codes[i + 1] === 2) {
      const col = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
      if (c === 38) style.fg = col; else style.bg = col;
      i += 4;
    }
  }
}

/* A barra de 175 colunas não cabe na largura da página, e rolar de lado para
   ver o fim da pílula é pior que vê-la menor: o preview encolhe até caber. */
function ajustarEscala(box, pre) {
  pre.style.transform = "none";
  box.style.height = "";
  const disponivel = box.clientWidth - 28;
  const escala = Math.min(1, disponivel / pre.scrollWidth);
  if (escala >= 0.999) return;
  pre.style.transformOrigin = "left top";
  pre.style.transform = `scale(${escala})`;
  box.style.height = `${Math.ceil(pre.offsetHeight * escala) + 26}px`;
}

/* Duas camadas na mesma célula de grid: embaixo os fundos (texto invisível),
   em cima o texto (sem fundo). O fundo do glint muda a cada caractere, então
   cada span carrega o seu; numa camada só, o fundo do span seguinte passava por
   cima do glifo Nerd Font, que num navegador desenha mais largo que a célula, e
   comia pedaço de ícone. Mesmo conteúdo nas duas camadas garante a mesma
   métrica, e o grid garante a mesma origem. */
function ansiSpans(line, fundo) {
  const frag = document.createDocumentFragment();
  const style = { fg: null, bg: null, bold: false };
  const re = /\x1b\[([0-9;]*)m|([^\x1b]+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (!m[2]) {
      applySgr((m[1] || "0").split(";").map(Number), style);
      continue;
    }
    const span = document.createElement("span");
    span.textContent = m[2];
    if (fundo) {
      span.style.color = "transparent";
      if (style.bg) span.style.background = style.bg;
    } else if (style.fg) {
      span.style.color = style.fg;
    }
    if (style.bold) span.style.fontWeight = "600";
    frag.append(span);
  }
  return frag;
}

function ansiLine(line) {
  const row = document.createElement("div");
  row.className = "row";
  for (const fundo of [true, false]) {
    const layer = document.createElement("div");
    layer.className = fundo ? "layer bg" : "layer fg";
    layer.append(ansiSpans(line, fundo));
    row.append(layer);
  }
  if (!line) row.innerHTML = "&nbsp;";
  return row;
}

function ansiToDom(text) {
  const frag = document.createDocumentFragment();
  for (const line of text.replace(/\x1b\]8;;[^\x07]*\x07/g, "").split("\n")) frag.append(ansiLine(line));
  return frag;
}

let previewTimer = null;
let previewSeq = 0;
function preview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 110);
}

async function runPreview() {
  const seq = ++previewSeq;
  try {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: state.config, scenario: state.scenario, columns: state.columns }),
    });
    const data = await res.json();
    if (seq !== previewSeq) return;
    const box = $("#preview");
    box.textContent = "";
    const pre = document.createElement("pre");
    pre.append(ansiToDom(data.ansi.replace(/\n$/, "")));
    box.append(pre);
    ajustarEscala(box, pre);
    const lines = data.ansi.replace(/\n$/, "").split("\n").length;
    $("#preview-note").textContent =
      `${lines} ${lines === 1 ? "pill" : "pills"} across ${data.columns} columns, with this machine's own data`;
  } catch (err) {
    $("#preview-note").textContent = `preview failed: ${err}`;
  }
}

/* ---------- ações ---------- */
function applyPreset(preset) {
  mutate(() => {
    if (!preset.parts) {
      state.config = { ...clone(state.defaults), theme: state.config.theme };
      return;
    }
    const wanted = preset.parts.map((spec) => {
      const [id, join] = spec.split(":");
      const old = state.config.parts.find((p) => p.id === id) || {};
      return { id, on: true, join, ...(old.opts ? { opts: old.opts } : {}) };
    });
    const rest = state.catalog
      .filter((c) => !preset.parts.some((s) => s.split(":")[0] === c.id))
      .map((c) => ({ id: c.id, on: false, join: "space" }));
    state.config = { ...state.config, parts: [...wanted, ...rest] };
  });
  setMsg(`Preset "${preset.label}" applied. Undo brings your layout back.`);
}

function setMsg(text, tone = "") {
  const el = $("#msg");
  el.textContent = text;
  el.dataset.tone = tone;
}

async function save() {
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: state.config }),
  });
  const data = await res.json();
  if (data.error) return setMsg(data.error, "error");
  state.saved = clone(state.config);
  render();
  setMsg(data.backup ? "Saved. The previous version became a backup." : "Saved.", "ok");
}

function wireScenarios() {
  const scen = [
    ["normal", "Right now"],
    ["contexto-cheio", "Context full"],
    ["cota-apertada", "Quota tight"],
    ["cota-estourando", "Quota running out"],
    ["raciocinio-maximo", "Max reasoning"],
    ["tela-estreita", "Narrow screen"],
  ];
  const box = $("#scenarios");
  for (const [id, label] of scen) {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(id === state.scenario));
    b.addEventListener("click", () => {
      state.scenario = id;
      if (id === "tela-estreita") { state.columns = 80; $("#columns").value = "80"; $("#columns-out").value = "80"; }
      for (const other of box.children) other.setAttribute("aria-selected", String(other === b));
      runPreview();
    });
    box.append(b);
  }
}

function wireConfigFile() {
  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.config, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "glint-config.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("Config exported.");
  });

  $("#import").addEventListener("click", () => $("#file").click());
  $("#file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.parts)) throw new Error("no parts list");
      mutate(() => { state.config = parsed; });
      setMsg(`Imported from ${file.name}. Check the preview before saving.`);
    } catch (err) {
      setMsg(`Could not import: ${err.message}`, "error");
    }
    ev.target.value = "";
  });
}

function wire() {
  wireScenarios();
  wireConfigFile();

  $("#columns").addEventListener("input", (ev) => {
    state.columns = Number(ev.target.value);
    $("#columns-out").value = ev.target.value;
    preview();
  });

  for (const [sel, key] of [["#th-flat", "flat"], ["#th-links", "links"], ["#th-ascii", "ascii"]]) {
    $(sel).addEventListener("click", () => {
      const now = $(sel).getAttribute("aria-checked") === "true";
      mutate(() => {
        state.config.theme = { ...(state.config.theme || {}), [key]: !now };
      });
    });
  }

  $("#save").addEventListener("click", save);
  $("#undo").addEventListener("click", undo);
  $("#redo").addEventListener("click", redo);
  $("#revert").addEventListener("click", () => {
    mutate(() => { state.config = clone(state.saved); });
    setMsg("Back to what is saved.");
  });
  $("#reset").addEventListener("click", () => {
    mutate(() => { state.config = clone(state.defaults); });
    setMsg("Back to the factory default. Not saved yet.");
  });

  addEventListener("keydown", (ev) => {
    const cmd = ev.metaKey || ev.ctrlKey;
    if (!cmd) return;
    if (ev.key === "s") {
      ev.preventDefault();
      if (dirty()) save();
    } else if (ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
    }
  });
}

async function boot() {
  const data = await (await fetch("/api/bootstrap")).json();
  state.catalog = data.catalog;
  state.defaults = data.defaults;
  state.presets = data.presets;
  state.config = data.config && !data.config.__error ? data.config : clone(data.defaults);
  state.saved = clone(state.config);
  $("#config-path").textContent = data.configPath;

  const presets = $("#presets");
  for (const p of data.presets) {
    const b = document.createElement("button");
    b.className = "preset";
    b.innerHTML = "<b></b><span></span>";
    b.querySelector("b").textContent = p.label;
    b.querySelector("span").textContent = p.about;
    b.addEventListener("click", () => applyPreset(p));
    presets.append(b);
  }

  wire();
  render();
  runPreview();
  if (data.config && data.config.__error) setMsg(data.config.__error, "error");
  else if (!data.config) setMsg("No config saved yet: the default is live.");
  else setMsg("Config loaded.");
}

boot();
