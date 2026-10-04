// glint as a mod: the liquid-glass status line, living in the band above the prompt.
// It shows the facts Claude Code does not (effort, repo, branch, context against the
// compact window, account, quota pace, version, status, network, date) and speaks in
// light alone: a glint sweeps the glass while Claude works, the rim flashes on a failed
// tool or a finished turn and breathes under pressure. It never repeats what Claude Code
// already prints, and it wraps into a second pill instead of dropping a fact.

import { CAP_L, CAP_R, INK, STATE, cellsWidth, contextBar, easeTo, pillCells, short, slider, spans, springStep, stateColor, textWidth } from "./pill.mjs";
import { githubUrl, parseBranch, reserve, untilText } from "./sources.mjs";
import { AGENDA_DB, agendaArgv, agendaView, agendaWindow, dayTitle, hhmm, monthGrid, norm, parseAgenda, untilMs, wanted } from "./agenda.mjs";
import { calendarsArgv, eventsArgv, parseBuddyCalendars, parseBuddyEvents } from "./buddy.mjs";
import { BODY_CALENDARS, BODY_HOME, BODY_PRINCIPAL, CALDAV_BASE, authHeader, calendarData, dedupeSort, eventsBody, failureOf, hrefOf, parseCalendars, parseEnvFile, parseIcs, pickCalendars, trusted } from "./caldav.mjs";

const TTL = { version: 1800, status: 300, net: 60 };
const MEASURE_FRESH_S = 600;

const FRAME_MS = 50;
const REFRESH_MS = 30_000;
const FLASH_MS = 350;
const INTRO_MS = 900;
const SEP = { text: "   ", fg: INK.tert };
const EFFORT_INK = { low: "#f0be46", medium: "#30d758", high: "#4d9eff", xhigh: "#a78bfa", max: "#d26ef5", ultra: "#2dd7ff" };
// Two icon sets: the status line's Nerd Font set (the default) and plain Unicode that
// every font draws, for a phone or a font without Nerd glyphs (/glint icons plain).
const ICONS = {
  plain: { think: "✦", fast: "↯", folder: "", git: "⎇", worktree: "⎇", ctx: "", tag: "v", net: "⇅", warn: "!", user: "@", gauge: ["▲", "◆", "▼"] },
  nerd: { think: "\uf0eb", fast: "\uf0e7", folder: "\uf07b", git: "\ue725", worktree: "\uf126", ctx: "\uf1c0", tag: "\uf02b", net: "\u{f05a9}", warn: "\uf071", user: "\uf007", gauge: ["\u{f0f86}", "\u{f0f85}", "\u{f04c5}"] },
};
const icon = (name) => ICONS[s.icons]?.[name] ?? ICONS.plain[name];
const withSpace = (i) => (i ? `${i} ` : "");
// Nerd glyphs and ① draw wider than the one cell they are counted as and swallow
// the space after them, so they get two.
const gap = () => (s.icons === "nerd" ? "  " : " ");
const EFFORT_ICON = { low: "\u{f0f86}", medium: "\u{f0f85}", high: "\u{f04c5}", xhigh: "\u{f04c5}", max: "\u{f04c5}", ultra: "\u{f04c5}" };

const s = {
  home: "",
  sid: "",
  // One line another mod publishes for this session (~/.claude/.cache/glint/<session>.status).
  extra: "",
  model: "",
  version: "",
  modes: { effort: "", thinking: false, fast: false, reduceMotion: false },
  git: { project: "", branch: "", dirty: 0, files: [], worktree: false, repoUrl: null, upstream: false, ahead: 0, behind: 0, last: null },
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
  icons: "nerd",
  agenda: null,
  calendars: null,
  known: new Set(),
  warned: new Set(),
};
const SOON_MS = 15 * 60_000;
// The pill names an event only when it is on or about to be; the rest of the day and the
// month live in the clock's card.
const NEAR_MS = 60 * 60_000;
const WARN_MS = 10 * 60_000;

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
    // A measure that failed (401, account never measured) has no number: fall back to the session's own limits.
    const src = Number.isFinite(m?.[key]?.pct) ? m[key] : s.limits[key];
    if (!src || !Number.isFinite(src.pct)) return null;
    return { label, pct: Math.round(src.pct), resetsAt: src.resetsAt, reserve: reserve(src.pct, src.resetsAt, winS, nowS, mix ? s.measure?.history : null) };
  };
  return [pick("w5", "5h", 18_000, true), pick("w7", "7d", 604_800, false)].filter(Boolean);
}

// The facts, as blocks the packer can move between pills but never split.
// Below this width the context block sheds its token count and shortens its bar before
// anything wraps, as the status line does.
const NARROW_COLUMNS = 90;
const MAX_PILLS = 4;

// "40s", "12min", "3h", "2 dias"
function ago(sec) {
  if (sec < 60) return `${Math.max(0, sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  const d = Math.floor(sec / 86_400);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

function repoCard(nowS) {
  if (!s.git.branch) return null;
  const g = s.git;
  const lines = [[{ text: g.repoUrl ? g.repoUrl.replace(/^https:\/\//, "") : g.project, fg: INK.primary, bold: true }]];
  const sync = [g.ahead ? `${g.ahead} à frente` : "", g.behind ? `${g.behind} atrás` : ""].filter(Boolean).join(", ");
  lines.push([{ text: withSpace(icon(g.worktree ? "worktree" : "git")), fg: INK.second }, { text: g.branch, fg: INK.primary }, { text: sync ? `   ${sync} do remoto` : g.upstream ? "   em dia com o remoto" : g.repoUrl ? "   branch ainda não publicada" : "   sem remoto", fg: sync ? INK.amber : INK.tert }]);
  if (g.last) lines.push([{ text: `${g.last.hash} `, fg: INK.tert }, { text: clip(g.last.subject, 52), fg: INK.second }, { text: `  há ${ago(nowS - g.last.at)}`, fg: INK.tert }]);
  if (g.dirty) {
    lines.push([{ text: `${g.dirty} ${g.dirty === 1 ? "arquivo alterado" : "arquivos alterados"}`, fg: INK.amber }]);
    for (const f of g.files.slice(0, 4)) lines.push([{ text: `  ${f.code} `, fg: INK.amber }, { text: clip(f.path, 56), fg: INK.second }]);
    if (g.files.length > 4) lines.push([{ text: `  e mais ${g.files.length - 4}`, fg: INK.tert }]);
  }
  return lines;
}

export function blocks(now, columns) {
  const nowS = Math.floor(now / 1000);
  const narrow = columns < NARROW_COLUMNS;
  const out = [];
  const id = [{ text: s.model || "Claude", fg: INK.accent, bold: true }];
  if (s.modes.effort) id.push({ text: `  ${s.icons === "nerd" && EFFORT_ICON[s.modes.effort] ? EFFORT_ICON[s.modes.effort] : s.modes.effort}`, fg: EFFORT_INK[s.modes.effort] ?? INK.second });
  if (s.modes.thinking) id.push({ text: `${gap()}${icon("think")}`, fg: INK.gold });
  if (s.modes.fast) id.push({ text: `${gap()}${icon("fast")}`, fg: INK.second });
  out.push({ id: "identity", prio: 9, parts: id });
  const repo = repoCard(nowS);
  if (s.git.project) out.push({ id: "project", prio: 8, card: repo, parts: [{ text: withSpace(icon("folder")), fg: INK.second }, { text: s.git.project, href: s.git.repoUrl ?? undefined }] });
  if (s.git.branch) {
    const href = s.git.repoUrl ? `${s.git.repoUrl}/tree/${encodeURIComponent(s.git.branch).replace(/%2F/g, "/")}` : undefined;
    out.push({ id: "git", prio: 7, card: repo, parts: [{ text: withSpace(icon(s.git.worktree ? "worktree" : "git")), fg: INK.second }, { text: s.git.branch, href }, ...(s.git.dirty ? [{ text: ` •${s.git.dirty}`, fg: INK.amber }] : [])] });
  }
  if (s.ctx.window) {
    out.push({
      id: "context",
      prio: 8,
      parts: [
        { text: withSpace(icon("ctx")), fg: INK.second },
        ...contextBar(s.ctxShown, s.ctx.pct, narrow ? 5 : 8),
        { text: `  ${s.ctx.pct}%`, fg: stateColor(s.ctx.pct), bold: true },
        ...(narrow ? [] : [{ text: `  ${short(s.ctx.tokens)}`, fg: INK.primary }, { text: `/${short(s.ctx.window)}`, fg: INK.second }]),
      ],
    });
  }
  out.push(...usageBlocks(nowS));
  if (s.extra) out.push({ id: "extra", prio: 5, parts: [{ text: s.extra, fg: INK.second }] });
  out.push(...healthBlocks());
  const d = new Date(now);
  const stamp = { text: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`, fg: INK.second };
  const v = s.agenda ? agendaView(s.agenda, now) : null;
  out.push({ id: "clock", prio: v ? 6 : 1, parts: [...(v ? agendaParts(v, now) : []), stamp], card: v ? agendaCard(v, now) : monthCard(now) });
  return out;
}

function usageBlocks(nowS) {
  const parts = [];
  if (s.account.name) {
    const primary = s.account.preferred && s.account.name === s.account.preferred;
    const mark = !s.account.preferred ? icon("user") : primary ? "①" : "②";
    parts.push({ text: `${mark}  `, fg: !s.account.preferred ? INK.second : primary ? INK.accent : INK.amber, bold: true });
  }
  const wins = windows(nowS);
  const risky = wins.filter((w) => w.reserve !== null).sort((a, b) => a.reserve - b.reserve)[0];
  if (risky) {
    const level = risky.reserve >= 25 ? 0 : risky.reserve >= 0 ? 1 : 2;
    const ink = [STATE.green, STATE.yellow, STATE.red][level];
    parts.push({ text: `${icon("gauge")[level]}${gap()}`, fg: ink }, { text: `${risky.reserve >= 0 ? "+" : ""}${risky.reserve}  `, fg: INK.second });
  }
  for (const w of wins) {
    const atRisk = risky && w === risky && w.reserve < 25;
    if (atRisk && w.reserve < 0) parts.push({ text: `${icon("warn")} `, fg: STATE.red });
    parts.push({ text: `${w.label} `, fg: atRisk ? (w.reserve < 0 ? STATE.red : STATE.yellow) : INK.second, bold: atRisk });
    parts.push({ text: `${w.pct}%`, fg: limitInk(w.pct) });
    if (Number.isFinite(w.resetsAt) && (w.pct >= 80 || (w.reserve !== null && w.reserve < 0))) parts.push({ text: ` ↻${untilText(w.resetsAt, nowS)}`, fg: limitInk(w.pct) });
    parts.push({ text: "  " });
  }
  if (parts.length && parts[parts.length - 1].text === "  ") parts.pop();
  return parts.length ? [{ id: "usage", prio: 6, parts, card: usageCard(wins, nowS) }] : [];
}

function usageCard(wins, nowS) {
  if (!wins.length) return null;
  const lines = [[{ text: "Cota", fg: INK.primary, bold: true }, ...(s.account.name ? [{ text: `   conta ${s.account.name}`, fg: INK.tert }] : [])]];
  for (const w of wins) {
    const line = [{ text: `${w.label.padEnd(3)} `, fg: INK.second }, ...slider(w.pct, 12, limitInk(w.pct)), { text: `  ${String(w.pct).padStart(3)}%`, fg: limitInk(w.pct), bold: true }];
    if (Number.isFinite(w.resetsAt)) line.push({ text: `   volta em ${untilText(w.resetsAt, nowS)}`, fg: INK.second });
    if (w.reserve !== null) line.push({ text: `   reserva ${w.reserve >= 0 ? "+" : ""}${w.reserve}`, fg: w.reserve < 0 ? STATE.red : w.reserve < 25 ? STATE.yellow : INK.tert });
    lines.push(line);
  }
  return lines;
}

const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// The calendar rides in the clock block, in front of the date and time it shares: what
// is on now with a bar to its end, or what starts within the hour; otherwise nothing.
function agendaParts(v, now) {
  const ev = v.now ?? (v.next && v.next.start - now <= NEAR_MS ? v.next : null);
  if (!ev) return [];
  const ink = ev.color ?? INK.accent;
  const parts = [{ text: "● ", fg: ink }];
  if (v.now) {
    const pct = Math.round(((now - ev.start) / Math.max(1, ev.end - ev.start)) * 100);
    parts.push({ text: clip(ev.title, 18), fg: INK.primary }, { text: " " }, ...slider(pct, 5, ink), { text: ` ${untilMs(ev.end - now)}`, fg: INK.second });
  } else if (ev.start - now <= SOON_MS) {
    parts.push({ text: `${clip(ev.title, 18)} em ${untilMs(ev.start - now)}`, fg: STATE.orange, bold: true });
  } else {
    parts.push({ text: `${hhmm(ev.start)} `, fg: INK.second }, { text: clip(ev.title, 18), fg: INK.primary });
  }
  parts.push({ text: "   " });
  return parts;
}

function agendaCard(v, now) {
  const list = dayList(v, now);
  const month = monthGrid(now, s.agenda ?? [], { today: INK.accent, busy: INK.primary, past: INK.tert, free: INK.second, head: INK.second });
  return { lines: sideBySide(month, list, 24), compact: list };
}

// Without a calendar to read, the clock's card is the month alone.
function monthCard(now) {
  return monthGrid(now, [], { today: INK.accent, busy: INK.primary, past: INK.tert, free: INK.second, head: INK.second });
}

function sideBySide(left, right, gutter) {
  const n = Math.max(left.length, right.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const l = left[i] ?? [];
    out.push([...l, { text: " ".repeat(Math.max(1, gutter - textWidth(l))) }, ...(right[i] ?? [])]);
  }
  return out;
}

function dayList(v, now) {
  const lines = [[{ text: dayTitle(now), fg: INK.primary, bold: true }]];
  const width = Math.min(34, Math.max(20, ...v.today.map((e) => e.title.length)));
  if (!v.today.length) lines.push([{ text: "nada na sua agenda hoje", fg: INK.tert }]);
  for (const e of v.today) {
    const past = e.end <= now;
    const live = v.now && e.id === v.now.id;
    const ink = past ? INK.tert : (e.color ?? INK.second);
    const right = live ? `agora, até ${hhmm(e.end)}` : past ? "" : e.allDay ? "o dia todo" : `em ${untilMs(e.start - now)}`;
    lines.push([
      { text: e.allDay ? " dia " : `${hhmm(e.start)} `, fg: ink },
      { text: past ? " ✓ " : live ? " ● " : " ○ ", fg: ink },
      { text: clip(e.title, 34).padEnd(width), fg: past ? INK.tert : INK.primary, bold: Boolean(live) },
      { text: right ? `   ${right}` : "", fg: INK.second },
    ]);
  }
  if (v.tomorrow.length) {
    lines.push([{ text: "─".repeat(width + 9), fg: INK.tert }]);
    lines.push([{ text: "amanhã", fg: INK.tert }]);
    for (const e of v.tomorrow.slice(0, 3)) lines.push([{ text: `${e.allDay ? " dia " : `${hhmm(e.start)} `}`, fg: e.color ?? INK.second }, { text: ` ○ ${clip(e.title, 34)}`, fg: INK.second }]);
  }
  return lines;
}

// A toast once per event, ten minutes before it starts.
function warnSoon($, now) {
  for (const e of s.agenda ?? []) {
    if (e.allDay || e.start <= now || e.start - now > WARN_MS || s.warned.has(e.id)) continue;
    s.warned.add(e.id);
    $.ui.toast(`${e.title} começa em ${untilMs(e.start - now)} (${hhmm(e.start)})`);
  }
}

function healthBlocks() {
  const out = [];
  if (s.version) {
    const behind = s.net.latest && s.net.latest !== s.version;
    const minor = behind && s.net.latest.split(".").slice(0, 2).join(".") === s.version.split(".").slice(0, 2).join(".");
    const ink = !behind ? INK.second : minor ? STATE.yellow : STATE.red;
    const card = [[{ text: "Claude Code", fg: INK.primary, bold: true }, { text: `   instalada ${s.version}`, fg: INK.second }]];
    if (behind) card.push([{ text: "nova versão ", fg: INK.second }, { text: s.net.latest, fg: ink, bold: true }], [{ text: "atualize com ", fg: INK.tert }, { text: "claude update", fg: INK.primary }]);
    else if (s.net.latest) card.push([{ text: "você está na versão mais nova", fg: STATE.green }]);
    card.push([{ text: "o que mudou: ", fg: INK.tert }, { text: `github.com/anthropics/claude-code/releases`, fg: INK.second }]);
    out.push({ id: "version", prio: 3, card, parts: [{ text: icon("tag") === "v" ? "v" : withSpace(icon("tag")), fg: INK.second }, { text: s.version, fg: ink, href: `https://github.com/anthropics/claude-code/releases/tag/v${behind ? s.net.latest : s.version}` }] });
  }
  const stInk = { none: STATE.green, minor: STATE.yellow, major: STATE.orange, critical: STATE.red }[s.net.status] ?? INK.tert;
  const health = healthCard(stInk);
  if (s.net.status) out.push({ id: "status", prio: 3, card: health, parts: [{ text: `●${s.net.status !== "none" && s.net.degraded ? ` ${s.net.degraded}` : ""}`, fg: stInk, href: "https://status.claude.com" }] });
  if (s.net.netMs) {
    const ms = Number(s.net.netMs);
    const ink = s.net.netMs === "down" ? STATE.red : ms <= 300 ? STATE.green : ms <= 1000 ? STATE.yellow : STATE.orange;
    out.push({ id: "net", prio: 2, card: health, parts: [{ text: icon("net"), fg: ink }] });
  }
  return out;
}

const STATUS_TEXT = { none: "tudo operando", minor: "instabilidade leve", major: "instabilidade forte", critical: "fora do ar" };

function healthCard(stInk) {
  const lines = [[{ text: "Claude", fg: INK.primary, bold: true }, { text: "   status.claude.com", fg: INK.tert }]];
  if (s.net.status) lines.push([{ text: "● ", fg: stInk }, { text: STATUS_TEXT[s.net.status] ?? s.net.status, fg: stInk, bold: s.net.status !== "none" }]);
  for (const name of s.net.degraded ? s.net.degraded.split(",").slice(0, 4) : []) lines.push([{ text: "  afetado: ", fg: INK.tert }, { text: name, fg: INK.primary }]);
  if (s.net.netMs) lines.push([{ text: "API ", fg: INK.second }, { text: s.net.netMs === "down" ? "sem resposta" : `${s.net.netMs} ms`, fg: s.net.netMs === "down" ? STATE.red : INK.primary }]);
  return lines;
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
  return pillBlocks.flatMap((b, i) => {
    const own = b.parts.map((p) => ({ ...p, block: b.id }));
    return i ? [SEP, ...own] : own;
  });
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
  s.account = (await safely(() => readAccount($, s.home))) ?? s.account;
  s.extra = (await safely(() => readExtra($, s.home, s.sid, nowS))) ?? "";
  s.measure = (await safely(() => readMeasure($, s.home, s.account.name, nowS))) ?? s.measure;
  const agenda = await safely(() => readAgenda($, s.home, nowS * 1000, s.calendars));
  if (agenda !== undefined) s.agenda = agenda;
  warnSoon($, nowS * 1000);
  $.ui.invalidate("ui.render");
}

export function state() {
  return s;
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    const r = await next(e);
    await $.command.register({ name: "glint", description: "glint pill: on, off, or demo", argumentHint: "on | off | demo | icons nerd | icons plain | agenda [show|hide <calendar> | reset]" });
    s.home = (await $.env.get("HOME")) ?? "";
    s.sid = (await safely(() => $.session.id())) ?? "";
    s.model = prettyModel(await $.session.model());
    s.version = (await safely(async () => (await $.session.version()).version)) ?? "";
    s.account = (await safely(() => readAccount($, s.home))) ?? s.account;
    const usage = await safely(() => $.session.usage());
    if (usage) applyMeasure(usage, await compactWindow($));
    // $.store, not $.state: $.state lives one session, and a choice made with
    // /glint has to hold in the next one.
    const prefs = await $.store.get("prefs");
    s.off = prefs?.on === false;
    s.icons = prefs?.icons === "plain" ? "plain" : "nerd";
    s.calendars = Array.isArray(prefs?.calendars) ? prefs.calendars : null;
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
      await savePrefs($);
      if (s.off) stopFrames();
      else animate($, await $.clock.now());
      $.ui.invalidate("ui.render");
      return { text: `glint ${arg}` };
    }
    if (arg === "icons nerd" || arg === "icons plain") {
      s.icons = arg.split(" ")[1];
      await savePrefs($);
      $.ui.invalidate("ui.render");
      return { text: `glint icons: ${s.icons}` };
    }
    if (arg === "demo") {
      runDemo($);
      return { text: "glint demo: about 12 seconds" };
    }
    if (arg === "agenda" || arg.startsWith("agenda ")) return { text: await agendaCommand($, arg.slice(6).trim()) };
    return { text: "usage: /glint on | off | demo | icons nerd | icons plain | agenda [show|hide <calendar> | reset]" };
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
  // A blank row above keeps the pill off the text over it, when the rows allow it.
  const rowsFree = e.props.maxRows ?? MAX_PILLS + 1;
  const top = rowsFree >= 2 ? 1 : 0;
  const maxPills = Math.max(1, Math.min(MAX_PILLS, rowsFree - top));
  const inner = columns - 8;
  s.ctxShown = s.modes.reduceMotion ? s.ctx.pct : easeTo(s.ctxShown, s.ctx.pct);
  const pills = pack(blocks(now, columns), inner, maxPills);
  const cards = [];
  const cardRows = Math.max(0, rowsFree - top - pills.length);
  const rows = pills.map((pb, i) => {
    const segs = segmentsOf(pb);
    s.targets[i] = Math.min(columns - 4, textWidth(segs) + 4);
    const intro = now < s.introUntil ? Math.max(0.15, 1 - (s.introUntil - now) / INTRO_MS) : 1;
    const goal = s.targets[i] * intro;
    s.widths[i] = s.modes.reduceMotion || s.widths[i] === undefined ? goal : springStep(s.widths[i], goal);
    if (now >= s.introUntil && Math.abs(s.widths[i] - s.targets[i]) < 0.5) s.widths[i] = s.targets[i];
    const cells = pillCells(segs, s.widths[i], look(now, i, s.widths[i]));
    const withCard = new Map(pb.filter((b) => b.card).map((b) => [b.id, b.card]));
    const middle = [];
    let col = 2;
    let group = null;
    spans(cells).forEach((p, k) => {
      const t = Text({ key: `t${k}`, color: p.fg, backgroundColor: p.bg, bold: p.bold, children: p.text });
      const el = p.href ? Link({ key: `l${k}`, href: p.href, children: [t] }) : t;
      if (p.block && withCard.has(p.block)) {
        if (!group || group.id !== p.block) {
          group = { id: p.block, children: [] };
          middle.push(group);
          const card = cardBox($, e, p.block, withCard.get(p.block), col, columns, cardRows);
          if (card) cards.push(card);
        }
        group.children.push(el);
      } else {
        group = null;
        middle.push(el);
      }
      col += p.w;
    });
    for (let k = 0; k < middle.length; k++) {
      const g = middle[k];
      if (g.id) middle[k] = Box({ key: `hv-${g.id}`, flexDirection: "row", hover: { scope: `glint-${g.id}` }, children: g.children });
    }
    return Box({ key: `pill${i}`, flexDirection: "row", children: [Text({ key: "cl", color: cells[0]?.bg, children: CAP_L }), ...middle, Text({ key: "cr", color: cells[cells.length - 1]?.bg, children: CAP_R })] });
  });
  s.widths.length = pills.length;
  s.targets.length = pills.length;
  return Box({ flexDirection: "column", paddingX: 1, paddingTop: top, children: [...cards, ...rows] });
}

// Cuts a card row to `max` cells, so a card never runs past the band and wraps into
// rows it was not given.
function clipLine(segs, max) {
  if (textWidth(segs) <= max) return segs;
  const out = [];
  let used = 0;
  for (const seg of segs) {
    let text = "";
    for (const ch of seg.text) {
      const w = textWidth([{ text: ch }]);
      if (used + w > max - 1) {
        out.push({ ...seg, text: `${text}…` });
        return out;
      }
      text += ch;
      used += w;
    }
    out.push({ ...seg, text });
  }
  return out;
}

// A block's card: drawn hidden above the pills and revealed while the pointer is on the
// block. The band clips anything placed outside its rows, so the card sits in them and
// the band grows upward for as long as the hover lasts.
function cardBox($, e, id, card, col, columns, rowsFree) {
  const { Box, Text } = $.ui.resolve(e);
  const room = rowsFree - 2;
  // A card may carry a compact form for a band too short for the full one.
  const full = Array.isArray(card) ? card : card?.lines;
  const lines = full && full.length > room && card.compact ? card.compact : full;
  if (!lines?.length || room < 1) return null;
  const max = Math.max(8, columns - 6);
  const shown = lines.slice(0, room).map((l) => clipLine(l, max));
  const width = Math.max(...shown.map((l) => textWidth(l))) + 4;
  const left = Math.max(0, Math.min(col - 2, columns - 2 - width));
  return Box({
    key: `card-${id}`,
    flexDirection: "column",
    alignSelf: "flex-start",
    marginLeft: left,
    borderStyle: "round",
    borderColor: INK.tert,
    paddingX: 1,
    display: "none",
    hover: { display: "flex", scope: `glint-${id}` },
    children: shown.map((l, i) => Box({ key: `r${i}`, flexDirection: "row", children: l.map((seg, k) => Text({ key: `s${k}`, color: seg.fg, backgroundColor: seg.bg, bold: seg.bold, children: seg.text })) })),
  });
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

// The agenda: from the Central's database where there is one, otherwise live, from the
// Calendar app of this Mac (icalBuddy) or, failing that, straight from iCloud over CalDAV.
async function readAgenda($, home, nowMs, calendars) {
  const db = `${home}/${AGENDA_DB}`;
  if (!(await $.fs.exists(db))) return readLive($, home, nowMs, calendars);
  const r = await $.process.run(agendaArgv(db, nowMs), { timeoutMs: 3000 });
  return r.exitCode === 0 ? parseAgenda(r.stdout, calendars, s.known) : null;
}

// How long a live read stays fresh: the Calendar app is local and cheap, iCloud is not.
const LIVE_TTL_MS = { buddy: 60_000, caldav: 5 * 60_000, retry: 60_000 };
const NO_EXPAND = [400, 403, 415, 501];
const CALDAV_FILE = ".config/glint/caldav.env";
const caldav = { home: null, calendars: null };
const live = { at: 0, ttl: 0, pending: false, via: "", status: "" };

// The Apple ID and app-specific password: the environment first, then the file.
async function caldavCredentials($, home) {
  let email = await $.env.get("APPLE_ID_EMAIL");
  let password = await $.env.get("APPLE_APP_PASSWORD");
  if (!email || !password) {
    const file = parseEnvFile(await $.fs.read(`${home}/${CALDAV_FILE}`).catch(() => ""));
    email = email || file.APPLE_ID_EMAIL;
    password = password || file.APPLE_APP_PASSWORD;
  }
  return email && password ? { email: email.trim(), password: password.trim() } : null;
}

// Answers with what it has and syncs behind it, so a slow source never holds the session
// start: the pill shows the agenda as soon as the first sync lands.
function readLive($, home, nowMs, chosen) {
  if (!live.pending && nowMs - live.at >= live.ttl) {
    live.pending = true;
    live.at = nowMs;
    syncLive($, home, nowMs, chosen)
      .then(({ kind, rows }) => {
        s.agenda = rows;
        live.ttl = LIVE_TTL_MS[kind];
        live.status = `${live.via}, ${rows.length} compromissos`;
        $.ui.invalidate("ui.render");
      })
      .catch((err) => {
        live.ttl = LIVE_TTL_MS.retry;
        live.status = `erro: ${err?.message || "falhou"}`;
      })
      .finally(() => {
        live.pending = false;
      });
  }
  return s.agenda;
}

async function syncLive($, home, nowMs, chosen) {
  const mac = await syncBuddy($, nowMs, chosen);
  if (mac) {
    live.via = "Calendário do macOS";
    return { kind: "buddy", rows: mac };
  }
  const creds = await caldavCredentials($, home);
  if (!creds) throw new Error(`sem o Calendário do macOS (icalBuddy) e sem credenciais do iCloud: ${CALDAV_FILE} com APPLE_ID_EMAIL e APPLE_APP_PASSWORD`);
  live.via = "iCloud direto";
  return { kind: "caldav", rows: await syncCaldav($, creds, nowMs, chosen) };
}

// null where icalBuddy is missing or macOS refuses it, so the caller falls back.
async function syncBuddy($, nowMs, chosen) {
  const list = await $.process.run(calendarsArgv(), { timeoutMs: 5000 }).catch(() => null);
  const names = list?.exitCode === 0 ? parseBuddyCalendars(list.stdout) : [];
  if (!names.length) return null;
  for (const name of names) s.known.add(name);
  const picked = names.filter((name) => wanted(name, chosen));
  if (!picked.length) return [];
  const [from, to] = agendaWindow(nowMs);
  const r = await $.process.run(eventsArgv(picked, from, to), { timeoutMs: 15_000 });
  if (r.exitCode !== 0) throw new Error("icalBuddy falhou");
  return dedupeSort(parseBuddyEvents(r.stdout));
}

async function syncCaldav($, creds, nowMs, chosen) {
  const auth = authHeader(creds.email, creds.password);
  const send = async (method, url, body, depth) => {
    if (!trusted(url)) throw new Error("destino fora do iCloud");
    const r = await $.http.fetch(url, { method, headers: { Authorization: auth, Depth: depth, "Content-Type": "application/xml; charset=utf-8" }, body });
    if (r.status !== 207 && !r.ok) throw Object.assign(new Error(failureOf(r.status)), { status: r.status });
    return r;
  };
  if (!caldav.calendars) {
    const principal = hrefOf((await send("PROPFIND", CALDAV_BASE, BODY_PRINCIPAL, "0")).text, "current-user-principal");
    if (!principal) throw new Error("iCloud sem principal");
    const home = hrefOf((await send("PROPFIND", new URL(principal, CALDAV_BASE).toString(), BODY_HOME, "0")).text, "calendar-home-set");
    if (!home) throw new Error("iCloud sem calendar-home-set");
    caldav.home = new URL(home, CALDAV_BASE).toString();
    caldav.calendars = parseCalendars((await send("PROPFIND", caldav.home, BODY_CALENDARS, "1")).text, caldav.home);
    for (const c of caldav.calendars) s.known.add(c.name);
  }
  const [from, to] = agendaWindow(nowMs);
  const rows = [];
  for (const cal of pickCalendars(caldav.calendars, (name) => wanted(name, chosen))) {
    const r = await send("REPORT", cal.url, eventsBody(from, to), "1").catch((err) => (NO_EXPAND.includes(err.status) ? send("REPORT", cal.url, eventsBody(from, to, false), "1") : Promise.reject(err)));
    for (const ics of calendarData(r.text)) rows.push(...parseIcs(ics, cal));
  }
  return dedupeSort(rows);
}

const savePrefs = ($) => $.store.set("prefs", { on: !s.off, icons: s.icons, calendars: s.calendars });

// show / hide / reset change the list; the answer is an error text, or null when it changed.
function chooseCalendars(verb, name) {
  if (verb === "reset") {
    s.calendars = null;
    return null;
  }
  const hit = [...s.known].find((k) => norm(k) === norm(name));
  if (!hit) return `calendário "${name}" não encontrado. Conhecidos: ${[...s.known].join(", ") || "(ainda sem lista, o primeiro sync não terminou)"}`;
  const now = [...s.known].filter((k) => wanted(k, s.calendars));
  s.calendars = verb === "show" ? [...new Set([...now, hit])] : now.filter((k) => k !== hit);
  return null;
}

// /glint agenda: where the agenda comes from and which calendars show. show, hide and
// reset save the list (in $.store, so it holds in the next session) and resync at once.
async function agendaCommand($, rest) {
  const [verb, ...words] = rest.split(/\s+/).filter(Boolean);
  if (["show", "hide", "reset"].includes(verb)) {
    const error = chooseCalendars(verb, words.join(" "));
    if (error) return `glint agenda: ${error}`;
    await savePrefs($);
    live.at = 0;
    await refresh($);
  }
  const shown = [...s.known].filter((k) => wanted(k, s.calendars));
  const hidden = [...s.known].filter((k) => !wanted(k, s.calendars));
  const source = live.status || (s.agenda ? "banco da Central" : "sem fonte");
  return `glint agenda: ${source}. Mostra: ${shown.join(", ") || "nenhum"}. Oculta: ${hidden.join(", ") || "nenhum"}`;
}

async function readGit($) {
  const cwd = await $.session.cwd();
  const top = await $.process.run(["git", "rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"], { cwd, timeoutMs: 3000 });
  if (top.exitCode !== 0) return { project: base(cwd), branch: "", dirty: 0, worktree: false, repoUrl: null };
  const [root, gitDir, commonDir] = top.stdout.trim().split("\n");
  const abs = (p) => (p.startsWith("/") ? p : `${cwd}/${p}`);
  const worktree = abs(gitDir) !== abs(commonDir);
  const project = worktree ? base(abs(commonDir).replace(/\/\.git\/?$/, "")) : base(root);
  const [st, remote, log] = await Promise.all([
    $.process.run(["git", "status", "--porcelain", "-b"], { cwd, timeoutMs: 3000 }),
    $.process.run(["git", "remote", "get-url", "origin"], { cwd, timeoutMs: 3000 }),
    $.process.run(["git", "log", "-1", "--format=%h%x1f%s%x1f%ct"], { cwd, timeoutMs: 3000 }),
  ]);
  const [head, ...rest] = st.stdout.split("\n");
  const files = rest.filter(Boolean).map((l) => ({ code: l.slice(0, 2).trim() || "?", path: l.slice(3) }));
  const [hash, subject, when] = log.exitCode === 0 ? log.stdout.trim().split("\x1f") : [];
  return {
    project,
    branch: parseBranch(head),
    dirty: files.length,
    files,
    worktree,
    repoUrl: githubUrl(remote.stdout.trim()),
    upstream: head.includes("..."),
    ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
    last: hash ? { hash, subject, at: Number(when) } : null,
  };
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
  // A mod that sets the effort per request (a router) publishes what it applied; that beats the setting.
  const applied = s.sid ? (await $.fs.read(`${s.home}/.claude/.cache/glint/${s.sid}.effort`).catch(() => "")).trim() : "";
  if (EFFORT_INK[applied]) out.effort = applied;
  return out;
}

// One line another mod publishes for this session, shown while fresh (5 min).
async function readExtra($, home, sid, nowS) {
  if (!sid) return "";
  const p = `${home}/.claude/.cache/glint/${sid}.status`;
  const st = await $.fs.stat(p).catch(() => null);
  if (!st || nowS - st.mtimeMs / 1000 > 300) return "";
  return (await $.fs.read(p)).split("\n")[0].trim().slice(0, 80);
}

async function readJson($, path) {
  try {
    return JSON.parse(await $.fs.read(path));
  } catch {
    return null;
  }
}

async function readAccount($, home) {
  // The native login this Claude Code really runs on, from its own config.
  const email = String((await readJson($, `${home}/.claude.json`))?.oauthAccount?.emailAddress ?? "");
  const dir = `${home}/.config/claude-account`;
  if (!(await $.fs.exists(`${dir}/profiles`))) return { name: email.split("@")[0], preferred: "" };
  const policy = await readJson($, `${dir}/policy.json`);
  const preferred = String(policy?.preferred ?? "");
  const token = await $.env.get("CLAUDE_CODE_OAUTH_TOKEN");
  let name = "";
  if (token) {
    const fp = (await $.process.run(["shasum", "-a", "256"], { stdin: token, timeoutMs: 3000 })).stdout.slice(0, 12);
    const cache = await $.fs.read(`${home}/.claude/.cache/statusline-account-fp`).catch(() => "");
    name = cache.split("\n").find((l) => l.startsWith(`${fp} `))?.split(" ")[1] ?? "token?";
  } else {
    // Profiles archived from that login; when two hold it, the switcher's active one, then the preferred.
    const matches = [];
    for (const e of await $.fs.list(`${dir}/profiles`)) {
      if (!e.name.endsWith(".json")) continue;
      const p = await readJson($, `${dir}/profiles/${e.name}`);
      if (p?.type === "native_archive" && email && String(p.label ?? "").includes(email)) matches.push(p.name);
    }
    const active = (await $.fs.read(`${dir}/active`).catch(() => "")).trim();
    name = matches.includes(active) ? active : matches.includes(preferred) ? preferred : matches.sort()[0] ?? (email.split("@")[0] || "nativo");
  }
  return { name, preferred };
}

// Number(null) is 0, which would paint a failed measure as 0% used.
const measuredPct = (v) => (v == null ? NaN : Number(v));

async function readMeasure($, home, account, nowS) {
  const m = await readJson($, `${home}/.config/claude-account/measure.json`);
  if (!m || !account) return null;
  const at = Date.parse(m.measured_at ?? "") / 1000;
  const p = m.profiles?.[account];
  return {
    fresh: Boolean(p && nowS - at < MEASURE_FRESH_S),
    w5: p ? { pct: measuredPct(p.util_5h), resetsAt: Number(p.reset_5h) } : null,
    w7: p ? { pct: measuredPct(p.util_7d), resetsAt: Number(p.reset_7d) } : null,
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
