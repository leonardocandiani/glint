// glint as a mod: the liquid-glass status line, living in the band above the prompt.
// It shows the facts Claude Code does not (effort, repo, branch, context against the
// compact window, account, quota pace, version, status, network, date) and speaks in
// light alone: a glint sweeps the glass while Claude works, the rim flashes on a failed
// tool or a finished turn and breathes under pressure. It never repeats what Claude Code
// already prints, and it wraps into a second pill instead of dropping a fact.

import { CAP_L, CAP_R, INK, STATE, cellsWidth, contextBar, easeTo, pillCells, short, spans, springStep, stateColor, textWidth } from "./pill.mjs";
import { githubUrl, parseBranch, reserve, untilText } from "./sources.mjs";

const TTL = { version: 1800, status: 300, net: 60 };
const MEASURE_FRESH_S = 600;

const PREFS = { plugin: "glint", key: "prefs" };
const FRAME_MS = 50;
const REFRESH_MS = 30_000;
const FLASH_MS = 350;
const INTRO_MS = 900;
const SEP = { text: "   ", fg: INK.tert };
const EFFORT_INK = { low: "#f0be46", medium: "#30d758", high: "#4d9eff", xhigh: "#a78bfa", max: "#d26ef5", ultra: "#2dd7ff" };
const EFFORT_ICON = { low: "\u{f0f86}", medium: "\u{f0f85}", high: "\u{f04c5}", xhigh: "\u{f04c5}", max: "\u{f04c5}", ultra: "\u{f04c5}" };

const s = {
  home: "",
  model: "",
  version: "",
  modes: { effort: "", thinking: false, fast: false, reduceMotion: false },
  git: { project: "", branch: "", dirty: 0, worktree: false, repoUrl: null },
  account: { name: "", preferred: "" },
  measure: null,
  net: { latest: "", status: "", degraded: "", netMs: "" },
  ctx: { tokens: 0, window: 0, pct: 0 },
  ctxShown: 0,
  limits: {},
  working: false,
  turnStart: 0,
  flash: null,
  introUntil: 0,
  frame: 0,
  widths: [],
  targets: [],
  timer: null,
  slow: null,
  demo: null,
  off: false,
};

export function prettyModel(id) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id ?? "");
  if (!m) return id ?? "";
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ""}`;
}

const base = (p) => String(p ?? "").split("/").filter(Boolean).pop() ?? "";
const pad2 = (n) => String(n).padStart(2, "0");
const limitInk = (p) => (p >= 90 ? STATE.red : p >= 80 ? STATE.orange : p >= 55 ? STATE.yellow : STATE.green);

function windows(nowS) {
  const m = s.measure?.fresh ? s.measure : null;
  const pick = (key, label, winS, mix) => {
    const src = (m && m[key]) || s.limits[key];
    if (!src || !Number.isFinite(src.pct)) return null;
    return { label, pct: Math.round(src.pct), resetsAt: src.resetsAt, reserve: reserve(src.pct, src.resetsAt, winS, nowS, mix ? s.measure?.history : null) };
  };
  return [pick("w5", "5h", 18_000, true), pick("w7", "7d", 604_800, false)].filter(Boolean);
}

// The facts, as blocks the packer can move between pills but never split.
export function blocks(now, columns) {
  const nowS = Math.floor(now / 1000);
  const out = [];
  const id = [{ text: s.model || "Claude", fg: INK.accent, bold: true }];
  if (EFFORT_ICON[s.modes.effort]) id.push({ text: `  ${EFFORT_ICON[s.modes.effort]}`, fg: EFFORT_INK[s.modes.effort] });
  if (s.modes.thinking) id.push({ text: " ", fg: INK.gold });
  if (s.modes.fast) id.push({ text: " ", fg: INK.second });
  out.push({ id: "identity", prio: 9, parts: id });
  if (s.git.project) out.push({ id: "project", prio: 8, parts: [{ text: " ", fg: INK.second }, { text: s.git.project, href: s.git.repoUrl ?? undefined }] });
  if (s.git.branch) {
    const href = s.git.repoUrl ? `${s.git.repoUrl}/tree/${encodeURIComponent(s.git.branch).replace(/%2F/g, "/")}` : undefined;
    out.push({ id: "git", prio: 7, parts: [{ text: `${s.git.worktree ? "" : ""} `, fg: INK.second }, { text: s.git.branch, href }, ...(s.git.dirty ? [{ text: ` •${s.git.dirty}`, fg: INK.amber }] : [])] });
  }
  if (s.ctx.window) {
    out.push({
      id: "context",
      prio: 8,
      parts: [{ text: " ", fg: INK.second }, ...contextBar(s.ctxShown, s.ctx.pct, 8), { text: `  ${s.ctx.pct}%`, fg: stateColor(s.ctx.pct), bold: true }, { text: `  ${short(s.ctx.tokens)}`, fg: INK.primary }, { text: `/${short(s.ctx.window)}`, fg: INK.second }],
    });
  }
  out.push(...usageBlocks(nowS));
  out.push(...healthBlocks());
  const d = new Date(now);
  out.push({ id: "clock", prio: 1, parts: [{ text: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`, fg: INK.second }] });
  return out;
}

function usageBlocks(nowS) {
  const parts = [];
  if (s.account.name) {
    const primary = s.account.preferred && s.account.name === s.account.preferred;
    const mark = !s.account.preferred ? "" : primary ? "①" : "②";
    parts.push({ text: `${mark} `, fg: !s.account.preferred ? INK.second : primary ? INK.accent : INK.amber, bold: true });
  }
  const wins = windows(nowS);
  const risky = wins.filter((w) => w.reserve !== null).sort((a, b) => a.reserve - b.reserve)[0];
  if (risky) {
    const [icon, ink] = risky.reserve >= 25 ? ["\u{f0f86}", STATE.green] : risky.reserve >= 0 ? ["\u{f0f85}", STATE.yellow] : ["\u{f04c5}", STATE.red];
    parts.push({ text: `${icon} `, fg: ink }, { text: `${risky.reserve >= 0 ? "+" : ""}${risky.reserve}  `, fg: INK.second });
  }
  for (const w of wins) {
    const atRisk = risky && w === risky && w.reserve < 25;
    if (atRisk && w.reserve < 0) parts.push({ text: " ", fg: STATE.red });
    parts.push({ text: `${w.label} `, fg: atRisk ? (w.reserve < 0 ? STATE.red : STATE.yellow) : INK.second, bold: atRisk });
    parts.push({ text: `${w.pct}%`, fg: limitInk(w.pct) });
    if (Number.isFinite(w.resetsAt) && (w.pct >= 80 || (w.reserve !== null && w.reserve < 0))) parts.push({ text: ` ↻${untilText(w.resetsAt, nowS)}`, fg: limitInk(w.pct) });
    parts.push({ text: "  " });
  }
  if (parts.length && parts[parts.length - 1].text === "  ") parts.pop();
  return parts.length ? [{ id: "usage", prio: 6, parts }] : [];
}

function healthBlocks() {
  const out = [];
  if (s.version) {
    const behind = s.net.latest && s.net.latest !== s.version;
    const minor = behind && s.net.latest.split(".").slice(0, 2).join(".") === s.version.split(".").slice(0, 2).join(".");
    const ink = !behind ? INK.second : minor ? STATE.yellow : STATE.red;
    out.push({ id: "version", prio: 3, parts: [{ text: " ", fg: INK.second }, { text: s.version, fg: ink, href: `https://github.com/anthropics/claude-code/releases/tag/v${behind ? s.net.latest : s.version}` }] });
  }
  const stInk = { none: STATE.green, minor: STATE.yellow, major: STATE.orange, critical: STATE.red }[s.net.status] ?? INK.tert;
  if (s.net.status) out.push({ id: "status", prio: 3, parts: [{ text: `●${s.net.status !== "none" && s.net.degraded ? ` ${s.net.degraded}` : ""}`, fg: stInk, href: "https://status.claude.com" }] });
  if (s.net.netMs) {
    const ms = Number(s.net.netMs);
    const ink = s.net.netMs === "down" ? STATE.red : ms <= 300 ? STATE.green : ms <= 1000 ? STATE.yellow : STATE.orange;
    out.push({ id: "net", prio: 2, parts: [{ text: "\u{f05a9}", fg: ink }] });
  }
  return out;
}

const joinWidth = (bs) => bs.reduce((n, b, i) => n + textWidth(b.parts) + (i ? 3 : 0), 0);

// Greedy packing like the status line: fill a pill, open the next when a block does not
// fit, never split a block; past the last pill the lowest priority block goes first.
export function pack(all, inner, maxPills) {
  let keep = [...all];
  for (;;) {
    const pills = [[]];
    for (const b of keep) {
      const cur = pills[pills.length - 1];
      if (cur.length && joinWidth([...cur, b]) > inner) pills.push([b]);
      else cur.push(b);
    }
    if (pills.length <= maxPills && pills.every((p) => joinWidth(p) <= inner)) return pills;
    const lowest = keep.reduce((m, b) => (b.prio < m.prio ? b : m));
    keep = keep.filter((b) => b !== lowest);
    if (!keep.length) return [[]];
  }
}

function segmentsOf(pillBlocks) {
  return pillBlocks.flatMap((b, i) => (i ? [SEP, ...b.parts] : b.parts));
}

const worstPressure = (nowS) => Math.max(s.ctx.pct, ...windows(nowS).map((w) => w.pct));

// How the glass looks now: the glint while working or materialising, a rim flash after
// an event, an amber rim past 80% of a window, a red rim breathing past 90%.
export function look(now, index, width) {
  const out = {};
  const nowS = Math.floor(now / 1000);
  const intro = now < s.introUntil;
  if (!s.modes.reduceMotion && ((s.working && index === 0) || intro)) out.glintAt = ((s.frame * 1.2) % (width + 16)) - 8;
  if (s.flash && now < s.flash.until) out.flash = { color: s.flash.color, strength: 0.8 * ((s.flash.until - now) / FLASH_MS) };
  const pressure = worstPressure(nowS);
  if (pressure >= 90) {
    out.tint = STATE.red;
    out.tintStrength = s.modes.reduceMotion ? 0.5 : 0.35 + 0.35 * (0.5 + 0.5 * Math.sin((now / 1800) * 2 * Math.PI));
  } else if (Math.max(0, ...windows(nowS).map((w) => w.pct)) >= 80) {
    out.tint = STATE.orange;
    out.tintStrength = 0.18;
  }
  return out;
}

function needsFrames(now) {
  if (s.off) return false;
  const nowS = Math.floor(now / 1000);
  const moving = s.widths.some((w, i) => w !== s.targets[i]) || s.ctxShown !== s.ctx.pct;
  const timed = (s.flash && now < s.flash.until) || now < s.introUntil;
  return s.working || moving || timed || (!s.modes.reduceMotion && worstPressure(nowS) >= 90);
}

function stopFrames() {
  s.timer?.cancel();
  s.timer = null;
}

function animate($, now) {
  if (s.timer || !needsFrames(now)) return;
  s.timer = $.clock.every(FRAME_MS, async () => {
    s.frame += 1;
    $.ui.invalidate("ui.render");
    if (!needsFrames(await $.clock.now())) {
      stopFrames();
      $.ui.invalidate("ui.render");
    }
  });
}

// Events speak in light only: Claude Code already prints the tool, the error and the
// turn time, so the pill flashes its rim instead of repeating them.
function pop($, now, color) {
  s.flash = { color, until: now + FLASH_MS };
  animate($, now);
}

export function applyMeasure(m, compact) {
  const window = compact || m.context?.window || 0;
  const tokens = m.context?.tokens ?? 0;
  s.ctx = { tokens, window, pct: window ? Math.min(100, Math.round((tokens * 100) / window)) : 0 };
  for (const l of m.rateLimits ?? []) {
    const key = { five_hour: "w5", seven_day: "w7" }[l.kind];
    if (key) s.limits[key] = { pct: l.percentUsed, resetsAt: l.resetsAt ? Math.floor(Date.parse(l.resetsAt) / 1000) : undefined };
  }
}

async function compactWindow($) {
  const n = Number(await $.env.get("CLAUDE_CODE_AUTO_COMPACT_WINDOW"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function safely(fn) {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

async function refresh($) {
  const nowS = Math.floor((await $.clock.now()) / 1000);
  const [git, modes, net] = await Promise.all([safely(() => readGit($)), safely(() => readModes($)), safely(() => readNetwork($, s.home, nowS))]);
  if (git) s.git = git;
  if (modes) s.modes = modes;
  if (net) s.net = net;
  s.measure = (await safely(() => readMeasure($, s.home, s.account.name, nowS))) ?? s.measure;
  $.ui.invalidate("ui.render");
}

export function state() {
  return s;
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    const r = await next(e);
    await $.command.register({ name: "glint", description: "glint pill: on, off, or demo", argumentHint: "on | off | demo" });
    s.home = (await $.env.get("HOME")) ?? "";
    s.model = prettyModel(await $.session.model());
    s.version = (await safely(async () => (await $.session.version()).version)) ?? "";
    s.account = (await safely(() => readAccount($, s.home))) ?? s.account;
    const usage = await safely(() => $.session.usage());
    if (usage) applyMeasure(usage, await compactWindow($));
    s.off = (await $.state.get(PREFS)).value?.on === false;
    await refresh($);
    const now = await $.clock.now();
    s.introUntil = now + INTRO_MS;
    s.widths = [];
    s.slow?.cancel();
    s.slow = $.clock.every(REFRESH_MS, () => refresh($));
    animate($, now);
    return r;
  });

  on("session.measure", async ($, e, next) => {
    const r = await next(e);
    applyMeasure(e, await compactWindow($));
    animate($, await $.clock.now());
    return r;
  });

  on("turn.start", async ($, e, next) => {
    s.working = true;
    s.turnStart = await $.clock.now();
    s.model = prettyModel(await $.session.model()) || s.model;
    s.modes = (await safely(() => readModes($))) ?? s.modes;
    animate($, s.turnStart);
    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    const r = await next(e);
    if (e.agentId) return r;
    if (r?.isError) pop($, await $.clock.now(), STATE.red);
    if (["Edit", "Write", "Bash", "NotebookEdit"].includes(e.tool)) safely(async () => (s.git = await readGit($)));
    return r;
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (e.agentId) return r;
    const now = await $.clock.now();
    s.working = false;
    pop($, now, e.reason === "answer" ? STATE.green : e.reason === "aborted" ? INK.second : STATE.red);
    const usage = await safely(() => $.session.usage());
    if (usage) applyMeasure(usage, await compactWindow($));
    await refresh($);
    return r;
  });

  on("command.run", { command: "glint" }, async ($, e) => {
    const arg = e.args.trim();
    if (arg === "off" || arg === "on") {
      s.off = arg === "off";
      await $.state.set(PREFS, { on: !s.off });
      if (s.off) stopFrames();
      else animate($, await $.clock.now());
      $.ui.invalidate("ui.render");
      return { text: `glint ${arg}` };
    }
    if (arg === "demo") {
      runDemo($);
      return { text: "glint demo: about 12 seconds" };
    }
    return { text: "usage: /glint on | off | demo" };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey || s.off) return next(e);
    const now = await $.clock.now();
    const own = draw($, e, now);
    animate($, now);
    const below = await next(e);
    return below ? $.ui.resolve(e).Box({ flexDirection: "column", children: [own, below] }) : own;
  });
}

function draw($, e, now) {
  const { Box, Text, Link } = $.ui.resolve(e);
  const columns = e.props.bodyColumns ?? 120;
  const maxPills = Math.max(1, Math.min(2, e.props.maxRows ?? 2));
  const inner = columns - 10;
  s.ctxShown = s.modes.reduceMotion ? s.ctx.pct : easeTo(s.ctxShown, s.ctx.pct);
  const pills = pack(blocks(now, columns), inner, maxPills);
  const rows = pills.map((pb, i) => {
    const segs = segmentsOf(pb);
    s.targets[i] = Math.min(columns - 6, textWidth(segs) + 4);
    const intro = now < s.introUntil ? Math.max(0.15, 1 - (s.introUntil - now) / INTRO_MS) : 1;
    const goal = s.targets[i] * intro;
    s.widths[i] = s.modes.reduceMotion || s.widths[i] === undefined ? goal : springStep(s.widths[i], goal);
    if (now >= s.introUntil && Math.abs(s.widths[i] - s.targets[i]) < 0.5) s.widths[i] = s.targets[i];
    const cells = pillCells(segs, s.widths[i], look(now, i, s.widths[i]));
    const middle = spans(cells).map((p, k) => {
      const t = Text({ key: `t${k}`, color: p.fg, backgroundColor: p.bg, bold: p.bold, children: p.text });
      return p.href ? Link({ key: `l${k}`, href: p.href, children: [t] }) : t;
    });
    return Box({ key: `pill${i}`, flexDirection: "row", children: [Text({ key: "cl", color: cells[0]?.bg, children: CAP_L }), ...middle, Text({ key: "cr", color: cells[cells.length - 1]?.bg, children: CAP_R })] });
  });
  s.widths.length = pills.length;
  s.targets.length = pills.length;
  return Box({ flexDirection: "column", paddingX: 1, children: rows });
}

// A scripted run of every state, for screenshots and for checking the motion without
// spending a single model call.
function runDemo($) {
  s.demo?.forEach((t) => t.cancel());
  const at = (ms, fn) =>
    $.clock.after(ms, async () => {
      const now = await $.clock.now();
      fn(now);
      animate($, now);
      $.ui.invalidate("ui.render");
    });
  const saved = { ...s.ctx };
  const window = s.ctx.window || 600_000;
  const ctx = (pct) => ({ tokens: Math.round((window * pct) / 100), window, pct });
  s.demo = [
    at(0, (now) => Object.assign(s, { working: true, turnStart: now, ctx: ctx(42) })),
    at(3500, (now) => pop($, now, STATE.red)),
    at(6000, (now) => {
      s.working = false;
      s.ctx = ctx(61);
      pop($, now, STATE.green);
    }),
    at(8500, () => (s.ctx = ctx(93))),
    at(12500, () => (s.ctx = saved)),
  ];
}

// Sources: the same places the shell status line reads. The $ calls live in this file
// because a mod may only hand $ to functions declared beside it.

async function readGit($) {
  const cwd = await $.session.cwd();
  const top = await $.process.run(["git", "rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"], { cwd, timeoutMs: 3000 });
  if (top.exitCode !== 0) return { project: base(cwd), branch: "", dirty: 0, worktree: false, repoUrl: null };
  const [root, gitDir, commonDir] = top.stdout.trim().split("\n");
  const abs = (p) => (p.startsWith("/") ? p : `${cwd}/${p}`);
  const worktree = abs(gitDir) !== abs(commonDir);
  const project = worktree ? base(abs(commonDir).replace(/\/\.git\/?$/, "")) : base(root);
  const st = await $.process.run(["git", "status", "--porcelain", "-b"], { cwd, timeoutMs: 3000 });
  const [head, ...rest] = st.stdout.split("\n");
  const remote = await $.process.run(["git", "remote", "get-url", "origin"], { cwd, timeoutMs: 3000 });
  return { project, branch: parseBranch(head), dirty: rest.filter(Boolean).length, worktree, repoUrl: githubUrl(remote.stdout.trim()) };
}

async function readModes($) {
  const out = { effort: "", thinking: false, fast: false, reduceMotion: false };
  try {
    for (const row of await $.config.list()) {
      if (row.key === "thinking") out.thinking = row.value === true;
      if (row.key === "fast") out.fast = row.value === true;
      if (row.key === "reduceMotion") out.reduceMotion = row.value === true;
    }
    const st = await $.settings.read();
    out.effort = String(st.effortLevel ?? (await $.env.get("CLAUDE_EFFORT")) ?? "");
  } catch {
    out.effort = String((await $.env.get("CLAUDE_EFFORT")) ?? "");
  }
  return out;
}

async function readJson($, path) {
  try {
    return JSON.parse(await $.fs.read(path));
  } catch {
    return null;
  }
}

async function readAccount($, home) {
  const dir = `${home}/.config/claude-account`;
  if (!(await $.fs.exists(`${dir}/profiles`))) return { name: "", preferred: "" };
  const policy = await readJson($, `${dir}/policy.json`);
  const token = await $.env.get("CLAUDE_CODE_OAUTH_TOKEN");
  let name = "";
  if (token) {
    const fp = (await $.process.run(["shasum", "-a", "256"], { stdin: token, timeoutMs: 3000 })).stdout.slice(0, 12);
    const cache = await $.fs.read(`${home}/.claude/.cache/statusline-account-fp`).catch(() => "");
    name = cache.split("\n").find((l) => l.startsWith(`${fp} `))?.split(" ")[1] ?? "token?";
  } else {
    for (const e of await $.fs.list(`${dir}/profiles`)) {
      const p = await readJson($, `${dir}/profiles/${e.name}`);
      if (p?.type === "native_archive") {
        name = p.name;
        break;
      }
    }
    name ||= "nativo";
  }
  return { name, preferred: String(policy?.preferred ?? "") };
}

async function readMeasure($, home, account, nowS) {
  const m = await readJson($, `${home}/.config/claude-account/measure.json`);
  if (!m || !account) return null;
  const at = Date.parse(m.measured_at ?? "") / 1000;
  const p = m.profiles?.[account];
  return {
    fresh: Boolean(p && nowS - at < MEASURE_FRESH_S),
    w5: p ? { pct: Number(p.util_5h), resetsAt: Number(p.reset_5h) } : null,
    w7: p ? { pct: Number(p.util_7d), resetsAt: Number(p.reset_7d) } : null,
    history: m.history?.[account] ?? [],
  };
}

async function cacheLine($, path) {
  try {
    return (await $.fs.read(path)).trim();
  } catch {
    return "";
  }
}

async function readNetwork($, home, nowS) {
  const dir = `${home}/.claude/.cache`;
  const [vLine, sLine, nLine] = await Promise.all([cacheLine($, `${dir}/claude-latest-version`), cacheLine($, `${dir}/claude-status`), cacheLine($, `${dir}/net-latency`)]);
  const [latest, vTs] = vLine.split(" ");
  const [ind, bad, sTs] = sLine.split("|");
  const [ms, nTs] = nLine.split("|");
  const out = { latest: latest ?? "", status: ind ?? "", degraded: bad ?? "", netMs: ms ?? "" };
  const jobs = [];
  if (nowS - Number(vTs || 0) > TTL.version) jobs.push(refreshVersion($, `${dir}/claude-latest-version`, nowS, out));
  if (nowS - Number(sTs || 0) > TTL.status) jobs.push(refreshStatus($, `${dir}/claude-status`, nowS, out));
  if (nowS - Number(nTs || 0) > TTL.net) jobs.push(refreshNet($, `${dir}/net-latency`, nowS, out));
  await Promise.allSettled(jobs);
  return out;
}

async function refreshVersion($, path, nowS, out) {
  const r = await $.http.fetch("https://registry.npmjs.org/@anthropic-ai/claude-code/latest");
  const v = r.ok ? JSON.parse(r.text).version : "";
  if (/^\d+\.\d+\.\d+$/.test(v ?? "")) {
    out.latest = v;
    await $.fs.write(path, `${v} ${nowS}\n`);
  }
}

async function refreshStatus($, path, nowS, out) {
  const [s, c] = await Promise.all([$.http.fetch("https://status.claude.com/api/v2/status.json"), $.http.fetch("https://status.claude.com/api/v2/components.json")]);
  if (!s.ok) return;
  out.status = JSON.parse(s.text).status?.indicator ?? "";
  out.degraded = c.ok
    ? JSON.parse(c.text)
        .components.filter((x) => x.status !== "operational")
        .map((x) => x.name.replace(/ \(.*/, "").replace(/^Claude /, ""))
        .join(",")
    : "";
  await $.fs.write(path, `${out.status}|${out.degraded}|${nowS}\n`);
}

async function refreshNet($, path, nowS, out) {
  const t0 = await $.clock.now();
  let ms = "down";
  try {
    await $.http.fetch("https://api.anthropic.com/", { method: "HEAD" });
    ms = String(Math.round((await $.clock.now()) - t0));
  } catch {
    ms = "down";
  }
  out.netMs = ms;
  await $.fs.write(path, `${ms}|${nowS}\n`);
}
