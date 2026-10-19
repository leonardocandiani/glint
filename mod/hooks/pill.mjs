// Pure drawing: segments in, styled cells and raster rows out. No $ here, so every frame is testable.

export const INK = { primary: "#f2f2f5", second: "#a2a2aa", tert: "#686870", accent: "#0a84ff", amber: "#e8a33d", gold: "#ffc83c" };
export const STATE = { green: "#30d758", yellow: "#ffd60a", orange: "#ff9f0a", red: "#ff453a" };
const BODY = [50, 50, 58];
const RIM = [96, 100, 118];
const SPECULAR = [214, 222, 245];
const EDGE_PEAK = 0.68;
export const CAP_L = "";
export const CAP_R = "";

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (c) => c.map((v) => Math.max(0, Math.min(255, v)));
const hex = (c) => `#${clamp(c).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

// Terminal cells a character takes: 0 for combining marks and selectors, 2 for wide
// scripts and emoji, 1 otherwise. Nerd Font icons (private use) and circled digits like
// ① are budgeted as 2: some terminals draw them across two cells, and a pill measured
// at one cell each ran past the edge and wrapped its cap onto the next line.
export function cellWidth(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0x300 && c <= 0x36f) || (c >= 0x200b && c <= 0x200f) || (c >= 0xfe00 && c <= 0xfe0f)) return 0;
  if (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd) ||
    (c >= 0x2460 && c <= 0x24ff) ||
    (c >= 0xe000 && c <= 0xf8ff) ||
    (c >= 0xf0000 && c <= 0xffffd)
  ) return 2;
  return 1;
}

export function textWidth(segments) {
  let n = 0;
  for (const s of segments) for (const ch of s.text) n += cellWidth(ch);
  return n;
}

export function stateColor(pct) {
  if (pct >= 90) return STATE.red;
  if (pct >= 75) return STATE.orange;
  if (pct >= 50) return STATE.yellow;
  return STATE.green;
}

// Light across the glass at column k of n: rim light at both ends, dark body in the
// middle, a cold tint; the glint is a moving specular highlight.
export function glassRgb(k, n, look) {
  const t = n > 1 ? k / (n - 1) : 0.5;
  const d = 2 * t - 1;
  let rim = RIM;
  if (look.tint) rim = mix(rim, rgb(look.tint), look.tintStrength ?? 0.6);
  if (look.flash) rim = mix(rim, rgb(look.flash.color), look.flash.strength);
  let c = mix(BODY, rim, EDGE_PEAK * d * d);
  if (look.glintAt !== undefined) {
    c = mix(c, SPECULAR, Math.exp(-(((k - look.glintAt) / 4) ** 2)) * 0.32);
  }
  return [c[0] - 5, c[1], c[2] + 9];
}

export function glassAt(k, n, look) {
  return hex(glassRgb(k, n, look));
}

// Segments are joined, padded, then clipped or padded to the animated width (in cells),
// so the pill can grow and shrink like a spring without re-laying its content out.
export function pillCells(segments, width, look) {
  const flat = [];
  for (const s of segments) for (const ch of s.text) flat.push({ ch, w: cellWidth(ch), fg: s.fg ?? INK.primary, bold: Boolean(s.bold), href: s.href, block: s.block });
  const inner = Math.max(1, Math.round(width) - 4);
  let used = 0;
  let body = [];
  const full = flat.reduce((n, c) => n + c.w, 0);
  if (full <= inner) {
    body = flat;
    used = full;
  } else {
    for (const c of flat) {
      if (used + c.w > inner - 1) break;
      body.push(c);
      used += c.w;
    }
    body.push({ ch: "…", w: 1, fg: INK.second, bold: false });
    used += 1;
  }
  const padLeft = Math.floor((inner - used) / 2);
  const cells = [];
  const pad = (n) => {
    for (let i = 0; i < n; i++) cells.push({ ch: " ", w: 1, fg: INK.tert, bold: false });
  };
  pad(2 + Math.max(0, padLeft));
  cells.push(...body);
  pad(2 + Math.max(0, inner - used - padLeft));
  const n = cells.reduce((m, c) => m + c.w, 0);
  let k = 0;
  return cells.map((c) => {
    const out = { ...c, bg: glassAt(k, n, look) };
    k += c.w;
    return out;
  });
}

export function cellsWidth(cells) {
  return cells.reduce((n, c) => n + c.w, 0);
}

// Consecutive cells with the same style, link and block become one span, which keeps the
// tree small; the block lets the drawing wrap each block in its own hover area.
export function spans(cells) {
  const out = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold && last.href === c.href && last.block === c.block) {
      last.text += c.ch;
      last.w += c.w;
    } else out.push({ text: c.ch, w: c.w, fg: c.fg, bg: c.bg, bold: c.bold, href: c.href, block: c.block });
  }
  return out;
}

export function springStep(current, target) {
  const next = current + (target - current) * 0.35;
  return Math.abs(target - next) < 0.5 ? target : next;
}

export function easeTo(current, target, rate = 0.25) {
  const next = current + (target - current) * rate;
  return Math.abs(target - next) < 0.2 ? target : next;
}

export function short(n) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function contextBar(pctShown, pct, cells) {
  return slider(pctShown, cells, stateColor(pct));
}

// The status line's slider: heavy line up to a knob ● riding the fill, thin track after.
export function slider(pctShown, cells, color) {
  const shown = Math.max(0, Math.min(100, pctShown));
  let knob = Math.round((shown * cells) / 100);
  if (shown > 0 && knob === 0) knob = 1;
  const out = [];
  for (let i = 1; i <= cells; i++) {
    if (i < knob) out.push({ text: "━", fg: color });
    else if (i === knob) out.push({ text: "●", fg: color });
    else out.push({ text: "─", fg: INK.tert });
  }
  return out;
}
