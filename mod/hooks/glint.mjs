// glint as a mod: a liquid-glass pill above the prompt. At rest it is a compact readout;
// while Claude works it grows into a live activity with a light sweeping across the glass;
// events pop for a moment; pressure tints the rim. Every motion means something.

import { CAP_L, CAP_R, INK, STATE, capColor, contextBar, pillCells, short, spans, springStep, stateColor, textWidth } from "./pill.mjs";

const PREFS = { plugin: "glint", key: "prefs" };
const FRAME_MS = 50;
const POP_MS = 2600;
const FLASH_MS = 350;
const SWEEP_CELLS_PER_FRAME = 1.1;
const EFFORT_INK = { low: "#f0be46", medium: "#30d758", high: "#4d9eff", xhigh: "#a78bfa", max: "#d26ef5", ultra: "#2dd7ff" };
const TOOL_LABEL = { Bash: (i) => i.description || i.command, Edit: (i) => i.file_path, Write: (i) => i.file_path, Read: (i) => i.file_path, Grep: (i) => i.pattern, Glob: (i) => i.pattern, Agent: (i) => i.description, WebFetch: (i) => i.url };

const s = {
  model: "",
  effort: "",
  project: "",
  branch: "",
  dirty: 0,
  ctx: { tokens: 0, window: 0, pct: 0 },
  limits: [],
  working: false,
  turnStart: 0,
  tool: null,
  pop: null,
  flash: null,
  frame: 0,
  width: 0,
  timer: null,
  demo: null,
};

export function prettyModel(id) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id ?? "");
  if (!m) return id ?? "";
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ""}`;
}

function base(path) {
  return String(path ?? "").split("/").filter(Boolean).pop() ?? "";
}

function clip(text, n) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function elapsed(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, "0")}`;
}

function clock(now) {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function worstLimit() {
  return s.limits.reduce((m, l) => Math.max(m, l.pct), 0);
}

// What the pill says. Live activity first, then a pop, then the resting readout.
export function segments(now, columns) {
  const sep = { text: "   ", fg: INK.tert };
  const out = [{ text: s.model || "Claude", fg: INK.accent, bold: true }];
  if (s.effort) out.push({ text: " ●", fg: EFFORT_INK[s.effort] ?? INK.second });

  const popping = s.pop && now < s.pop.until;
  if (popping) out.push(sep, { text: s.pop.text, fg: s.pop.color, bold: true });
  if (s.working) {
    out.push(sep, { text: " ", fg: INK.gold });
    if (s.tool) out.push({ text: `${s.tool.name} `, fg: INK.primary, bold: true }, { text: clip(s.tool.label, Math.max(12, columns - 60)), fg: INK.second });
    else out.push({ text: "thinking", fg: INK.second });
    out.push(sep, { text: elapsed(now - s.turnStart), fg: INK.primary });
  }

  const rest = [];
  if (s.project) rest.push({ prio: 3, parts: [{ text: " ", fg: INK.second }, { text: s.project }] });
  if (s.branch) rest.push({ prio: 2, parts: [{ text: " ", fg: INK.second }, { text: s.branch }, ...(s.dirty ? [{ text: ` •${s.dirty}`, fg: INK.amber }] : [])] });
  if (s.ctx.window) {
    const wave = s.ctx.pct >= 75 && s.timer ? s.frame : undefined;
    rest.push({
      prio: 5,
      parts: [{ text: " ", fg: INK.second }, ...contextBar(s.ctx.pct, 8, wave), { text: `  ${s.ctx.pct}%`, fg: stateColor(s.ctx.pct), bold: true }, { text: `  ${short(s.ctx.tokens)}`, fg: INK.primary }, { text: `/${short(s.ctx.window)}`, fg: INK.second }],
    });
  }
  for (const l of s.limits) rest.push({ prio: l.pct >= 80 ? 4 : 1, parts: [{ text: `${l.label} `, fg: INK.second }, { text: `${l.pct}%`, fg: l.pct >= 80 ? stateColor(l.pct) : INK.primary, bold: l.pct >= 80 }] });
  rest.push({ prio: 0, parts: [{ text: clock(now), fg: INK.second }] });

  const budget = columns - 12 - textWidth(out);
  let chosen = [...rest];
  while (chosen.length && chosen.reduce((n, b) => n + textWidth(b.parts) + 3, 0) > budget) {
    const lowest = chosen.reduce((m, b) => (b.prio < m.prio ? b : m));
    chosen = chosen.filter((b) => b !== lowest);
  }
  for (const b of rest.filter((b) => chosen.includes(b))) out.push(sep, ...b.parts);
  return out;
}

// How the glass looks right now: the glint while working, a flash after an event, a rim
// tint under pressure that breathes when it is urgent.
export function look(now) {
  const out = {};
  if (s.working) out.glintAt = ((s.frame * SWEEP_CELLS_PER_FRAME) % (s.width + 16)) - 8;
  if (s.flash && now < s.flash.until) out.flash = { color: s.flash.color, strength: 0.8 * ((s.flash.until - now) / FLASH_MS) };
  const pressure = Math.max(s.ctx.pct, worstLimit());
  if (pressure >= 90) {
    out.tint = STATE.red;
    out.tintStrength = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin((now / 1800) * 2 * Math.PI));
  } else if (worstLimit() >= 80) {
    out.tint = STATE.orange;
    out.tintStrength = 0.18;
  }
  return out;
}

function needsFrames(now) {
  return s.working || (s.pop && now < s.pop.until) || (s.flash && now < s.flash.until) || Math.abs(s.width - s.target) > 0 || Math.max(s.ctx.pct, worstLimit()) >= 90;
}

function animate($) {
  if (s.timer) return;
  s.timer = $.clock.every(FRAME_MS, async () => {
    s.frame += 1;
    $.ui.invalidate("ui.render");
    if (!needsFrames(await $.clock.now())) {
      s.timer?.cancel();
      s.timer = null;
      $.ui.invalidate("ui.render");
    }
  });
}

function pop($, now, text, color) {
  s.pop = { text, color, until: now + POP_MS };
  s.flash = { color, until: now + FLASH_MS };
  animate($);
}

async function readUsage($) {
  try {
    const u = await $.session.usage();
    applyMeasure(u, await compactWindow($));
  } catch {
    // usage is best effort; the pill keeps the last reading
  }
}

async function compactWindow($) {
  const raw = await $.env.get("CLAUDE_CODE_AUTO_COMPACT_WINDOW");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function applyMeasure(m, compact) {
  const window = compact || m.context?.window || 0;
  const tokens = m.context?.tokens ?? 0;
  s.ctx = { tokens, window, pct: window ? Math.min(100, Math.round((tokens * 100) / window)) : 0 };
  const labels = { five_hour: "5h", seven_day: "7d" };
  s.limits = (m.rateLimits ?? []).filter((l) => labels[l.kind]).map((l) => ({ label: labels[l.kind], pct: Math.round(l.percentUsed) }));
}

async function readGit($) {
  try {
    const cwd = await $.session.cwd();
    const r = await $.process.run(["git", "status", "--porcelain", "-b"], { cwd, timeoutMs: 3000 });
    if (r.exitCode !== 0) {
      s.branch = "";
      return;
    }
    const [head, ...rest] = r.stdout.split("\n");
    s.branch = (/^## (?:No commits yet on )?([^.\s]+)/.exec(head) ?? [])[1] ?? "";
    s.dirty = rest.filter(Boolean).length;
  } catch {
    s.branch = "";
  }
}

async function enabled($) {
  const { value } = await $.state.get(PREFS);
  return value?.on !== false;
}

export function state() {
  return s;
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    const r = await next(e);
    await $.command.register({ name: "glint", description: "glint pill: on, off, or demo", argumentHint: "on | off | demo" });
    s.model = prettyModel(await $.session.model());
    s.effort = (await $.env.get("CLAUDE_EFFORT")) ?? "";
    s.project = base((await $.session.repo())?.root ?? (await $.session.cwd()));
    await Promise.all([readUsage($), readGit($)]);
    $.ui.invalidate("ui.render");
    return r;
  });

  on("session.measure", async ($, e, next) => {
    const r = await next(e);
    applyMeasure(e, await compactWindow($));
    return r;
  });

  on("turn.start", async ($, e, next) => {
    s.working = true;
    s.turnStart = await $.clock.now();
    s.tool = null;
    animate($);
    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    if (e.agentId) return next(e);
    const label = TOOL_LABEL[e.tool]?.(e) ?? "";
    s.tool = { name: e.tool.replace(/^mcp__([^_]+)__/, "$1 "), label: e.tool === "Bash" ? label : base(label) || label };
    const r = await next(e);
    s.tool = null;
    if (r?.isError) pop($, await $.clock.now(), `✕ ${e.tool} failed`, STATE.red);
    if (["Edit", "Write", "Bash", "NotebookEdit"].includes(e.tool)) readGit($);
    return r;
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (e.agentId) return r;
    const now = await $.clock.now();
    s.working = false;
    s.tool = null;
    if (e.reason === "answer") pop($, now, `✓ done ${elapsed(e.durationMs)}`, STATE.green);
    else if (e.reason === "aborted") pop($, now, "■ stopped", INK.second);
    else pop($, now, `✕ ${e.reason}`, STATE.red);
    await readUsage($);
    return r;
  });

  on("command.run", { command: "glint" }, async ($, e) => {
    const arg = e.args.trim();
    if (arg === "off" || arg === "on") {
      await $.state.set(PREFS, { on: arg === "on" });
      return { text: `glint ${arg}` };
    }
    if (arg === "demo") {
      runDemo($);
      return { text: "glint demo: about 12 seconds" };
    }
    return { text: "usage: /glint on | off | demo" };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await enabled($))) return next(e);
    const now = await $.clock.now();
    const columns = e.props.bodyColumns ?? 120;
    const segs = segments(now, columns);
    s.target = Math.min(columns - 4, textWidth(segs) + 4);
    s.width = s.width ? springStep(s.width, s.target) : s.target;
    if (s.width !== s.target) animate($);
    const cells = pillCells(segs, s.width, look(now));
    const { Box, Text } = $.ui.resolve(e);
    const children = [
      Text({ key: "l", color: capColor(cells, "left"), children: CAP_L }),
      ...spans(cells).map((p, i) => Text({ key: `s${i}`, color: p.fg, backgroundColor: p.bg, bold: p.bold, children: p.text })),
      Text({ key: "r", color: capColor(cells, "right"), children: CAP_R }),
    ];
    const own = Box({ flexDirection: "row", paddingX: 1, children });
    const below = await next(e);
    return below ? Box({ flexDirection: "column", children: [own, below] }) : own;
  });
}

// A scripted run of every state, for screenshots and for checking the motion without
// spending a single model call.
function runDemo($) {
  s.demo?.forEach((t) => t.cancel());
  const at = (ms, fn) => $.clock.after(ms, async () => {
    fn(await $.clock.now());
    animate($);
    $.ui.invalidate("ui.render");
  });
  const saved = { ...s.ctx };
  const window = s.ctx.window || 600_000;
  const at42 = { tokens: Math.round(window * 0.42), window, pct: 42 };
  s.demo = [
    at(0, (now) => Object.assign(s, { working: true, turnStart: now, tool: null, ctx: at42 })),
    at(1500, () => (s.tool = { name: "Read", label: "schema.ts" })),
    at(3000, () => (s.tool = { name: "Bash", label: "bun test apps/nucleo packages" })),
    at(5200, (now) => {
      s.tool = null;
      pop($, now, "✕ Bash failed", STATE.red);
    }),
    at(6200, () => (s.tool = { name: "Edit", label: "triagem.ts" })),
    at(7400, (now) => {
      Object.assign(s, { working: false, tool: null });
      pop($, now, "✓ done 7s", STATE.green);
    }),
    at(9000, () => (s.ctx = { tokens: Math.round(window * 0.93), window, pct: 93 })),
    at(12500, () => (s.ctx = saved)),
  ];
}
